// The MCP endpoint inside workerd, driven the way an MCP client drives it: initialize, notifications,
// tools/list, tools/call for reads and writes, auth on writes, and JSON-RPC errors.

import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { adminAuth, applyRepoMigrations } from "../../repo-store/server/test-helpers.ts";
import { MCP_PROTOCOL_VERSION, TOOLS } from "./mcp.ts";

interface RpcResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: Record<string, unknown>;
	error?: { code: number; message: string };
}

interface ToolResult {
	content: { type: string; text: string }[];
	structuredContent: Record<string, unknown>;
	isError: boolean;
}

let nextId = 1;

async function rpc(method: string, params?: unknown, auth = false): Promise<{ status: number; body: RpcResponse }> {
	const res = await exports.default.fetch("http://taru.test/mcp", {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(auth ? { Authorization: adminAuth() } : {}) },
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});
	return { status: res.status, body: await res.json<RpcResponse>() };
}

async function tool(name: string, args: unknown, auth = false): Promise<ToolResult> {
	const { body } = await rpc("tools/call", { name, arguments: args }, auth);
	expect(body.error, JSON.stringify(body.error)).toBeUndefined();
	return body.result as unknown as ToolResult;
}

describe("MCP over Streamable HTTP", () => {
	beforeAll(applyRepoMigrations);

	it("initializes, accepts notifications, and lists the tools", async () => {
		const init = await rpc("initialize", { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "0" } });
		expect(init.status).toBe(200);
		expect(init.body.result).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "taru" } });
		expect(init.body.result?.instructions).toContain("expected_head");

		const older = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } });
		expect(older.body.result?.protocolVersion).toBe("2025-03-26");

		const notified = await exports.default.fetch("http://taru.test/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
		});
		expect(notified.status).toBe(202);

		expect((await rpc("ping")).body.result).toEqual({});
		const list = await rpc("tools/list");
		const tools = list.body.result?.tools as { name: string; inputSchema: { required?: string[] } }[];
		expect(tools.map((t) => t.name)).toEqual(["list_repos", "read_tree", "read_file", "read_log", "read_commit", "commit_changes", "merge_branches"]);
		expect(tools.find((t) => t.name === "commit_changes")?.inputSchema.required).toEqual(["repo", "branch", "expected_head", "message", "changes"]);
		expect(TOOLS.filter((t) => t.write).map((t) => t.name)).toEqual(["commit_changes", "merge_branches"]);
	});

	it("answers protocol mistakes with JSON-RPC errors", async () => {
		expect((await rpc("nope")).body.error).toMatchObject({ code: -32601 });
		expect((await rpc("tools/call", { name: "nope", arguments: {} })).body.error).toMatchObject({ code: -32602 });
		const notJson = await exports.default.fetch("http://taru.test/mcp", { method: "POST", body: "{" });
		expect(notJson.status).toBe(400);
		expect((await notJson.json<RpcResponse>()).error?.code).toBe(-32700);
		const batch = await exports.default.fetch("http://taru.test/mcp", { method: "POST", body: "[]" });
		expect(batch.status).toBe(400);
		expect((await exports.default.fetch("http://taru.test/mcp")).status).toBe(405);
	});

	it("reads, commits and merges through tools, and refuses writes without the token", async () => {
		const created = await exports.default.fetch("http://taru.test/api/repos", {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: adminAuth() },
			body: JSON.stringify({ owner: "mcp", name: "demo" }),
		});
		expect(created.status).toBe(201);

		const repos = await tool("list_repos", {});
		expect(repos.isError).toBe(false);
		expect((repos.structuredContent.repos as { repo: string; clone_url: string }[]).find((r) => r.repo === "mcp/demo")?.clone_url).toBe("http://taru.test/mcp/demo.git");

		const denied = await rpc("tools/call", { name: "commit_changes", arguments: { repo: "mcp/demo", branch: "main", expected_head: null, message: "x", changes: [{ path: "a", content: "a" }] } });
		expect(denied.status).toBe(401);
		expect(denied.body.error).toMatchObject({ code: -32001 });
		expect((await rpc("tools/call", { name: "merge_branches", arguments: { repo: "mcp/demo", into: "main", from: "x" } })).status).toBe(401);

		const first = await tool(
			"commit_changes",
			{
				repo: "mcp/demo",
				branch: "main",
				expected_head: null,
				message: "first through MCP",
				changes: [
					{ path: "README.md", content: "# MCP\n" },
					{ path: "src/lib/util.ts", content: "export const add = (a: number, b: number) => a + b;\n" },
					{ path: "bin/data.bin", content_base64: btoa("\0\x01\x02") },
				],
			},
			true,
		);
		expect(first.isError).toBe(false);
		expect(first.structuredContent).toMatchObject({ branch: "refs/heads/main", parent: null });
		expect(JSON.parse(first.content[0].text)).toEqual(first.structuredContent);
		const head = first.structuredContent.commit as string;
		expect(await env.REPO.getByName("mcp/demo").listRefs()).toEqual(new Map([["refs/heads/main", head]]));

		const tree = await tool("read_tree", { repo: "mcp/demo", path: "src" });
		expect(tree.structuredContent).toMatchObject({ commit: head, entries: [{ path: "src/lib", type: "dir" }] });
		const file = await tool("read_file", { repo: "mcp/demo", ref: "main", path: "bin/data.bin" });
		expect(file.structuredContent).toMatchObject({ encoding: "base64", content: btoa("\0\x01\x02") });

		const stale = await tool("commit_changes", { repo: "mcp/demo", branch: "main", expected_head: "0".repeat(40), message: "stale", changes: [{ path: "a", content: "a" }] }, true);
		expect(stale.isError).toBe(true);
		expect(stale.structuredContent).toMatchObject({ error: "head_mismatch", head });
		const bad = await tool("commit_changes", { repo: "mcp/demo", branch: "main", expected_head: head, message: "bad", changes: [{ path: "../x", content: "a" }] }, true);
		expect(bad.isError).toBe(true);
		expect(bad.structuredContent).toMatchObject({ error: "invalid_request" });
		const noRepo = await tool("read_tree", { repo: "mcp/missing" });
		expect(noRepo.structuredContent).toMatchObject({ error: "not_found" });
		expect((await tool("read_tree", { repo: "not-a-repo" })).structuredContent).toMatchObject({ error: "invalid_request" });

		const branch = await tool("commit_changes", { repo: "mcp/demo", branch: "feature", expected_head: null, start_rev: "main", message: "feature", changes: [{ path: "feature.txt", content: "f\n" }] }, true);
		const merged = await tool("merge_branches", { repo: "mcp/demo", into: "main", from: "feature" }, true);
		expect(merged.isError).toBe(false);
		expect(merged.structuredContent).toMatchObject({ result: "fast_forward", commit: branch.structuredContent.commit });

		const ours = await tool("commit_changes", { repo: "mcp/demo", branch: "main", expected_head: branch.structuredContent.commit, message: "ours", changes: [{ path: "README.md", content: "# MCP ours\n" }] }, true);
		await tool("commit_changes", { repo: "mcp/demo", branch: "feature", expected_head: branch.structuredContent.commit, message: "theirs", changes: [{ path: "README.md", content: "# MCP theirs\n" }] }, true);
		const conflict = await tool("merge_branches", { repo: "mcp/demo", into: "main", from: "feature" }, true);
		expect(conflict.isError).toBe(true);
		expect(conflict.structuredContent).toMatchObject({ error: "merge_conflict", conflicts: [{ path: "README.md", kind: "content" }] });
		expect((await env.REPO.getByName("mcp/demo").listRefs()).get("refs/heads/main")).toBe(ours.structuredContent.commit);

		const log = await tool("read_log", { repo: "mcp/demo", limit: 2 });
		expect(log.isError).toBe(false);
		expect(log.structuredContent).toMatchObject({ more: true, commits: [{ commit: ours.structuredContent.commit, message: "ours\n" }, { commit: branch.structuredContent.commit }] });
		const shown = await tool("read_commit", { repo: "mcp/demo", rev: ours.structuredContent.commit as string });
		expect(shown.structuredContent).toMatchObject({ files: [{ path: "README.md", status: "modified", patch: "@@ -1 +1 @@\n-# MCP\n+# MCP ours\n" }] });
		expect((await tool("read_log", { repo: "mcp/demo", limit: 500 })).structuredContent).toMatchObject({ error: "invalid_request" });
	});
});
