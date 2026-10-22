// Pack writing and reading, including deltas and thin packs, checked against git index-pack.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflate } from "pako";
import { afterAll, describe, expect, test } from "vitest";
import { concatBytes, encodeText, hexToBytes, sha1 } from "./bytes.ts";
import { applyDelta } from "./delta.ts";
import { MemoryRepo } from "./memoryRepo.ts";
import { hashObject, serializeCommit, serializeTree } from "./objects.ts";
import { readPack, scanPack } from "./packReader.ts";
import { entryHeader, writePack } from "./packWriter.ts";
import type { StoredObject } from "./repo.ts";

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1103515245) + 12345) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

async function stored(type: StoredObject["type"], data: Uint8Array): Promise<StoredObject> {
	return { type, data, oid: await hashObject({ type, data }) };
}

async function sampleObjects(): Promise<StoredObject[]> {
	const empty = await stored("blob", new Uint8Array(0));
	const text = await stored("blob", encodeText("hello world\n"));
	const big = await stored("blob", pseudoRandomBytes(1_500_000, 7));
	const tree = await stored(
		"tree",
		serializeTree([
			{ mode: "100644", name: "empty", oid: empty.oid },
			{ mode: "100644", name: "hello.txt", oid: text.oid },
			{ mode: "100644", name: "big.bin", oid: big.oid },
		]),
	);
	const ident = "Taru Test <test@taru.dev> 1700000000 +0000";
	const commit = await stored("commit", serializeCommit({ tree: tree.oid, parents: [], author: ident, committer: ident, extraHeaders: [], message: "x\n" }));
	return [commit, tree, empty, text, big];
}

describe("pack entry header", () => {
	test("encodes type and size as git's varint", () => {
		expect([...entryHeader("blob", 0)]).toEqual([0x30]);
		expect([...entryHeader("commit", 15)]).toEqual([0x1f]);
		expect([...entryHeader("tree", 16)]).toEqual([0xa0, 0x01]);
		// 1_500_000 = 0x16e360: low nibble 0, then 93750 in 7-bit groups (54, 92, 5), little-endian.
		expect([...entryHeader("blob", 1_500_000)]).toEqual([0xb0, 0xb6, 0xdc, 0x05]);
	});
});

describe("pack write and read", () => {
	test("round-trips objects through a pack, which git index-pack accepts", async () => {
		const objects = await sampleObjects();
		const pack = await writePack(objects, objects.length);

		const back = await readPack(pack, new MemoryRepo());
		expect(back.map((object) => [object.oid, object.type])).toEqual(objects.map((object) => [object.oid, object.type]));
		for (let i = 0; i < objects.length; i++) expect(back[i].data).toEqual(objects[i].data);

		const dir = mkdtempSync(join(tmpdir(), "taru-pack-"));
		tempDirs.push(dir);
		const packPath = join(dir, "test.pack");
		writeFileSync(packPath, pack);
		const checksum = execFileSync("git", ["index-pack", "--strict", packPath], { encoding: "utf8" }).trim();
		expect(checksum).toMatch(/^[0-9a-f]{40}$/);
		expect(execFileSync("git", ["verify-pack", "-v", packPath], { encoding: "utf8" })).toContain(objects[4].oid);
	});

	test("rejects a pack with a bad checksum or a bad signature", async () => {
		const objects = await sampleObjects();
		const pack = await writePack(objects.slice(2, 4), 2);
		const corrupt = pack.slice();
		corrupt[corrupt.length - 1] ^= 0xff;
		await expect(readPack(corrupt, new MemoryRepo())).rejects.toThrow(/checksum/);
		const badSignature = pack.slice();
		badSignature[0] = 0x58;
		await expect(readPack(badSignature, new MemoryRepo())).rejects.toThrow(/signature/);
	});

	test("rejects an entry whose inflated size does not match its header", async () => {
		const body = concatBytes([packHeader(1), entryHeader("blob", 3), deflate(encodeText("hello"))]);
		const pack = concatBytes([body, await sha1(body)]);
		await expect(readPack(pack, new MemoryRepo())).rejects.toThrow(/inflated to|header said/);
	});
});

describe("deltas", () => {
	const base = encodeText("hello world");
	// copy "hello " (offset 0, size 6), insert "there ", copy "world" (offset 6, size 5), insert "!"
	const delta = Uint8Array.from([
		11, // base size
		18, // result size
		0x80 | 0x01 | 0x10, 0, 6,
		6, ...encodeText("there "),
		0x80 | 0x01 | 0x10, 6, 5,
		1, ...encodeText("!"),
	]);

	test("applies copy and insert instructions", () => {
		expect(applyDelta(base, delta)).toEqual(encodeText("hello there world!"));
	});

	test("rejects a delta whose base size does not match", () => {
		expect(() => applyDelta(encodeText("hello"), delta)).toThrow(/base size/);
	});

	test("resolves OFS_DELTA inside a pack and REF_DELTA against the repo (thin pack)", async () => {
		const repo = new MemoryRepo();
		const baseObject = await stored("blob", base);
		await repo.putObjects([baseObject]);
		const result = encodeText("hello there world!");
		const resultOid = await hashObject({ type: "blob", data: result });

		// Entry 1: a whole blob. Entry 2: OFS_DELTA against entry 1. Entry 3: REF_DELTA against the blob in the repo.
		const inPackBase = encodeText("hello world");
		const entry1 = concatBytes([entryHeader("blob", inPackBase.length), deflate(inPackBase)]);
		const entry2Offset = 12 + entry1.length;
		const distance = entry2Offset - 12;
		const entry2 = concatBytes([deltaHeader(6, delta.length), ofsVarint(distance), deflate(delta)]);
		const entry3 = concatBytes([deltaHeader(7, delta.length), hexToBytes(baseObject.oid), deflate(delta)]);
		const body = concatBytes([packHeader(3), entry1, entry2, entry3]);
		const pack = concatBytes([body, await sha1(body)]);

		const objects = await readPack(pack, repo);
		expect(objects.map((object) => object.oid)).toEqual([baseObject.oid, resultOid, resultOid]);
		expect(objects[1].data).toEqual(result);
		expect(objects[2].data).toEqual(result);
		expect((await scanPack(pack)).map((entry) => entry.type)).toEqual([3, 6, 7]);
	});

	test("fails when a REF_DELTA base is nowhere", async () => {
		const entry = concatBytes([deltaHeader(7, delta.length), hexToBytes("f".repeat(40)), deflate(delta)]);
		const body = concatBytes([packHeader(1), entry]);
		const pack = concatBytes([body, await sha1(body)]);
		await expect(readPack(pack, new MemoryRepo())).rejects.toThrow(/delta base not found/);
	});
});

function packHeader(count: number): Uint8Array {
	const header = new Uint8Array(12);
	header.set(encodeText("PACK"));
	new DataView(header.buffer).setUint32(4, 2);
	new DataView(header.buffer).setUint32(8, count);
	return header;
}

/** Entry header for numeric types 6 and 7, which the writer never emits. */
function deltaHeader(type: number, size: number): Uint8Array {
	const bytes: number[] = [];
	let first = (type << 4) | (size & 15);
	let rest = Math.floor(size / 16);
	if (rest > 0) first |= 0x80;
	bytes.push(first);
	while (rest > 0) {
		const low = rest % 128;
		rest = Math.floor(rest / 128);
		bytes.push(rest > 0 ? low | 0x80 : low);
	}
	return Uint8Array.from(bytes);
}

/** git's offset encoding for OFS_DELTA: big-endian 7-bit groups, each continuation byte's value offset by one. */
function ofsVarint(distance: number): Uint8Array {
	const bytes = [distance & 0x7f];
	let value = distance >> 7;
	while (value > 0) {
		value -= 1;
		bytes.unshift(0x80 | (value & 0x7f));
		value >>= 7;
	}
	return Uint8Array.from(bytes);
}
