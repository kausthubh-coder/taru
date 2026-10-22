import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { readAll } from "../../repo-store/server/body.ts";
import { adminAuth, applyRepoMigrations } from "../../repo-store/server/test-helpers.ts";
import { decodedBody, MAX_BODY_BYTES } from "./routes.ts";

async function call(path: string, init?: RequestInit) {
	return exports.default.fetch(`http://taru.test${path}`, init);
}

async function createRepo(owner: string, name: string) {
	const response = await call("/api/repos", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: adminAuth() },
		body: JSON.stringify({ owner, name }),
	});
	expect(response.status).toBe(201);
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
	return readAll(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")));
}

describe("git smart HTTP", () => {
	beforeAll(applyRepoMigrations);

	it("answers 404 for a repo that is not in the index", async () => {
		expect((await call("/nobody/nothing.git/info/refs?service=git-upload-pack")).status).toBe(404);
		expect((await call("/nobody/nothing.git/git-upload-pack", { method: "POST" })).status).toBe(404);
		expect((await call("/nobody/nothing.git/git-receive-pack", { method: "POST" })).status).toBe(404);
	});

	it("rejects unsupported services, paths and methods", async () => {
		await createRepo("kaust", "svc");
		expect((await call("/kaust/svc.git/info/refs")).status).toBe(400);
		expect((await call("/kaust/svc.git/info/refs?service=git-foo")).status).toBe(400);
		expect((await call("/kaust/svc.git/HEAD")).status).toBe(404);
		expect((await call("/kaust/svc.git")).status).toBe(404);
		expect((await call("/kaust/svc.git/git-upload-pack")).status).toBe(405);
		expect((await call("/kaust/svc.git/info/refs?service=git-upload-pack", { method: "POST" })).status).toBe(405);
	});

	it("needs the admin token for receive-pack, both advertisement and push", async () => {
		await createRepo("kaust", "auth");
		const advertise = await call("/kaust/auth.git/info/refs?service=git-receive-pack");
		expect(advertise.status).toBe(401);
		expect(advertise.headers.get("WWW-Authenticate")).toBe('Basic realm="taru"');

		const push = await call("/kaust/auth.git/git-receive-pack", { method: "POST", body: "0000" });
		expect(push.status).toBe(401);
		expect(push.headers.get("WWW-Authenticate")).toBe('Basic realm="taru"');

		const wrong = await call("/kaust/auth.git/git-receive-pack", {
			method: "POST",
			body: "0000",
			headers: { Authorization: `Basic ${btoa("admin:wrong")}` },
		});
		expect(wrong.status).toBe(401);
	});

	it("rejects a body declared bigger than the cap before touching the repo", async () => {
		await createRepo("kaust", "cap");
		const response = await call("/kaust/cap.git/git-upload-pack", {
			method: "POST",
			headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
			body: "0000",
		});
		expect(response.status).toBe(413);
	});

	// The requests below are well-formed and reach git-core, which throws on this branch. That they fail with
	// git-core's error (and not 401/404/413) shows routing, auth, lookup and body handling all passed.
	it("serves the real protocol with the right content types", async () => {
		await createRepo("kaust", "proto");

		const advertise = await call("/kaust/proto.git/info/refs?service=git-upload-pack");
		expect(advertise.status).toBe(200);
		expect(advertise.headers.get("Content-Type")).toBe("application/x-git-upload-pack-advertisement");
		expect(advertise.headers.get("Cache-Control")).toBe("no-cache");
		const advertisement = await advertise.text();
		// An empty repo: the service line, a flush, then the zero-id capabilities line.
		expect(advertisement.startsWith("001e# service=git-upload-pack\n0000")).toBe(true);
		expect(advertisement).toContain(`${"0".repeat(40)} capabilities^{}`);

		// A client with nothing to want sends just a flush; the server answers with an empty result.
		const fetch = await call("/kaust/proto.git/git-upload-pack", {
			method: "POST",
			headers: { "Content-Type": "application/x-git-upload-pack-request" },
			body: "0000",
		});
		expect(fetch.status).toBe(200);
		expect(fetch.headers.get("Content-Type")).toBe("application/x-git-upload-pack-result");
		expect(fetch.headers.get("Cache-Control")).toBe("no-cache");

		const push = await call("/kaust/proto.git/git-receive-pack", {
			method: "POST",
			headers: { "Content-Type": "application/x-git-receive-pack-request", Authorization: adminAuth() },
			body: "0000",
		});
		expect(push.status).toBe(200);
		expect(push.headers.get("Content-Type")).toBe("application/x-git-receive-pack-result");
	});
});

describe("decodedBody", () => {
	it("gunzips a gzip-encoded request body before it reaches the protocol", async () => {
		const original = new TextEncoder().encode("0032want " + "a".repeat(40) + "\n0000");
		const compressed = await gzip(original);
		expect(compressed).not.toEqual(original);

		const request = new Request("http://taru.test/kaust/x.git/git-upload-pack", {
			method: "POST",
			headers: { "Content-Encoding": "gzip" },
			body: compressed,
		});
		const limit = { exceeded: false };
		expect(await readAll(decodedBody(request, MAX_BODY_BYTES, limit))).toEqual(original);
		expect(limit.exceeded).toBe(false);
	});

	it("passes a plain body through unchanged", async () => {
		const original = new Uint8Array([0, 1, 2, 3, 255]);
		const request = new Request("http://taru.test/", { method: "POST", body: original });
		expect(await readAll(decodedBody(request, MAX_BODY_BYTES, { exceeded: false }))).toEqual(original);
	});

	it("cuts a body off past the cap and flags it, counting decoded bytes", async () => {
		const original = new Uint8Array(1000);
		const request = new Request("http://taru.test/", {
			method: "POST",
			headers: { "Content-Encoding": "gzip" },
			body: await gzip(original),
		});
		const limit = { exceeded: false };
		await expect(readAll(decodedBody(request, 999, limit))).rejects.toThrow(/exceeds 999 bytes/);
		expect(limit.exceeded).toBe(true);
	});
});
