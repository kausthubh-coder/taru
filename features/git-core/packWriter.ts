// Writes a packfile for upload-pack. Every object is stored whole (no deltas): simpler, and clients
// re-delta on their side anyway. Layout: "PACK" + version 2 + count, entries, SHA-1 of everything before.

import { deflate } from "pako";
import { concatBytes, sha1 } from "./bytes.ts";
import type { GitObject, ObjectType } from "./repo.ts";

const PACK_TYPE: Record<ObjectType, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };

/** Type and size varint: low 4 size bits in the first byte with the type, then 7 bits per byte. */
export function entryHeader(type: ObjectType, size: number): Uint8Array {
	const bytes: number[] = [];
	let first = (PACK_TYPE[type] << 4) | (size & 15);
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

export async function writePack(objects: AsyncIterable<GitObject> | Iterable<GitObject>, count: number): Promise<Uint8Array> {
	const header = new Uint8Array(12);
	header.set([0x50, 0x41, 0x43, 0x4b]); // "PACK"
	new DataView(header.buffer).setUint32(4, 2);
	new DataView(header.buffer).setUint32(8, count);

	const chunks: Uint8Array[] = [header];
	let written = 0;
	for await (const object of objects) {
		chunks.push(entryHeader(object.type, object.data.length), deflate(object.data));
		written++;
	}
	if (written !== count) throw new Error(`pack header promised ${count} objects, wrote ${written}`);
	const body = concatBytes(chunks);
	return concatBytes([body, await sha1(body)]);
}
