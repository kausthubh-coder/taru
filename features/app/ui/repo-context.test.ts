import { expect, test } from "vitest";
import type { RepoDetail } from "./api.ts";
import { isBranch, refOptions } from "./repo-context.ts";

const repo: RepoDetail = {
	owner: "acme",
	name: "shop",
	created_at: "2026-11-04T00:00:00Z",
	clone_url: "http://localhost/acme/shop.git",
	head: "refs/heads/main",
	refs: { "refs/heads/main": "a".repeat(40), "refs/heads/v1": "b".repeat(40), "refs/tags/v1": "c".repeat(40), "refs/tags/v2": "d".repeat(40) },
	mirror: null,
};

test("a tag with a branch's name gets its own value, and picking it selects the tag", () => {
	const options = refOptions(repo, "refs/tags/v1");
	expect(options.branches).toEqual([
		{ value: "main", label: "main" },
		{ value: "v1", label: "v1" },
	]);
	expect(options.tags).toEqual([
		{ value: "refs/tags/v2", label: "v2" },
		{ value: "refs/tags/v1", label: "v1" },
	]);
	expect(options.selected).toBe("refs/tags/v1");
	expect(options.other).toBeNull();
	// The short name stays the branch, the way the server resolves it.
	expect(refOptions(repo, "v1").selected).toBe("v1");
});

test("a short name that is only a tag selects the tag; a commit id gets its own option", () => {
	expect(refOptions(repo, "v2")).toMatchObject({ selected: "refs/tags/v2", other: null });
	expect(refOptions(repo, "f".repeat(40))).toMatchObject({ selected: "f".repeat(40), other: { value: "f".repeat(40), label: "fffffff" } });
});

test("only branches can be edited", () => {
	expect(isBranch(repo, "v1")).toBe(true);
	expect(isBranch(repo, "refs/tags/v1")).toBe(false);
	expect(isBranch(repo, "v2")).toBe(false);
	expect(isBranch(repo, "main")).toBe(true);
});
