// The agent REST API inside workerd with real Durable Objects: auth, validation, compare-and-swap, reads,
// and merges (fast-forward, three-way, conflict report) as an agent would drive them over HTTP.

import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { adminAuth, applyRepoMigrations } from "../../repo-store/server/test-helpers.ts";

const OWNER = "agent";

async function call(path: string, init?: RequestInit) {
	return exports.default.fetch(`http://taru.test${path}`, init);
}

async function post(path: string, body: unknown, auth = true) {
	return call(path, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...(auth ? { Authorization: adminAuth() } : {}) },
		body: JSON.stringify(body),
	});
}

async function createRepo(name: string) {
	const res = await post("/api/repos", { owner: OWNER, name });
	expect(res.status).toBe(201);
	return `/api/repos/${OWNER}/${name}`;
}

interface CommitBody {
	branch: string;
	commit: string;
	tree: string;
	parent: string | null;
}

/** Seeds main with a real-shaped tree and returns the commit oid. */
async function seed(base: string): Promise<string> {
	const res = await post(`${base}/commits`, {
		branch: "main",
		expected_head: null,
		message: "first",
		author: { name: "Seed", email: "seed@taru.dev" },
		changes: [
			{ path: "README.md", content: "# Demo\n" },
			{ path: "src/app.ts", content: "export const app = () => 'hi';\n" },
			{ path: "src/lib/util.ts", content: "export const add = (a: number, b: number) => a + b;\n" },
			{ path: "assets/logo.bin", content_base64: btoa("\0\x01\x02binary") },
			{ path: "tools/run.sh", content: "#!/bin/sh\necho run\n", mode: "100755" },
		],
	});
	expect(res.status).toBe(201);
	const body = await res.json<CommitBody>();
	expect(body).toMatchObject({ branch: "refs/heads/main", parent: null });
	return body.commit;
}

describe("auth and validation", () => {
	beforeAll(applyRepoMigrations);

	it("reads are public, writes need the admin token", async () => {
		const base = await createRepo("auth");
		const head = await seed(base);
		expect((await call(`${base}/tree`)).status).toBe(200);
		expect((await call(`${base}/file?path=README.md`)).status).toBe(200);

		const noAuth = await post(`${base}/commits`, { branch: "main", expected_head: head, message: "x", changes: [{ path: "a", content: "a" }] }, false);
		expect(noAuth.status).toBe(401);
		expect(noAuth.headers.get("WWW-Authenticate")).toBe('Basic realm="taru"');
		expect(await noAuth.json()).toMatchObject({ error: "unauthorized" });
		expect((await post(`${base}/merges`, { into: "main", from: "main" }, false)).status).toBe(401);
		expect((await call(`${base}/commits`)).status).toBe(200);
		expect((await call(`${base}/commits`, { method: "PUT", headers: { Authorization: adminAuth() } })).status).toBe(405);
		expect((await call(`${base}/tree`, { method: "POST", headers: { Authorization: adminAuth() } })).status).toBe(405);
	});

	it("names what is wrong with a request", async () => {
		const base = await createRepo("validation");
		const head = await seed(base);
		const bad: [unknown, RegExp][] = [
			[{ branch: "main", message: "x", changes: [{ path: "a", content: "a" }] }, /expected_head is required/],
			[{ branch: "main", expected_head: "nope", message: "x", changes: [{ path: "a", content: "a" }] }, /expected_head must be/],
			[{ branch: "main", expected_head: head, message: "", changes: [{ path: "a", content: "a" }] }, /message/],
			[{ branch: "main", expected_head: head, message: "x", changes: [] }, /changes must be a non-empty array/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "../x", content: "a" }] }, /changes\[0\]\.path must not contain/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a/.git/b", content: "a" }] }, /\.git/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a//b", content: "a" }] }, /empty segments/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a" }] }, /exactly one of content, content_base64 or delete/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a", content: "a", delete: true }] }, /exactly one/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a", content: "a", mode: "100600" }] }, /mode must be/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a", content_base64: "!!!" }] }, /not valid base64/],
			[{ branch: "main", expected_head: head, message: "x", changes: [{ path: "a", content: "a" }, { path: "a/b", content: "b" }] }, /also used as a folder/],
			[{ branch: "bad name", expected_head: null, message: "x", changes: [{ path: "a", content: "a" }] }, /not a valid branch name/],
			[{ branch: "refs/tags/v1", expected_head: null, message: "x", changes: [{ path: "a", content: "a" }] }, /not a valid branch name/],
			[{ branch: "main", expected_head: head, author: { name: "x" }, message: "x", changes: [{ path: "a", content: "a" }] }, /author must be/],
		];
		for (const [body, pattern] of bad) {
			// oxlint-disable-next-line no-await-in-loop
			const res = await post(`${base}/commits`, body);
			// oxlint-disable-next-line no-await-in-loop
			const json = await res.json<{ error: string; message: string }>();
			expect(`${res.status} ${json.error} ${json.message}`).toMatch(pattern);
			expect(res.status, json.message).toBe(400);
			expect(json.error).toBe("invalid_request");
		}
		const notJson = await call(`${base}/commits`, { method: "POST", headers: { Authorization: adminAuth() }, body: "{" });
		expect(notJson.status).toBe(400);
		expect((await call(`${base}/file`)).status).toBe(400);
		expect((await call(`${base}/file?path=/abs`)).status).toBe(400);
		expect((await post(`${base}/merges`, { into: "main" })).status).toBe(400);
		expect((await post(`${base}/merges`, { into: "main", from: "main", dry_run: "yes" })).status).toBe(400);
		expect((await post(`/api/repos/${OWNER}/missing/commits`, { branch: "main", expected_head: null, message: "x", changes: [{ path: "a", content: "a" }] })).status).toBe(404);
		expect((await call(`/api/repos/${OWNER}/missing/tree`)).status).toBe(404);
	});
});

describe("reading and committing", () => {
	beforeAll(applyRepoMigrations);

	it("reads trees and files at a ref, with base64 for binary", async () => {
		const base = await createRepo("reads");
		const head = await seed(base);

		const root = await (await call(`${base}/tree`)).json<{ ref: string; commit: string; path: string; entries: { name: string; type: string; mode: string }[] }>();
		expect(root.ref).toBe("refs/heads/main");
		expect(root.commit).toBe(head);
		expect(root.path).toBe("");
		expect(root.entries.map((e) => `${e.mode} ${e.type} ${e.name}`)).toEqual([
			"100644 file README.md",
			"40000 dir assets",
			"40000 dir src",
			"40000 dir tools",
		]);

		const src = await (await call(`${base}/tree?ref=main&path=src`)).json<{ entries: { path: string }[] }>();
		expect(src.entries.map((e) => e.path)).toEqual(["src/app.ts", "src/lib"]);
		const byOid = await (await call(`${base}/tree?ref=${head}&path=src/lib`)).json<{ ref: string | null; entries: { name: string }[] }>();
		expect(byOid.ref).toBeNull();
		expect(byOid.entries.map((e) => e.name)).toEqual(["util.ts"]);
		expect((await call(`${base}/tree?path=src/app.ts`)).status).toBe(404);
		expect((await call(`${base}/tree?path=nope`)).status).toBe(404);
		expect((await call(`${base}/tree?ref=nope`)).status).toBe(404);

		const text = await (await call(`${base}/file?path=src/app.ts`)).json<Record<string, unknown>>();
		expect(text).toMatchObject({ ref: "refs/heads/main", commit: head, path: "src/app.ts", type: "file", mode: "100644", size: 31, encoding: "utf-8", content: "export const app = () => 'hi';\n" });
		const exec = await (await call(`${base}/file?path=tools/run.sh`)).json<Record<string, unknown>>();
		expect(exec).toMatchObject({ mode: "100755", content: "#!/bin/sh\necho run\n" });
		const binary = await (await call(`${base}/file?path=assets/logo.bin`)).json<Record<string, unknown>>();
		expect(binary).toMatchObject({ encoding: "base64", content: btoa("\0\x01\x02binary"), size: 9 });
		expect((await call(`${base}/file?path=src`)).status).toBe(404);
	});

	it("commits with compare-and-swap: a stale expected_head is a 409 with the current head", async () => {
		const base = await createRepo("cas");
		const first = await seed(base);

		const edit = await post(`${base}/commits`, {
			branch: "main",
			expected_head: first,
			message: "edit nested, add, delete, new folder",
			changes: [
				{ path: "src/lib/util.ts", content: "export const add = (a: number, b: number) => a + b + 0;\n" },
				{ path: "README.md", delete: true },
				{ path: "features/x/y/new.ts", content: "export {};\n" },
				{ path: "tools/run.sh", content: "#!/bin/sh\necho changed\n" },
			],
		});
		expect(edit.status).toBe(201);
		const second = await edit.json<CommitBody>();
		expect(second.parent).toBe(first);
		expect(second.commit).not.toBe(first);

		const show = await (await call(`/api/repos/${OWNER}/cas`)).json<{ refs: Record<string, string> }>();
		expect(show.refs["refs/heads/main"]).toBe(second.commit);
		const root = await (await call(`${base}/tree`)).json<{ entries: { name: string }[] }>();
		expect(root.entries.map((e) => e.name)).toEqual(["assets", "features", "src", "tools"]);
		expect(await (await call(`${base}/file?path=tools/run.sh`)).json()).toMatchObject({ mode: "100755", content: "#!/bin/sh\necho changed\n" });
		expect(await (await call(`${base}/file?ref=${first}&path=README.md`)).json()).toMatchObject({ content: "# Demo\n" });

		const stale = await post(`${base}/commits`, { branch: "main", expected_head: first, message: "stale", changes: [{ path: "a", content: "a" }] });
		expect(stale.status).toBe(409);
		expect(await stale.json()).toMatchObject({ error: "head_mismatch", branch: "refs/heads/main", head: second.commit });
		const exists = await post(`${base}/commits`, { branch: "main", expected_head: null, message: "dup", changes: [{ path: "a", content: "a" }] });
		expect(exists.status).toBe(409);
		expect(await exists.json()).toMatchObject({ error: "head_mismatch", head: second.commit });
		const unborn = await post(`${base}/commits`, { branch: "other", expected_head: first, message: "x", changes: [{ path: "a", content: "a" }] });
		expect(unborn.status).toBe(409);
		expect(await unborn.json()).toMatchObject({ error: "head_mismatch", branch: "refs/heads/other", head: null });
		expect((await (await call(`/api/repos/${OWNER}/cas`)).json<{ refs: Record<string, string> }>()).refs).toEqual({ "refs/heads/main": second.commit });
	});

	it("creates a branch from a start_rev, and a 'refs/heads/' branch name works too", async () => {
		const base = await createRepo("branches");
		const first = await seed(base);
		const created = await post(`${base}/commits`, {
			branch: "feature/one",
			expected_head: null,
			start_rev: "main",
			message: "branch work",
			changes: [{ path: "feature.txt", content: "feature\n" }],
		});
		expect(created.status).toBe(201);
		const body = await created.json<CommitBody>();
		expect(body).toMatchObject({ branch: "refs/heads/feature/one", parent: first });
		expect(await (await call(`${base}/file?ref=feature/one&path=README.md`)).json()).toMatchObject({ content: "# Demo\n" });
		expect((await call(`${base}/file?ref=main&path=feature.txt`)).status).toBe(404);

		const missingStart = await post(`${base}/commits`, { branch: "x", expected_head: null, start_rev: "nope", message: "m", changes: [{ path: "a", content: "a" }] });
		expect(missingStart.status).toBe(404);
		const full = await post(`${base}/commits`, { branch: "refs/heads/feature/one", expected_head: body.commit, message: "more", changes: [{ path: "feature.txt", delete: true }] });
		expect(full.status).toBe(201);
	});
});

describe("merging", () => {
	beforeAll(applyRepoMigrations);

	it("fast-forwards, merges cleanly with two parents, and reports conflicts without writing", async () => {
		const base = await createRepo("merges");
		const first = await seed(base);
		const branch = await (await post(`${base}/commits`, {
			branch: "feature",
			expected_head: null,
			start_rev: "main",
			message: "feature edits the bottom of util and adds a file",
			changes: [
				{ path: "src/lib/util.ts", content: "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n" },
				{ path: "docs/feature.md", content: "feature\n" },
			],
		})).json<CommitBody>();

		const dry = await post(`${base}/merges`, { into: "main", from: "feature", dry_run: true });
		expect(dry.status).toBe(200);
		expect(await dry.json()).toMatchObject({ result: "fast_forward", dry_run: true, into: "refs/heads/main", from: "refs/heads/feature", commit: branch.commit, base: first });
		expect((await (await call(`/api/repos/${OWNER}/merges`)).json<{ refs: Record<string, string> }>()).refs["refs/heads/main"]).toBe(first);

		const ff = await post(`${base}/merges`, { into: "main", from: "feature", expected_head: first });
		expect(ff.status).toBe(200);
		expect(await ff.json()).toMatchObject({ result: "fast_forward", dry_run: false, commit: branch.commit });
		expect((await (await call(`/api/repos/${OWNER}/merges`)).json<{ refs: Record<string, string> }>()).refs["refs/heads/main"]).toBe(branch.commit);

		const upToDate = await post(`${base}/merges`, { into: "main", from: "feature" });
		expect(await upToDate.json()).toMatchObject({ result: "up_to_date", commit: branch.commit });
		const stale = await post(`${base}/merges`, { into: "main", from: "feature", expected_head: first });
		expect(stale.status).toBe(409);
		expect(await stale.json()).toMatchObject({ error: "head_mismatch", head: branch.commit });

		// Diverge: main edits README, feature edits the top of util. Three-way merge, clean.
		const main2 = await (await post(`${base}/commits`, { branch: "main", expected_head: branch.commit, message: "main readme", changes: [{ path: "README.md", content: "# Demo\n\nmain\n" }] })).json<CommitBody>();
		const feature2 = await (await post(`${base}/commits`, {
			branch: "feature",
			expected_head: branch.commit,
			message: "feature util",
			changes: [{ path: "src/lib/util.ts", content: "// math\nexport const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n" }],
		})).json<CommitBody>();
		const merged = await post(`${base}/merges`, { into: "main", from: "feature", message: "merge feature" });
		expect(merged.status).toBe(200);
		const mergeBody = await merged.json<{ result: string; commit: string; base: string }>();
		expect(mergeBody).toMatchObject({ result: "merged", base: branch.commit });
		expect(await (await call(`${base}/file?path=README.md`)).json()).toMatchObject({ content: "# Demo\n\nmain\n" });
		expect(await (await call(`${base}/file?path=src/lib/util.ts`)).json()).toMatchObject({ content: "// math\nexport const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n" });
		const mergeCommit = await env.REPO.getByName(`${OWNER}/merges`).getObject(mergeBody.commit);
		const text = new TextDecoder().decode(mergeCommit!.data);
		expect(text).toContain(`parent ${main2.commit}\nparent ${feature2.commit}\n`);
		expect(text).toContain("\n\nmerge feature\n");

		// Conflict: both sides change the same line of README; the binary changes on both sides too.
		const main3 = await (await post(`${base}/commits`, {
			branch: "main",
			expected_head: mergeBody.commit,
			message: "main conflict",
			changes: [{ path: "README.md", content: "# Demo\n\nmain again\n" }, { path: "assets/logo.bin", content_base64: btoa("\0main") }],
		})).json<CommitBody>();
		const feature3 = await (await post(`${base}/commits`, {
			branch: "feature",
			expected_head: feature2.commit,
			message: "feature conflict",
			changes: [{ path: "README.md", content: "# Demo\n\nfeature again\n" }, { path: "assets/logo.bin", content_base64: btoa("\0feature") }],
		})).json<CommitBody>();
		const conflict = await post(`${base}/merges`, { into: "main", from: "feature" });
		expect(conflict.status).toBe(409);
		const report = await conflict.json<{ error: string; base: string; ours: string; theirs: string; conflicts: Record<string, unknown>[] }>();
		expect(report).toMatchObject({ error: "merge_conflict", ours: main3.commit, theirs: feature3.commit });
		// Tree order (git sorts "README.md" before "assets/"). The merge base is feature2, where README was
		// still "# Demo\n", so both sides added two lines and the whole addition is the conflict.
		expect(report.conflicts).toEqual([
			{
				path: "README.md",
				kind: "content",
				base: expect.any(String),
				ours: expect.any(String),
				theirs: expect.any(String),
				conflict_text: "# Demo\n<<<<<<< refs/heads/main\n\nmain again\n=======\n\nfeature again\n>>>>>>> refs/heads/feature\n",
			},
			{ path: "assets/logo.bin", kind: "binary", base: expect.any(String), ours: expect.any(String), theirs: expect.any(String) },
		]);
		expect((await (await call(`/api/repos/${OWNER}/merges`)).json<{ refs: Record<string, string> }>()).refs["refs/heads/main"]).toBe(main3.commit);
	});
});

describe("history", () => {
	beforeAll(applyRepoMigrations);

	it("lists commits newest first, pages them, and shows what one changed", async () => {
		const base = await createRepo("history");
		const first = await seed(base);
		const second = await (await post(`${base}/commits`, {
			branch: "main",
			expected_head: first,
			message: "Edit util, drop the binary",
			author: { name: "Agent", email: "agent@acme.dev" },
			changes: [
				{ path: "src/lib/util.ts", content: "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n" },
				{ path: "assets/logo.bin", delete: true },
			],
		})).json<CommitBody>();

		const log = await call(`${base}/commits?ref=main&limit=1`);
		expect(log.status).toBe(200);
		const page = await log.json<{ head: string; more: boolean; commits: { commit: string; parents: string[]; author: { name: string }; message: string }[] }>();
		expect(page).toMatchObject({ head: second.commit, more: true });
		expect(page.commits).toEqual([expect.objectContaining({ commit: second.commit, parents: [first], author: expect.objectContaining({ name: "Agent", email: "agent@acme.dev" }), message: "Edit util, drop the binary\n" })]);
		const next = await (await call(`${base}/commits?limit=10&skip=1`)).json<{ more: boolean; commits: { commit: string }[] }>();
		expect(next).toMatchObject({ more: false, commits: [{ commit: first }] });
		expect(await (await call(`${base}/commits?limit=0`)).json()).toMatchObject({ error: "invalid_request" });

		const shown = await call(`${base}/commits/${second.commit}`);
		expect(shown.status).toBe(200);
		const body = await shown.json<{ compared_to: string; files: Record<string, unknown>[] }>();
		expect(body.compared_to).toBe(first);
		expect(body.files).toEqual([
			expect.objectContaining({ path: "assets/logo.bin", status: "deleted", binary: true, patch: null }),
			expect.objectContaining({
				path: "src/lib/util.ts",
				status: "modified",
				additions: 1,
				deletions: 0,
				patch: "@@ -1 +1,2 @@\n export const add = (a: number, b: number) => a + b;\n+export const sub = (a: number, b: number) => a - b;\n",
			}),
		]);
		expect((await call(`${base}/commits/main`)).status).toBe(200);

		const raw = await call(`${base}/raw?ref=${first}&path=assets/logo.bin`);
		expect(raw.status).toBe(200);
		expect(new Uint8Array(await raw.arrayBuffer())).toEqual(new TextEncoder().encode("\0\x01\x02binary"));
		expect(raw.headers.get("Content-Type")).toBe("application/octet-stream");
		expect(raw.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(raw.headers.get("Content-Security-Policy")).toContain("sandbox");
		expect(raw.headers.get("Cache-Control")).toContain("immutable");
		const text = await call(`${base}/raw?path=src/lib/util.ts`);
		expect(text.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
		expect(await text.text()).toContain("export const sub");
		expect((await call(`${base}/raw?path=nope.txt`)).status).toBe(404);
		expect((await call(`${base}/raw`)).status).toBe(400);
		expect(await (await call(`${base}/commits/nope`)).json()).toMatchObject({ error: "not_found" });
	});
});
