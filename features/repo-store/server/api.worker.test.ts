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
		expect(body).toMatchObject({ owner: "kaust", name: "taru", clone_url: `${env.TARU_PUBLIC_URL}/kaust/taru.git` });
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
		});

		const empty = await call("/api/repos/lister/one");
		expect(await empty.json()).toMatchObject({ refs: {} });

		expect((await call("/api/repos/lister/three")).status).toBe(404);
		expect((await call("/api/repos", { method: "DELETE" })).status).toBe(405);
	});
});
