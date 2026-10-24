import { describe, expect, test } from "vitest";
import { hrefFor, parentPath, parseRoute, shortRef, type Route } from "./routes.logic.ts";

describe("parseRoute and hrefFor", () => {
	const cases: [string, Route][] = [
		["/app", { screen: "repos" }],
		["/app/new", { screen: "new-repo" }],
		["/app/acme/shop", { screen: "tree", owner: "acme", name: "shop", path: "", ref: null }],
		["/app/acme/shop/tree/src/lib?ref=agent%2Ffix-cart", { screen: "tree", owner: "acme", name: "shop", path: "src/lib", ref: "agent/fix-cart" }],
		["/app/acme/shop/blob/src/a%20b.ts", { screen: "blob", owner: "acme", name: "shop", path: "src/a b.ts", ref: null }],
		["/app/acme/shop/edit/README.md?ref=main", { screen: "edit", owner: "acme", name: "shop", path: "README.md", ref: "main" }],
		["/app/acme/shop/new-file?dir=src", { screen: "new-file", owner: "acme", name: "shop", dir: "src", ref: null }],
		["/app/acme/shop/commits?page=3", { screen: "commits", owner: "acme", name: "shop", ref: null, page: 3 }],
		["/app/acme/shop/commit/7f3c2a1e7f3c2a1e7f3c2a1e7f3c2a1e7f3c2a1e", { screen: "commit", owner: "acme", name: "shop", rev: "7f3c2a1e7f3c2a1e7f3c2a1e7f3c2a1e7f3c2a1e" }],
		["/app/acme/shop/settings", { screen: "settings", owner: "acme", name: "shop" }],
	];

	test.each(cases)("%s", (url, route) => {
		const [pathname, search = ""] = url.split("?");
		expect(parseRoute(pathname, search ? `?${search}` : "")).toEqual(route);
		expect(hrefFor(route)).toBe(url);
	});

	test("anything else is not-found", () => {
		for (const url of ["/app/acme", "/app/acme/shop/nope", "/app/acme/shop/blob", "/app/acme/shop/settings/x", "/app/%E0%A4%A"]) {
			expect(parseRoute(url, "")).toEqual({ screen: "not-found" });
		}
	});

	test("a bad page number is page 1, and a trailing slash is ignored", () => {
		expect(parseRoute("/app/a/b/commits", "?page=-2")).toMatchObject({ page: 1 });
		expect(parseRoute("/app/a/b/", "")).toMatchObject({ screen: "tree", path: "" });
	});
});

test("shortRef and parentPath", () => {
	expect([shortRef("refs/heads/agent/fix"), shortRef("refs/tags/v1"), shortRef("refs/notes/x")]).toEqual(["agent/fix", "v1", "refs/notes/x"]);
	expect([parentPath("src/lib/a.ts"), parentPath("a.ts")]).toEqual(["src/lib", ""]);
});
