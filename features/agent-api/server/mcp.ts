// MCP server at /mcp: Streamable HTTP, stateless, JSON responses. Hand-rolled JSON-RPC rather than the
// official SDK: a stateless Worker needs four methods (initialize, ping, tools/list, tools/call) and
// notifications, no sessions, no SSE stream, no zod. The SDK's transport is built around sessions and
// streams and pulls in far more code than this file.
// The tools mirror the REST routes one to one and run through the same operations.ts.

import { isAdmin } from "../../repo-store/server/auth.ts";
import { byteLimit, readAll } from "../../repo-store/server/body.ts";
import { listRepos } from "../../repo-store/server/repos.ts";
import { commit, merge, readFile, readTree, type ApiResult } from "./operations.ts";
import { parseCommitRequest, parseMergeRequest, parseReadRequest } from "./requests.logic.ts";
import { MAX_AGENT_BODY } from "./routes.ts";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "taru", version: "0.1.0" };

const INSTRUCTIONS = `Taru is a Git server. These tools read and change repositories directly on the server: no clone, no checkout. Every change you commit shows up in git clone/pull and on GitHub.
Workflow: list_repos -> read_tree / read_file at a ref -> commit_changes with expected_head set to the commit you read (the server refuses if the branch moved) -> merge_branches to land a branch.
Repos are named "owner/name". Refs are branch names ("main"), tag names, full refs ("refs/heads/main") or 40-hex commit ids.`;

const REPO = { type: "string", description: 'Repository as "owner/name".' };
const REF = { type: "string", description: 'Branch ("main"), tag, full ref ("refs/heads/main") or 40-hex commit id. Default: the branch HEAD points at.' };
const AUTHOR = {
	type: "object",
	description: "Who made the change. Default: Taru <agent@taru.dev>.",
	properties: { name: { type: "string" }, email: { type: "string" } },
	required: ["name", "email"],
};

interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	/** Needs the admin token. */
	write: boolean;
}

export const TOOLS: Tool[] = [
	{
		name: "list_repos",
		description: "List every repository on this Taru server with its clone URL.",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
		write: false,
	},
	{
		name: "read_tree",
		description: 'List the entries of a folder at a ref. Returns the commit id (use it as expected_head when committing), and for each entry its name, path, type (file, dir, symlink, submodule), mode and blob/tree id. Omit path for the root.',
		inputSchema: { type: "object", properties: { repo: REPO, ref: REF, path: { type: "string", description: 'Folder path like "src/lib". Omit or "" for the root.' } }, required: ["repo"], additionalProperties: false },
		write: false,
	},
	{
		name: "read_file",
		description: "Read one file at a ref. Text files come back as content with encoding \"utf-8\"; binary files as base64 with encoding \"base64\". Also returns the commit id, mode, blob id and size.",
		inputSchema: { type: "object", properties: { repo: REPO, ref: REF, path: { type: "string", description: 'File path like "src/app.ts".' } }, required: ["repo", "path"], additionalProperties: false },
		write: false,
	},
	{
		name: "commit_changes",
		description:
			"Create one commit on a branch from a set of file changes, with no clone. expected_head must be the branch's current commit id (from read_tree/read_file); pass null to create the branch, optionally from start_rev. If the branch moved, the result is head_mismatch with the current head: read again and retry. Each change is {path, content} for text, {path, content_base64} for bytes, or {path, delete: true}. Folders appear and disappear with their files. mode is \"100644\" (default), \"100755\" (executable) or \"120000\" (symlink; content is the target). Needs the admin token.",
		inputSchema: {
			type: "object",
			properties: {
				repo: REPO,
				branch: { type: "string", description: 'Branch name like "main" or "feature/x".' },
				expected_head: { type: ["string", "null"], description: "The branch's current 40-hex commit id, or null to create the branch." },
				start_rev: { type: "string", description: "With expected_head null: the ref to start the new branch from. Omit for an orphan first commit." },
				message: { type: "string", description: "Commit message." },
				author: AUTHOR,
				changes: {
					type: "array",
					minItems: 1,
					items: {
						type: "object",
						properties: {
							path: { type: "string", description: 'Relative path like "src/lib/util.ts". No "..", no ".git" segments.' },
							content: { type: "string", description: "Full new text of the file." },
							content_base64: { type: "string", description: "Full new bytes of the file, base64." },
							delete: { type: "boolean", enum: [true], description: "Remove the file." },
							mode: { type: "string", enum: ["100644", "100755", "120000"] },
						},
						required: ["path"],
						additionalProperties: false,
					},
				},
			},
			required: ["repo", "branch", "expected_head", "message", "changes"],
			additionalProperties: false,
		},
		write: true,
	},
	{
		name: "merge_branches",
		description:
			'Merge `from` into branch `into` on the server. Fast-forwards when it can, otherwise makes a merge commit with two parents. result is "up_to_date", "fast_forward" or "merged". On conflicts nothing is written and the result is merge_conflict with one entry per path: kind (content, binary, symlink, add/add, modify/delete, mode, file/directory), base/ours/theirs blob ids, and for content conflicts the file with <<<<<<< markers; resolve by committing the fixed file on `from` or `into` and merging again. dry_run computes the result without writing. Needs the admin token.',
		inputSchema: {
			type: "object",
			properties: {
				repo: REPO,
				into: { type: "string", description: 'The branch that receives the merge, like "main".' },
				from: { type: "string", description: "Branch, tag, full ref or commit id to merge in." },
				message: { type: "string", description: 'Merge commit message. Default: "Merge <from> into <into>".' },
				expected_head: { type: "string", description: "If set, `into` must be at this commit id." },
				dry_run: { type: "boolean", description: "Report what would happen without writing." },
				author: AUTHOR,
			},
			required: ["repo", "into", "from"],
			additionalProperties: false,
		},
		write: true,
	},
];

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: string | number | null;
	method: string;
	params?: unknown;
}

function isRequest(value: unknown): value is JsonRpcRequest {
	return typeof value === "object" && value !== null && !Array.isArray(value) && (value as JsonRpcRequest).jsonrpc === "2.0" && typeof (value as JsonRpcRequest).method === "string";
}

function rpcError(id: string | number | null, code: number, message: string, status = 200, headers: Record<string, string> = {}): Response {
	return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers });
}

function rpcResult(id: string | number | null, result: unknown): Response {
	return Response.json({ jsonrpc: "2.0", id, result });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "owner/name" split, or null. */
function splitRepo(value: unknown): { owner: string; name: string } | null {
	if (typeof value !== "string") return null;
	const parts = value.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
	return { owner: parts[0], name: parts[1] };
}

/** A tool result: the JSON body as text (and as structuredContent), isError when the operation failed. */
function toolResult(result: ApiResult) {
	return {
		content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
		structuredContent: result.body,
		isError: result.status >= 400,
	};
}

function toolError(message: string) {
	return toolResult({ status: 400, body: { error: "invalid_request", message } });
}

async function callTool(env: Env, origin: string, name: string, args: Record<string, unknown>): Promise<ReturnType<typeof toolResult>> {
	if (name === "list_repos") {
		const repos = (await listRepos(env.DB)).map((r) => ({ repo: `${r.owner}/${r.name}`, owner: r.owner, name: r.name, created_at: r.created_at, clone_url: `${origin}/${r.owner}/${r.name}.git` }));
		return toolResult({ status: 200, body: { repos } });
	}
	const repo = splitRepo(args.repo);
	if (!repo) return toolError('repo must be "owner/name"');
	if (name === "read_tree" || name === "read_file") {
		const parsed = parseReadRequest(args.ref, args.path, { requirePath: name === "read_file" });
		if (!parsed.ok) return toolError(parsed.message);
		return toolResult(name === "read_tree" ? await readTree(env, repo.owner, repo.name, parsed.input) : await readFile(env, repo.owner, repo.name, parsed.input));
	}
	if (name === "commit_changes") {
		const parsed = parseCommitRequest(args);
		if (!parsed.ok) return toolError(parsed.message);
		return toolResult(await commit(env, repo.owner, repo.name, parsed.input));
	}
	const parsed = parseMergeRequest(args);
	if (!parsed.ok) return toolError(parsed.message);
	return toolResult(await merge(env, repo.owner, repo.name, parsed.input));
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
	if (request.method !== "POST") {
		// No server-to-client stream: every response is the JSON answer to one POST.
		return new Response("method not allowed: POST JSON-RPC to /mcp\n", { status: 405, headers: { Allow: "POST" } });
	}
	const limit = { exceeded: false };
	let message: unknown;
	try {
		const raw = await readAll((request.body ?? new ReadableStream()).pipeThrough(byteLimit(MAX_AGENT_BODY, limit)));
		message = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		if (limit.exceeded) return rpcError(null, -32600, `body exceeds ${MAX_AGENT_BODY} bytes`, 413);
		return rpcError(null, -32700, "parse error: body must be JSON", 400);
	}
	if (!isRequest(message)) return rpcError(null, -32600, "invalid request: expected a JSON-RPC 2.0 object (batches are not supported)", 400);

	// Notifications carry no id and get no body.
	if (message.id === undefined) return new Response(null, { status: 202 });
	const id = message.id;
	const params = isRecord(message.params) ? message.params : {};

	switch (message.method) {
		case "initialize": {
			const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : MCP_PROTOCOL_VERSION;
			return rpcResult(id, {
				protocolVersion: requested === "2025-03-26" ? requested : MCP_PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: SERVER_INFO,
				instructions: INSTRUCTIONS,
			});
		}
		case "ping":
			return rpcResult(id, {});
		case "tools/list":
			return rpcResult(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
		case "tools/call": {
			const tool = TOOLS.find((t) => t.name === params.name);
			if (!tool) return rpcError(id, -32602, `unknown tool ${JSON.stringify(params.name)}`);
			if (tool.write && !(await isAdmin(request, env))) {
				return rpcError(id, -32001, `${tool.name} needs HTTP Basic auth with the admin token as the password`, 401, { "WWW-Authenticate": 'Basic realm="taru"' });
			}
			const args = isRecord(params.arguments) ? params.arguments : {};
			return rpcResult(id, await callTool(env, new URL(request.url).origin, tool.name, args));
		}
		default:
			return rpcError(id, -32601, `method not found: ${message.method}`);
	}
}
