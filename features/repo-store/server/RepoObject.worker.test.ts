import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { StoredObject } from "../../git-core/repo.ts";
import { DEFAULT_HEAD, R2_OBJECT_THRESHOLD, r2KeyFor, RepoObject } from "./RepoObject.ts";

// Ids are trusted by the contract, so tests use fake oids: the label's bytes as hex, zero-padded to 40.
function oid(label: string): string {
	return Array.from(label, (c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
		.join("")
		.padEnd(40, "0");
}

function blob(label: string, size: number): StoredObject {
	const data = new Uint8Array(size);
	for (let i = 0; i < size; i++) data[i] = (i * 31 + label.length) & 0xff;
	return { oid: oid(label), type: "blob", data };
}

// toEqual walks a half-megabyte array element by element with diff bookkeeping, which takes seconds;
// a plain byte loop gives the same answer instantly.
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false;
	for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
	return true;
}

const commit: StoredObject = { oid: oid("c1"), type: "commit", data: new TextEncoder().encode("tree abc\n\nfirst\n") };
const tree: StoredObject = { oid: oid("t1"), type: "tree", data: new Uint8Array([1, 2, 3, 4, 5]) };

describe("RepoObject as a Repo", () => {
	it("stores small objects inline and returns them byte for byte", async () => {
		const repo = env.REPO.getByName("t/small");
		await repo.putObjects([commit, tree]);

		expect(await repo.getObject(commit.oid)).toEqual({ type: "commit", data: commit.data });
		expect(await repo.getObject(tree.oid)).toEqual({ type: "tree", data: tree.data });
		expect(await repo.getObject(oid("missing"))).toBeUndefined();

		const row = await runInDurableObject(repo, (_instance: RepoObject, state) =>
			state.storage.sql.exec<{ in_r2: number; size: number }>("SELECT in_r2, size FROM objects WHERE oid = ?", tree.oid).one(),
		);
		expect(row).toEqual({ in_r2: 0, size: 5 });
		expect(await env.BLOBS.head(r2KeyFor(tree.oid))).toBeNull();
	});

	it("puts a large blob in R2 and reads it back through the same contract", async () => {
		const repo = env.REPO.getByName("t/large");
		const big = blob("big", R2_OBJECT_THRESHOLD + 1);
		const edge = blob("edge", R2_OBJECT_THRESHOLD);
		await repo.putObjects([big, edge]);

		const stored = await env.BLOBS.get(r2KeyFor(big.oid));
		expect(stored).not.toBeNull();
		expect(sameBytes(new Uint8Array(await stored!.arrayBuffer()), big.data)).toBe(true);
		expect(await env.BLOBS.head(r2KeyFor(edge.oid))).toBeNull();

		const rows = await runInDurableObject(repo, (_instance: RepoObject, state) =>
			state.storage.sql
				.exec<{ oid: string; in_r2: number; data: ArrayBuffer | null }>("SELECT oid, in_r2, data FROM objects ORDER BY oid")
				.toArray(),
		);
		expect(rows.map((r) => [r.oid, r.in_r2, r.data === null])).toEqual([
			[big.oid, 1, true],
			[edge.oid, 0, false],
		]);

		const readBig = await repo.getObject(big.oid);
		const readEdge = await repo.getObject(edge.oid);
		expect(readBig?.type).toBe("blob");
		expect(sameBytes(readBig!.data, big.data)).toBe(true);
		expect(readEdge?.type).toBe("blob");
		expect(sameBytes(readEdge!.data, edge.data)).toBe(true);
	});

	it("putObjects is idempotent", async () => {
		const repo = env.REPO.getByName("t/idempotent");
		await repo.putObjects([commit]);
		await repo.putObjects([commit, tree]);
		expect(await repo.hasObjects([commit.oid, tree.oid])).toEqual(new Set([commit.oid, tree.oid]));
	});

	it("hasObjects returns the subset it has, in any batch size", async () => {
		const repo = env.REPO.getByName("t/has");
		const objects = Array.from({ length: 150 }, (_, i) => blob(`b${i}`, 8));
		await repo.putObjects(objects);

		const asked = [...objects.map((o) => o.oid), oid("nope1"), oid("nope2")];
		const found = await repo.hasObjects(asked);
		expect(found.size).toBe(150);
		expect(found.has(oid("nope1"))).toBe(false);
		expect(await repo.hasObjects([oid("nope1")])).toEqual(new Set());
		expect(await repo.hasObjects([])).toEqual(new Set());
	});

	it("creates, updates and deletes refs", async () => {
		const repo = env.REPO.getByName("t/refs");
		expect(await repo.listRefs()).toEqual(new Map());

		expect(await repo.updateRefs([{ ref: "refs/heads/main", old: null, new: oid("a") }])).toEqual([
			{ ref: "refs/heads/main", ok: true },
		]);
		expect(await repo.updateRefs([{ ref: "refs/heads/main", old: oid("a"), new: oid("b") }])).toEqual([
			{ ref: "refs/heads/main", ok: true },
		]);
		expect(await repo.updateRefs([{ ref: "refs/tags/v1", old: null, new: oid("b") }])).toEqual([
			{ ref: "refs/tags/v1", ok: true },
		]);
		expect(await repo.listRefs()).toEqual(
			new Map([
				["refs/heads/main", oid("b")],
				["refs/tags/v1", oid("b")],
			]),
		);

		expect(await repo.updateRefs([{ ref: "refs/tags/v1", old: oid("b"), new: null }])).toEqual([{ ref: "refs/tags/v1", ok: true }]);
		expect(await repo.listRefs()).toEqual(new Map([["refs/heads/main", oid("b")]]));
	});

	it("rejects the whole batch when one old value mismatches", async () => {
		const repo = env.REPO.getByName("t/cas");
		await repo.updateRefs([
			{ ref: "refs/heads/main", old: null, new: oid("a") },
			{ ref: "refs/heads/dev", old: null, new: oid("d") },
		]);

		const results = await repo.updateRefs([
			{ ref: "refs/heads/main", old: oid("a"), new: oid("b") },
			{ ref: "refs/heads/dev", old: oid("stale"), new: oid("e") },
			{ ref: "refs/heads/new", old: null, new: oid("n") },
		]);
		expect(results).toEqual([
			{ ref: "refs/heads/main", ok: false, reason: "not applied: another ref in the same update failed" },
			{ ref: "refs/heads/dev", ok: false, reason: `expected ${oid("stale")} but found ${oid("d")}` },
			{ ref: "refs/heads/new", ok: false, reason: "not applied: another ref in the same update failed" },
		]);
		expect(await repo.listRefs()).toEqual(
			new Map([
				["refs/heads/dev", oid("d")],
				["refs/heads/main", oid("a")],
			]),
		);

		// Creating a ref that already exists is a mismatch too.
		expect(await repo.updateRefs([{ ref: "refs/heads/main", old: null, new: oid("z") }])).toEqual([
			{ ref: "refs/heads/main", ok: false, reason: `expected no ref but found ${oid("a")}` },
		]);
	});

	it("HEAD points at refs/heads/main after init", async () => {
		const repo = env.REPO.getByName("t/head");
		await repo.init();
		expect(await repo.headTarget()).toBe(DEFAULT_HEAD);
		await repo.init();
		expect(await repo.headTarget()).toBe("refs/heads/main");
		const meta = await runInDurableObject(repo, (_instance: RepoObject, state) =>
			state.storage.sql.exec<{ key: string }>("SELECT key FROM meta ORDER BY key").toArray(),
		);
		expect(meta.map((m) => m.key)).toEqual(["HEAD", "created_at"]);
	});

	it("keeps data across separate stub calls", async () => {
		await env.REPO.getByName("t/persist").putObjects([commit]);
		await env.REPO.getByName("t/persist").updateRefs([{ ref: "refs/heads/main", old: null, new: commit.oid }]);

		const again = env.REPO.getByName("t/persist");
		expect(await again.getObject(commit.oid)).toEqual({ type: "commit", data: commit.data });
		expect(await again.listRefs()).toEqual(new Map([["refs/heads/main", commit.oid]]));
	});

	it("keeps two repos apart", async () => {
		const a = env.REPO.getByName("t/a");
		const b = env.REPO.getByName("t/b");
		await a.putObjects([commit]);
		await a.updateRefs([{ ref: "refs/heads/main", old: null, new: commit.oid }]);

		expect(await b.hasObjects([commit.oid])).toEqual(new Set());
		expect(await b.getObject(commit.oid)).toBeUndefined();
		expect(await b.listRefs()).toEqual(new Map());
	});
});
