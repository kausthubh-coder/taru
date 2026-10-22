// Object hashing and formats, checked against the real git binary.

import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { decodeText, encodeText } from "./bytes.ts";
import {
	hashObject,
	identTimestamp,
	parseCommit,
	parseTag,
	parseTree,
	serializeCommit,
	serializeTag,
	serializeTree,
	type Commit,
	type Tag,
	type TreeEntry,
} from "./objects.ts";
import type { ObjectType } from "./repo.ts";

function gitHashObject(type: ObjectType, data: Uint8Array): string {
	return execFileSync("git", ["-c", "core.autocrlf=false", "hash-object", "-t", type, "--stdin"], { input: data, encoding: "utf8" }).trim();
}

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1103515245) + 12345) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

const IDENT = "Taru Test <test@taru.dev> 1700000000 +0100";

describe("object hashing matches git hash-object", () => {
	test("blobs: empty, text, binary, over 1 MB", async () => {
		const blobs = [new Uint8Array(0), encodeText("hello\n"), pseudoRandomBytes(4096, 1), pseudoRandomBytes(1_200_000, 2)];
		const ours = await Promise.all(blobs.map((data) => hashObject({ type: "blob", data })));
		expect(ours).toEqual(blobs.map((data) => gitHashObject("blob", data)));
	});

	test("empty blob has git's well-known id", async () => {
		expect(await hashObject({ type: "blob", data: new Uint8Array(0) })).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
	});

	test("commit, tree and tag bodies", async () => {
		const blobOid = await hashObject({ type: "blob", data: encodeText("hello\n") });
		const entries: TreeEntry[] = [
			{ mode: "100644", name: "b.txt", oid: blobOid },
			{ mode: "40000", name: "a", oid: "4b825dc642cb6eb9a060e54bf8d69288fbee4904" },
			{ mode: "100755", name: "a.sh", oid: blobOid },
		];
		const tree = serializeTree(entries);
		const treeOid = await hashObject({ type: "tree", data: tree });
		expect(treeOid).toBe(gitHashObject("tree", tree));

		const commit: Commit = { tree: treeOid, parents: [], author: IDENT, committer: IDENT, extraHeaders: [], message: "first\n" };
		const commitData = serializeCommit(commit);
		const commitOid = await hashObject({ type: "commit", data: commitData });
		expect(commitOid).toBe(gitHashObject("commit", commitData));

		const tag: Tag = { object: commitOid, type: "commit", tag: "v1", tagger: IDENT, message: "release\n" };
		const tagData = serializeTag(tag);
		expect(await hashObject({ type: "tag", data: tagData })).toBe(gitHashObject("tag", tagData));
	});
});

describe("tree format", () => {
	test("serializes in git's order (directories sort as name/) and matches git mktree", async () => {
		const blobOid = "ce013625030ba8dba906f756967f9e9ca394464a";
		const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
		const entries: TreeEntry[] = [
			{ mode: "100644", name: "a.txt", oid: blobOid },
			{ mode: "40000", name: "a", oid: emptyTree },
			{ mode: "100644", name: "a-b", oid: blobOid },
			{ mode: "100644", name: "a0", oid: blobOid },
		];
		const tree = serializeTree(entries);
		// Bytewise: "-" < "." < "/" (the directory sorts as "a/") < "0".
		expect(parseTree(tree).map((entry) => entry.name)).toEqual(["a-b", "a.txt", "a", "a0"]);

		const mktreeInput = entries.map((entry) => `${entry.mode === "40000" ? "040000 tree" : `${entry.mode} blob`} ${entry.oid}\t${entry.name}`).join("\n");
		const gitTreeOid = execFileSync("git", ["mktree", "--missing"], { input: `${mktreeInput}\n`, encoding: "utf8" }).trim();
		expect(await hashObject({ type: "tree", data: tree })).toBe(gitTreeOid);
	});

	test("parses what it serialized", () => {
		const entries: TreeEntry[] = [{ mode: "100644", name: "x", oid: "ce013625030ba8dba906f756967f9e9ca394464a" }];
		expect(parseTree(serializeTree(entries))).toEqual(entries);
	});
});

describe("commit and tag parsing", () => {
	test("round-trips a commit with parents and a multi-line gpgsig header", () => {
		const commit: Commit = {
			tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
			parents: ["a".repeat(40), "b".repeat(40)],
			author: IDENT,
			committer: "Other <o@x.dev> 1700000500 -0500",
			extraHeaders: [{ name: "gpgsig", value: "-----BEGIN PGP SIGNATURE-----\nabc\n-----END PGP SIGNATURE-----" }],
			message: "subject\n\nbody line\n",
		};
		const data = serializeCommit(commit);
		expect(decodeText(data)).toContain("gpgsig -----BEGIN PGP SIGNATURE-----\n abc\n -----END");
		const parsed = parseCommit(data);
		expect(parsed).toEqual(commit);
		expect(identTimestamp(parsed.committer)).toBe(1700000500);
	});

	test("round-trips a tag", () => {
		const tag: Tag = { object: "c".repeat(40), type: "commit", tag: "v2", tagger: IDENT, message: "msg\n" };
		expect(parseTag(serializeTag(tag))).toEqual(tag);
	});
});
