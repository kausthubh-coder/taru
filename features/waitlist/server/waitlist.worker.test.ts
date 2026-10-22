import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { WAITLIST_SUCCESS } from "./waitlist.ts";

// exports.default is the Worker, called through the real runtime; env.DB is a real local D1 with the migrations
// from migrations/ applied by worker/vitest.setup.ts.
function post(body: string, contentType = "application/json") {
	return exports.default.fetch("http://taru.test/api/waitlist", {
		method: "POST",
		headers: { "content-type": contentType, "user-agent": "vitest" },
		body,
		// A plain form post answers with a redirect; keep it instead of following it to the page.
		redirect: "manual",
	});
}

async function rowsFor(email: string) {
	const { results } = await env.DB.prepare("SELECT email, role, note, user_agent FROM waitlist WHERE email = ?1")
		.bind(email)
		.all();
	return results;
}

describe("POST /api/waitlist", () => {
	it("stores a valid signup, lowercased and trimmed", async () => {
		const response = await post(JSON.stringify({ email: "  Ada@Example.com ", role: "tech lead", note: "" }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, message: WAITLIST_SUCCESS });

		expect(await rowsFor("ada@example.com")).toEqual([
			{ email: "ada@example.com", role: "tech lead", note: null, user_agent: "vitest" },
		]);
	});

	it("answers a duplicate signup like the first one and keeps one row", async () => {
		const first = await post(JSON.stringify({ email: "twice@example.com" }));
		const second = await post(JSON.stringify({ email: "TWICE@example.com", role: "founder" }));
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual(await first.json());

		const rows = await rowsFor("twice@example.com");
		expect(rows).toHaveLength(1);
		expect(rows[0].role).toBeNull();
	});

	it("rejects a bad email with 400 and stores nothing", async () => {
		const emails = ["not-an-email", "two@@example.com", "spaces in@example.com", "nodot@example", ""];
		const responses = await Promise.all(emails.map((email) => post(JSON.stringify({ email }))));
		const bodies = await Promise.all(responses.map((response) => response.json<{ error: string }>()));
		responses.forEach((response, i) => expect(response.status, emails[i]).toBe(400));
		for (const { error } of bodies) expect(error).toMatch(/email/i);
		const { results } = await env.DB.prepare("SELECT email FROM waitlist WHERE email LIKE '%nodot%'").all();
		expect(results).toEqual([]);
	});

	it("rejects a body that isn't a JSON object", async () => {
		expect((await post("just text")).status).toBe(400);
		expect((await post("[1,2]")).status).toBe(400);
	});

	it("rejects a note or role that is too long", async () => {
		const response = await post(JSON.stringify({ email: "long@example.com", note: "x".repeat(1001) }));
		expect(response.status).toBe(400);
		expect(await rowsFor("long@example.com")).toEqual([]);
	});

	it("refuses a body over 8 KB without storing it", async () => {
		const response = await post(JSON.stringify({ email: "big@example.com", note: "x".repeat(9000) }));
		expect(response.status).toBe(413);
		expect(await rowsFor("big@example.com")).toEqual([]);
	});

	it("answers GET with 405 and an Allow header", async () => {
		const response = await exports.default.fetch("http://taru.test/api/waitlist");
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	it("takes a plain form post (JavaScript off) and redirects back with #joined", async () => {
		const response = await post("email=Form%40Example.com&role=", "application/x-www-form-urlencoded");
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("/#joined");
		expect(await rowsFor("form@example.com")).toHaveLength(1);

		const bad = await post("email=nope", "application/x-www-form-urlencoded");
		expect(bad.status).toBe(303);
		expect(bad.headers.get("location")).toBe("/#bad-email");
	});
});
