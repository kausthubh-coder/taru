import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// exports.default is this Worker, called through the real runtime with the bindings from wrangler.jsonc.
async function call(path: string, init?: RequestInit) {
	return exports.default.fetch(`http://taru.test${path}`, init);
}

describe("worker routing", () => {
	it("answers unknown API paths with a JSON 404", async () => {
		const response = await call("/api/nope");
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "not found" });
	});
});
