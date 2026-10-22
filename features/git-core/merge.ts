// Server-side merge: merge base from the commit graph, a tree-level three-way merge, and diff3 for text
// files changed on both sides. Returns either a merged tree (with the new objects) or a conflict report.
// Nothing is stored here; the caller stores objects only when the merge is clean.

import { decodeText, encodeText } from "./bytes.ts";
import { diff3 } from "./diff3.ts";
import { hashObject, serializeTree, type TreeEntry } from "./objects.ts";
import type { Oid, Repo, StoredObject } from "./repo.ts";
import { readCommit } from "./revisions.ts";
import { readTree, TREE_MODE } from "./tree.ts";

export type ConflictKind = "content" | "binary" | "symlink" | "add/add" | "modify/delete" | "mode" | "file/directory";

export interface Conflict {
	path: string;
	kind: ConflictKind;
	base: Oid | null;
	ours: Oid | null;
	theirs: Oid | null;
	/** For "content": the file with conflict markers, as `git merge` would leave it in the working tree. */
	conflict_text?: string;
}

export type TreeMergeResult = { ok: true; tree: Oid; objects: StoredObject[] } | { ok: false; conflicts: Conflict[] };

export interface MergeLabels {
	ours: string;
	theirs: string;
}

/** All ancestors of `oid` including itself, walking the whole graph (repos are small for now). */
async function ancestors(repo: Repo, oid: Oid): Promise<Map<Oid, Oid[]>> {
	const seen = new Map<Oid, Oid[]>();
	const queue = [oid];
	while (queue.length > 0) {
		const current = queue.pop()!;
		if (seen.has(current)) continue;
		// oxlint-disable-next-line no-await-in-loop
		const commit = await readCommit(repo, current);
		seen.set(current, commit.parents);
		queue.push(...commit.parents);
	}
	return seen;
}

/**
 * The best common ancestor of two commits: a common ancestor no other common ancestor descends from.
 * When several qualify (a criss-cross history) the first found wins; git would merge the bases recursively.
 */
export async function mergeBase(repo: Repo, a: Oid, b: Oid): Promise<Oid | null> {
	const fromA = await ancestors(repo, a);
	const fromB = await ancestors(repo, b);
	const common = new Set([...fromA.keys()].filter((oid) => fromB.has(oid)));
	if (common.size === 0) return null;
	// Drop every common ancestor that another common ancestor reaches through its parents.
	const dominated = new Set<Oid>();
	for (const oid of common) {
		const queue = [...fromA.get(oid)!];
		while (queue.length > 0) {
			const parent = queue.pop()!;
			if (dominated.has(parent)) continue;
			dominated.add(parent);
			queue.push(...(fromA.get(parent) ?? []));
		}
	}
	for (const oid of common) if (!dominated.has(oid)) return oid;
	return null;
}

export async function isAncestor(repo: Repo, ancestor: Oid, descendant: Oid): Promise<boolean> {
	return (await ancestors(repo, descendant)).has(ancestor);
}

/** git's heuristic: a NUL in the first 8000 bytes means binary. */
export function isBinary(data: Uint8Array): boolean {
	const end = Math.min(data.length, 8000);
	for (let i = 0; i < end; i++) if (data[i] === 0) return true;
	return false;
}

export async function mergeTrees(repo: Repo, base: Oid | null, ours: Oid, theirs: Oid, labels: MergeLabels): Promise<TreeMergeResult> {
	const objects: StoredObject[] = [];
	const conflicts: Conflict[] = [];
	const tree = await mergeFolder(repo, "", base, ours, theirs, labels, objects, conflicts);
	if (conflicts.length > 0) return { ok: false, conflicts };
	return { ok: true, tree: tree ?? (await storeTree([], objects)), objects };
}

function sameEntry(a: TreeEntry | undefined, b: TreeEntry | undefined): boolean {
	if (!a || !b) return a === b;
	return a.mode === b.mode && a.oid === b.oid;
}

async function storeTree(entries: TreeEntry[], objects: StoredObject[]): Promise<Oid> {
	const data = serializeTree(entries);
	const oid = await hashObject({ type: "tree", data });
	objects.push({ type: "tree", data, oid });
	return oid;
}

/** Returns the merged folder's tree oid, or null when it would be empty. Conflicts are appended, not thrown. */
async function mergeFolder(
	repo: Repo,
	prefix: string,
	base: Oid | null,
	ours: Oid | null,
	theirs: Oid | null,
	labels: MergeLabels,
	objects: StoredObject[],
	conflicts: Conflict[],
): Promise<Oid | null> {
	if (ours === theirs || theirs === base) return ours;
	if (ours === base) return theirs;
	const entriesOf = async (oid: Oid | null) => new Map((oid ? await readTree(repo, oid) : []).map((e) => [e.name, e]));
	const [b, o, t] = await Promise.all([entriesOf(base), entriesOf(ours), entriesOf(theirs)]);
	const names = [...new Set([...b.keys(), ...o.keys(), ...t.keys()])];

	const merged: TreeEntry[] = [];
	let changed = false;
	for (const name of names) {
		const path = prefix ? `${prefix}/${name}` : name;
		// oxlint-disable-next-line no-await-in-loop
		const result = await mergeEntry(repo, path, b.get(name), o.get(name), t.get(name), labels, objects, conflicts);
		if (!sameEntry(result, o.get(name))) changed = true;
		if (result) merged.push({ ...result, name });
	}
	if (!changed) return ours;
	if (merged.length === 0) return null;
	return storeTree(merged, objects);
}

function isTree(entry: TreeEntry | undefined): boolean {
	return entry?.mode === TREE_MODE;
}

async function mergeEntry(
	repo: Repo,
	path: string,
	base: TreeEntry | undefined,
	ours: TreeEntry | undefined,
	theirs: TreeEntry | undefined,
	labels: MergeLabels,
	objects: StoredObject[],
	conflicts: Conflict[],
): Promise<TreeEntry | undefined> {
	if (sameEntry(ours, theirs) || sameEntry(theirs, base)) return ours;
	if (sameEntry(ours, base)) return theirs;

	const conflict = (kind: Conflict["kind"], extra: Partial<Conflict> = {}): undefined => {
		conflicts.push({ path, kind, base: base?.oid ?? null, ours: ours?.oid ?? null, theirs: theirs?.oid ?? null, ...extra });
		return undefined;
	};

	// Both sides changed it, differently.
	if (isTree(ours) && isTree(theirs)) {
		const subtree = await mergeFolder(repo, path, isTree(base) ? base!.oid : null, ours!.oid, theirs!.oid, labels, objects, conflicts);
		return subtree ? { mode: TREE_MODE, name: ours!.name, oid: subtree } : undefined;
	}
	if (!ours || !theirs) return conflict("modify/delete");
	if (isTree(ours) || isTree(theirs)) return conflict("file/directory");
	if (!base || isTree(base)) return conflict("add/add");

	// One side changed only the mode and the other only the content: both changes apply.
	if (ours.oid === base.oid && theirs.mode === base.mode) return { mode: ours.mode, name: ours.name, oid: theirs.oid };
	if (theirs.oid === base.oid && ours.mode === base.mode) return { mode: theirs.mode, name: ours.name, oid: ours.oid };
	if (ours.mode !== theirs.mode) return conflict("mode");
	if (ours.mode === "120000") return conflict("symlink");

	const [baseBlob, ourBlob, theirBlob] = await Promise.all([blob(repo, base.oid), blob(repo, ours.oid), blob(repo, theirs.oid)]);
	if (isBinary(baseBlob) || isBinary(ourBlob) || isBinary(theirBlob)) return conflict("binary");
	const merged = diff3(decodeText(baseBlob), decodeText(ourBlob), decodeText(theirBlob), labels);
	if (merged.conflicts > 0) return conflict("content", { conflict_text: merged.text });
	const data = encodeText(merged.text);
	const oid = await hashObject({ type: "blob", data });
	objects.push({ type: "blob", data, oid });
	return { mode: ours.mode, name: ours.name, oid };
}

async function blob(repo: Repo, oid: Oid): Promise<Uint8Array> {
	const object = await repo.getObject(oid);
	if (!object) throw new Error(`missing blob ${oid}`);
	return object.data;
}
