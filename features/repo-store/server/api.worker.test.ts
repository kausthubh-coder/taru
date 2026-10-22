import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { adminAuth, applyRepoMigrations } from "./test-helpers.ts";

async function call(path: string, init?: RequestInit) {
	return exports.default.fetch(`http://taru.test${path}`, init);
}

function create(body: unknown, headers: Record<string, string> = { Authorization: adminAuth() }) {
	return call("/api/repos", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

describe("POST /api/repos", () => {
	beforeAll(applyRepoMigrations);

	it("needs the admin token", async () => {
		const noAuth = await create({ owner: "kaust", name: "taru" }, {});
		expect(noAuth.status).toBe(401);
		expect(noAuth.headers.get("WWW-Authenticate")).toBe('Basic realm="taru"');

		const wrongPassword = await create({ owner: "kaust", name: "taru" }, { Authorization: `Basic ${btoa("admin:nope")}` });
		expect(wrongPassword.status).toBe(401);

		const bearer = await create({ owner: "kaust", name: "taru" }, { Authorization: `Bearer ${env.TARU_ADMIN_TOKEN}` });
		expect(bearer.status).toBe(401);
	});

	it("creates a repo, inits its object, and refuses a duplicate", async () => {
		const created = await create({ owner: "kaust", name: "taru" });
		expect(created.status).toBe(201);
		const body = await created.json<{ owner: string; name: string; clone_url: string; created_at: string }>();
		expect(body).toMatchObject({ owner: "kaust", name: "taru", clone_url: "http://taru.test/kaust/taru.git" });
		expect(body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		expect(await env.REPO.getByName("kaust/taru").headTarget()).toBe("refs/heads/main");

		const duplicate = await create({ owner: "kaust", name: "taru" });
		expect(duplicate.status).toBe(409);

		const differentCase = await create({ owner: "Kaust", name: "TARU" });
		expect(differentCase.status).toBe(409);
	});

	it("rejects bad names with 400", async () => {
		const bad = [
			{ owner: "kaust", name: "taru.git" },
			{ owner: "kaust", name: "has space" },
			{ owner: "kaust", name: "" },
			{ owner: "kaust", name: ".." },
			{ owner: "kaust", name: "x".repeat(65) },
			{ owner: "a/b", name: "taru" },
			{ owner: "kaust" },
			{ owner: 1, name: "taru" },
		];
		const responses = await Promise.all(bad.map((body) => create(body)));
		expect(responses.map((r) => r.status)).toEqual(bad.map(() => 400));

		const notJson = await call("/api/repos", { method: "POST", headers: { Authorization: adminAuth() }, body: "{" });
		expect(notJson.status).toBe(400);
	});
});

describe("GET /api/repos", () => {
	beforeAll(applyRepoMigrations);

	it("lists repos and shows one with its refs", async () => {
		await create({ owner: "lister", name: "one" });
		await create({ owner: "lister", name: "two" });
		await env.REPO.getByName("lister/two").updateRefs([{ ref: "refs/heads/main", old: null, new: "a".repeat(40) }]);

		const list = await call("/api/repos");
		expect(list.status).toBe(200);
		const { repos } = await list.json<{ repos: { owner: string; name: string }[] }>();
		const mine = repos.filter((r) => r.owner === "lister").map((r) => r.name);
		expect(mine.toSorted()).toEqual(["one", "two"]);

		const show = await call("/api/repos/lister/two");
		expect(show.status).toBe(200);
		expect(await show.json()).toMatchObject({
			owner: "lister",
			name: "two",
			head: "refs/heads/main",
			refs: { "refs/heads/main": "a".repeat(40) },
			clone_url: "http://taru.test/lister/two.git",
		});

		const empty = await call("/api/repos/lister/one");
		expect(await empty.json()).toMatchObject({ refs: {} });

		expect((await call("/api/repos/lister/three")).status).toBe(404);
		expect((await call("/api/repos", { method: "DELETE" })).status).toBe(405);
	});
});

describe("POST /api/repos/:owner/:name/import", () => {
	beforeAll(applyRepoMigrations);

	function importInto(owner: string, name: string, body: unknown, headers: Record<string, string> = { Authorization: adminAuth() }) {
		return call(`/api/repos/${owner}/${name}/import`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
	}

	it("needs the admin token, a known repo and a usable URL", async () => {
		await create({ owner: "imp", name: "target" });
		expect((await importInto("imp", "target", { url: "https://github.com/octo/demo.git" }, {})).status).toBe(401);
		expect((await importInto("imp", "missing", { url: "https://github.com/octo/demo.git" })).status).toBe(404);
		expect((await call("/api/repos/imp/target/import")).status).toBe(405);

		const bad = [
			{ url: "http://github.com/octo/demo.git" },
			{ url: "ftp://github.com/octo/demo.git" },
			{ url: "https://x:token@github.com/octo/demo.git" },
			{ url: "https://github.com/octo/demo.git?x=1" },
			{ url: "github.com/octo/demo" },
			{ url: 42 },
			{},
		];
		const responses = await Promise.all(bad.map((body) => importInto("imp", "target", body)));
		expect(responses.map((r) => r.status)).toEqual(bad.map(() => 400));
		expect(await responses[0].json()).toEqual({ error: "url must be https:// (http:// is allowed for localhost only)" });
	});

	it("answers 409 when the repo already has refs", async () => {
		await create({ owner: "imp", name: "full" });
		await env.REPO.getByName("imp/full").updateRefs([{ ref: "refs/heads/main", old: null, new: "a".repeat(40) }]);
		const response = await importInto("imp", "full", { url: "http://127.0.0.1:9/octo/demo.git" });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "repo is not empty; import only fills an empty repo" });
	});

	it("answers 502 with the reason when the remote can't be reached, and leaves the repo empty", async () => {
		await create({ owner: "imp", name: "unreachable" });
		const response = await importInto("imp", "unreachable", { url: "http://127.0.0.1:9/octo/demo.git" });
		expect(response.status).toBe(502);
		const { error } = await response.json<{ error: string }>();
		expect(error).toMatch(/^import from http:\/\/127\.0\.0\.1:9\/octo\/demo\.git failed: /);
		expect(await env.REPO.getByName("imp/unreachable").listRefs()).toEqual(new Map());
	});
});

describe("PUT /api/repos/:owner/:name/mirror", () => {
	beforeAll(applyRepoMigrations);

	function setMirror(owner: string, name: string, body: unknown, headers: Record<string, string> = { Authorization: adminAuth() }) {
		return call(`/api/repos/${owner}/${name}/mirror`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
	}

	it("needs the admin token and a usable URL", async () => {
		await create({ owner: "mir", name: "cfg" });
		expect((await setMirror("mir", "cfg", { url: "https://github.com/octo/copy.git" }, {})).status).toBe(401);
		expect((await setMirror("mir", "nope", { url: "https://github.com/octo/copy.git" })).status).toBe(404);
		expect((await setMirror("mir", "cfg", { url: "http://example.com/copy.git" })).status).toBe(400);
		expect((await setMirror("mir", "cfg", {})).status).toBe(400);
		expect((await call("/api/repos/mir/cfg/mirror", { method: "POST" })).status).toBe(405);
	});

	it("turns the copy on with a fresh status, shows it on GET, and turns it off with null", async () => {
		await create({ owner: "mir", name: "toggle" });
		const before = await (await call("/api/repos/mir/toggle")).json<{ mirror: unknown }>();
		expect(before.mirror).toBeNull();

		const on = await setMirror("mir", "toggle", { url: "https://github.com/octo/copy.git" });
		expect(on.status).toBe(200);
		expect(await on.json()).toEqual({
			mirror: {
				url: "https://github.com/octo/copy.git",
				status: {
					state: "pending",
					attempts: 0,
					last_attempt_at: null,
					last_success_at: null,
					last_error: null,
					next_attempt_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
					last_pushed_refs: {},
				},
			},
		});
		const shown = await (await call("/api/repos/mir/toggle")).json<{ mirror: { url: string; status: { state: string } } }>();
		expect(shown.mirror.url).toBe("https://github.com/octo/copy.git");
		expect(shown.mirror.status.state).toBe("pending");

		const off = await setMirror("mir", "toggle", { url: null });
		expect(await off.json()).toEqual({ mirror: null });
		expect((await (await call("/api/repos/mir/toggle")).json<{ mirror: unknown }>()).mirror).toBeNull();
	});
});
