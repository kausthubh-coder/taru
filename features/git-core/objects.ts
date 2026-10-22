// Git object formats: hashing, and parsing/serializing commit, tree and tag bodies.
// A blob is just bytes, so it has no parser. The formats are documented in gitformat-*(5) manpages.

import { concatBytes, decodeText, encodeText, hexToBytes, bytesToHex, sha1Hex } from "./bytes.ts";
import type { GitObject, ObjectType, Oid } from "./repo.ts";

export const ZERO_OID = "0".repeat(40);

/** "<type> <size>\0": the header git hashes in front of every object body. */
export function objectHeader(type: ObjectType, size: number): Uint8Array {
	return encodeText(`${type} ${size}\0`);
}

export async function hashObject(object: GitObject): Promise<Oid> {
	return sha1Hex(concatBytes([objectHeader(object.type, object.data.length), object.data]));
}

export interface Commit {
	tree: Oid;
	parents: Oid[];
	/** Raw ident: "Name <email> <unix seconds> <tz>". */
	author: string;
	committer: string;
	/** Other headers (gpgsig, encoding, ...) kept verbatim so a parsed commit re-serializes to the same bytes. */
	extraHeaders: { name: string; value: string }[];
	message: string;
}

export function parseCommit(data: Uint8Array): Commit {
	const { headers, message } = splitHeaders(data);
	const commit: Commit = { tree: "", parents: [], author: "", committer: "", extraHeaders: [], message };
	for (const { name, value } of headers) {
		if (name === "tree") commit.tree = value;
		else if (name === "parent") commit.parents.push(value);
		else if (name === "author") commit.author = value;
		else if (name === "committer") commit.committer = value;
		else commit.extraHeaders.push({ name, value });
	}
	if (!commit.tree) throw new Error("commit has no tree");
	return commit;
}

export function serializeCommit(commit: Commit): Uint8Array {
	let text = `tree ${commit.tree}\n`;
	for (const parent of commit.parents) text += `parent ${parent}\n`;
	text += `author ${commit.author}\ncommitter ${commit.committer}\n`;
	for (const { name, value } of commit.extraHeaders) text += `${name} ${foldHeaderValue(value)}\n`;
	return encodeText(`${text}\n${commit.message}`);
}

/** Unix seconds from an ident line; 0 when the ident is malformed, which only affects walk ordering. */
export function identTimestamp(ident: string): number {
	const match = /> (\d+) [+-]\d{4}$/.exec(ident);
	return match ? Number(match[1]) : 0;
}

export interface TreeEntry {
	/** Octal mode as git stores it: "100644", "100755", "120000", "40000", "160000". */
	mode: string;
	name: string;
	oid: Oid;
}

export function parseTree(data: Uint8Array): TreeEntry[] {
	const entries: TreeEntry[] = [];
	let pos = 0;
	while (pos < data.length) {
		const space = data.indexOf(0x20, pos);
		const nul = data.indexOf(0, space);
		if (space < 0 || nul < 0 || nul + 20 > data.length) throw new Error("malformed tree entry");
		entries.push({
			mode: decodeText(data.subarray(pos, space)),
			name: decodeText(data.subarray(space + 1, nul)),
			oid: bytesToHex(data.subarray(nul + 1, nul + 21)),
		});
		pos = nul + 21;
	}
	return entries;
}

/** Git sorts entries by name, with directories compared as if their name ended in "/". */
export function serializeTree(entries: TreeEntry[]): Uint8Array {
	const sorted = entries.map((entry) => ({ entry, key: encodeText(entry.mode === "40000" ? `${entry.name}/` : entry.name) }));
	sorted.sort((a, b) => compareBytes(a.key, b.key));
	const chunks: Uint8Array[] = [];
	for (const { entry } of sorted) {
		chunks.push(encodeText(`${entry.mode} ${entry.name}\0`), hexToBytes(entry.oid));
	}
	return concatBytes(chunks);
}

export interface Tag {
	object: Oid;
	type: ObjectType;
	tag: string;
	tagger: string | null;
	message: string;
}

export function parseTag(data: Uint8Array): Tag {
	const { headers, message } = splitHeaders(data);
	const tag: Tag = { object: "", type: "commit", tag: "", tagger: null, message };
	for (const { name, value } of headers) {
		if (name === "object") tag.object = value;
		else if (name === "type") tag.type = value as ObjectType;
		else if (name === "tag") tag.tag = value;
		else if (name === "tagger") tag.tagger = value;
	}
	if (!tag.object) throw new Error("tag has no object");
	return tag;
}

export function serializeTag(tag: Tag): Uint8Array {
	let text = `object ${tag.object}\ntype ${tag.type}\ntag ${tag.tag}\n`;
	if (tag.tagger) text += `tagger ${tag.tagger}\n`;
	return encodeText(`${text}\n${tag.message}`);
}

/** Headers end at the first blank line. A line starting with a space continues the previous header (gpgsig). */
function splitHeaders(data: Uint8Array): { headers: { name: string; value: string }[]; message: string } {
	const text = decodeText(data);
	const blank = text.indexOf("\n\n");
	const headerText = blank < 0 ? text : text.slice(0, blank);
	const message = blank < 0 ? "" : text.slice(blank + 2);
	const headers: { name: string; value: string }[] = [];
	for (const line of headerText.split("\n")) {
		if (line.startsWith(" ") && headers.length > 0) {
			headers[headers.length - 1].value += `\n${line.slice(1)}`;
			continue;
		}
		const space = line.indexOf(" ");
		if (space < 0) continue;
		headers.push({ name: line.slice(0, space), value: line.slice(space + 1) });
	}
	return { headers, message };
}

function foldHeaderValue(value: string): string {
	return value.replaceAll("\n", "\n ");
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return a.length - b.length;
}
