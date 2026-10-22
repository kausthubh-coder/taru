// Reads a packfile (gitformat-pack(5)) as sent by `git push`: checks the trailer, inflates every entry and
// resolves deltas, including thin packs whose REF_DELTA bases live in the repo rather than in the pack.
// Awaits in loops are deliberate: each delta depends on the one before it, and the store is single-threaded.
/* oxlint-disable no-await-in-loop */

import { ZStream, Z_NO_FLUSH, Z_OK, Z_STREAM_END, zlibInflate, zlibInflateEnd, zlibInflateInit } from "pako";
import { bytesEqual, bytesToHex, decodeText, sha1 } from "./bytes.ts";
import { applyDelta } from "./delta.ts";
import { hashObject } from "./objects.ts";
import type { GitObject, ObjectType, Oid, Repo, StoredObject } from "./repo.ts";

const PACK_HEADER_LENGTH = 12;
const PACK_TRAILER_LENGTH = 20;

const OBJ_COMMIT = 1;
const OBJ_TREE = 2;
const OBJ_BLOB = 3;
const OBJ_TAG = 4;
const OBJ_OFS_DELTA = 6;
const OBJ_REF_DELTA = 7;

const TYPE_NAMES: Record<number, ObjectType> = { [OBJ_COMMIT]: "commit", [OBJ_TREE]: "tree", [OBJ_BLOB]: "blob", [OBJ_TAG]: "tag" };

export interface PackEntry {
	offset: number;
	/** Numeric pack type: 1 commit, 2 tree, 3 blob, 4 tag, 6 ofs-delta, 7 ref-delta. */
	type: number;
	/** Inflated bytes: the object body, or the delta instructions for types 6 and 7. */
	data: Uint8Array;
	baseOffset?: number;
	baseOid?: Oid;
}

/** Pulls every entry out of a pack without resolving deltas. Exported so tests can see what git sent. */
export async function scanPack(pack: Uint8Array): Promise<PackEntry[]> {
	if (pack.length < PACK_HEADER_LENGTH + PACK_TRAILER_LENGTH) throw new Error("pack too short");
	if (decodeText(pack.subarray(0, 4)) !== "PACK") throw new Error("bad pack signature");
	const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
	const version = view.getUint32(4);
	if (version !== 2 && version !== 3) throw new Error(`unsupported pack version ${version}`);
	const count = view.getUint32(8);

	const body = pack.subarray(0, pack.length - PACK_TRAILER_LENGTH);
	const expectedTrailer = pack.subarray(pack.length - PACK_TRAILER_LENGTH);
	if (!bytesEqual(await sha1(body), expectedTrailer)) throw new Error("pack checksum mismatch");

	const entries: PackEntry[] = [];
	let pos = PACK_HEADER_LENGTH;
	for (let i = 0; i < count; i++) {
		const offset = pos;
		let byte = body[pos++];
		const type = (byte >> 4) & 7;
		let size = byte & 15;
		let shift = 4;
		while (byte & 0x80) {
			byte = body[pos++];
			size += (byte & 0x7f) * 2 ** shift;
			shift += 7;
		}
		const entry: PackEntry = { offset, type, data: new Uint8Array(0) };
		if (type === OBJ_OFS_DELTA) {
			// Offset varint: each continuation adds one to the running value before shifting (git's quirk).
			byte = body[pos++];
			let distance = byte & 0x7f;
			while (byte & 0x80) {
				byte = body[pos++];
				distance = (distance + 1) * 128 + (byte & 0x7f);
			}
			entry.baseOffset = offset - distance;
			if (entry.baseOffset < PACK_HEADER_LENGTH) throw new Error("ofs-delta points before the pack body");
		} else if (type === OBJ_REF_DELTA) {
			entry.baseOid = bytesToHex(body.subarray(pos, pos + 20));
			pos += 20;
		} else if (!(type in TYPE_NAMES)) {
			throw new Error(`unknown pack entry type ${type}`);
		}
		if (pos > body.length) throw new Error("truncated pack entry header");

		const { data, consumed } = inflate(body, pos, size);
		entry.data = data;
		pos += consumed;
		entries.push(entry);
	}
	if (pos !== body.length) throw new Error(`pack has ${body.length - pos} trailing bytes`);
	return entries;
}

/**
 * Inflates one zlib stream starting at `offset`. The pack stores the uncompressed size but not the compressed
 * one, so the inflater has to report how much input it consumed to find the next entry.
 */
function inflate(input: Uint8Array, offset: number, size: number): { data: Uint8Array; consumed: number } {
	const strm = new ZStream();
	if (zlibInflateInit(strm) !== Z_OK) throw new Error("zlib init failed");
	strm.input = input;
	strm.next_in = offset;
	strm.avail_in = input.length - offset;
	// One extra byte of room lets zlib tell "stream ended exactly here" apart from "output full, more coming".
	const output = new Uint8Array(size + 1);
	strm.output = output;
	strm.next_out = 0;
	strm.avail_out = output.length;
	let status = zlibInflate(strm, Z_NO_FLUSH);
	while (status === Z_OK && strm.avail_in > 0 && strm.avail_out > 0) status = zlibInflate(strm, Z_NO_FLUSH);
	zlibInflateEnd(strm);
	// Output full before the stream ended means the entry is bigger than its header said.
	if (strm.avail_out === 0) throw new Error(`pack entry at ${offset} inflated to more than ${size} bytes the header said`);
	if (status !== Z_STREAM_END) throw new Error(`zlib inflate failed at offset ${offset}: ${strm.msg || status}`);
	if (strm.next_out !== size) throw new Error(`pack entry at ${offset} inflated to ${strm.next_out} bytes, header said ${size}`);
	return { data: output.subarray(0, size), consumed: strm.next_in - offset };
}

/** Thrown when a pack's objects, expanded, would be more than the caller can hold. */
export class ObjectBytesLimitError extends Error {
	/** HTTP status for callers that report it: the request is too large. */
	readonly status = 413;
}

/**
 * Reads a pack and returns every object in it, fully resolved. Thin-pack bases are read from `repo`.
 * Deltas make a pack much smaller than its objects (GitHub's 11 MB pack of express is 165 MB of objects), so a
 * caller with bounded memory passes `maxObjectBytes`, and reading stops with ObjectBytesLimitError past it.
 */
export async function readPack(pack: Uint8Array, repo: Repo, maxObjectBytes = Number.POSITIVE_INFINITY): Promise<StoredObject[]> {
	const entries = await scanPack(pack);
	const byOffset = new Map<number, StoredObject>();
	const byOid = new Map<Oid, StoredObject>();
	const objects: StoredObject[] = [];
	let objectBytes = 0;

	async function resolved(offset: number, type: ObjectType, data: Uint8Array): Promise<void> {
		objectBytes += data.length;
		if (objectBytes > maxObjectBytes) {
			throw new ObjectBytesLimitError(`the pack's objects unpack to over the ${maxObjectBytes} byte limit`);
		}
		const object: StoredObject = { type, data, oid: await hashObject({ type, data }) };
		byOffset.set(offset, object);
		byOid.set(object.oid, object);
		objects.push(object);
	}

	let pending: PackEntry[] = [];
	for (const entry of entries) {
		if (entry.type === OBJ_OFS_DELTA || entry.type === OBJ_REF_DELTA) pending.push(entry);
		else await resolved(entry.offset, TYPE_NAMES[entry.type], entry.data);
	}

	// Deltas can chain and a REF_DELTA may name a base that appears later in the pack, so resolve in rounds
	// until nothing is left or a round makes no progress (then a base is truly missing).
	const repoBases = new Map<Oid, GitObject | undefined>();
	while (pending.length > 0) {
		const stillPending: PackEntry[] = [];
		for (const entry of pending) {
			let base: GitObject | undefined;
			if (entry.baseOffset !== undefined) {
				base = byOffset.get(entry.baseOffset);
			} else {
				base = byOid.get(entry.baseOid!);
				if (!base) {
					if (!repoBases.has(entry.baseOid!)) repoBases.set(entry.baseOid!, await repo.getObject(entry.baseOid!));
					base = repoBases.get(entry.baseOid!);
				}
			}
			if (!base) {
				stillPending.push(entry);
				continue;
			}
			await resolved(entry.offset, base.type, applyDelta(base.data, entry.data));
		}
		if (stillPending.length === pending.length) {
			const first = stillPending[0];
			throw new Error(`delta base not found: ${first.baseOid ?? `offset ${first.baseOffset}`}`);
		}
		pending = stillPending;
	}
	return objects;
}
