// Reading paths out of trees, and building new trees from a set of file changes. Pure: trees come from the
// Repo and new objects are returned to the caller, who decides whether to store them.

import { hashObject, parseTree, serializeTree, type TreeEntry } from "./objects.ts";
import type { Oid, Repo, StoredObject } from "./repo.ts";

export const TREE_MODE = "40000";
export type FileMode = "100644" | "100755" | "120000";

export function isFileMode(value: unknown): value is FileMode {
	return value === "100644" || value === "100755" || value === "120000";
}

/** Why `path` can't name a file in a repo, or null if it can. Paths are "/"-separated, relative, no "." or "..". */
export function pathProblem(path: unknown): string | null {
	if (typeof path !== "string") return "must be a string";
	if (path.length === 0) return "must not be empty";
	if (path.startsWith("/")) return "must be relative (no leading '/')";
	if (path.length > 4096) return "must be at most 4096 characters";
	for (const segment of path.split("/")) {
		if (segment.length === 0) return "must not have empty segments (no '//' or trailing '/')";
		if (segment === "." || segment === "..") return "must not contain '.' or '..' segments";
		if (segment.toLowerCase() === ".git") return "must not contain a '.git' segment";
		if (segment.includes("\0")) return "must not contain NUL";
	}
	return null;
}

export async function readTree(repo: Repo, treeOid: Oid): Promise<TreeEntry[]> {
	const object = await repo.getObject(treeOid);
	if (!object) throw new Error(`missing tree ${treeOid}`);
	if (object.type !== "tree") throw new Error(`${treeOid} is a ${object.type}, not a tree`);
	return parseTree(object.data);
}

/** The entry at `path` under `treeOid`, or undefined when a segment is missing or a file is used as a folder. */
export async function readPath(repo: Repo, treeOid: Oid, path: string): Promise<TreeEntry | undefined> {
	let entry: TreeEntry = { mode: TREE_MODE, name: "", oid: treeOid };
	for (const segment of path.split("/")) {
		if (entry.mode !== TREE_MODE) return undefined;
		// oxlint-disable-next-line no-await-in-loop
		const found = (await readTree(repo, entry.oid)).find((e) => e.name === segment);
		if (!found) return undefined;
		entry = found;
	}
	return entry;
}

export type FileChange =
	| { path: string; content: Uint8Array; mode?: FileMode }
	| { path: string; delete: true };

export interface TreeBuild {
	tree: Oid;
	/** New blobs and trees, ready for putObjects. Unchanged subtrees aren't included. */
	objects: StoredObject[];
}

/** Why `changes` can't be applied together, or null. */
export function changesProblem(changes: FileChange[]): string | null {
	if (changes.length === 0) return "must have at least one change";
	const paths = new Set<string>();
	for (const change of changes) {
		const problem = pathProblem(change.path);
		if (problem) return `path ${JSON.stringify(change.path)} ${problem}`;
		if (paths.has(change.path)) return `path ${JSON.stringify(change.path)} appears twice`;
		paths.add(change.path);
	}
	// A path can't be both a file and a folder in one tree.
	for (const path of paths) {
		for (const other of paths) {
			if (other !== path && other.startsWith(`${path}/`)) return `path ${JSON.stringify(path)} is also used as a folder`;
		}
	}
	return null;
}

/**
 * Applies `changes` to the tree `baseTree` (null for an empty tree). Folders are created as needed and
 * folders left empty disappear, as in git. Deleting a missing path is fine; writing through a file as if
 * it were a folder replaces the file. The mode of an existing file is kept unless the change sets one.
 */
export async function applyChanges(repo: Repo, baseTree: Oid | null, changes: FileChange[]): Promise<TreeBuild> {
	const problem = changesProblem(changes);
	if (problem) throw new Error(problem);
	const objects: StoredObject[] = [];
	const tree = await rebuild(repo, baseTree, changes.map((change) => ({ segments: change.path.split("/"), change })), objects);
	return { tree: tree ?? (await emptyTree(objects)), objects };
}

interface PendingChange {
	segments: string[];
	change: FileChange;
}

/** Returns the new tree's oid, or null when the folder ends up empty. */
async function rebuild(repo: Repo, treeOid: Oid | null, pending: PendingChange[], objects: StoredObject[]): Promise<Oid | null> {
	const entries = new Map<string, TreeEntry>();
	if (treeOid) for (const entry of await readTree(repo, treeOid)) entries.set(entry.name, entry);

	const byFolder = new Map<string, PendingChange[]>();
	for (const item of pending) {
		const [name, ...rest] = item.segments;
		if (rest.length === 0) {
			if ("delete" in item.change) {
				entries.delete(name);
				continue;
			}
			const existing = entries.get(name);
			const mode = item.change.mode ?? (existing && existing.mode !== TREE_MODE ? existing.mode : "100644");
			const blob: StoredObject = { type: "blob", data: item.change.content, oid: "" };
			// oxlint-disable-next-line no-await-in-loop
			blob.oid = await hashObject(blob);
			objects.push(blob);
			entries.set(name, { mode, name, oid: blob.oid });
		} else {
			const list = byFolder.get(name) ?? [];
			list.push({ segments: rest, change: item.change });
			byFolder.set(name, list);
		}
	}

	for (const [name, children] of byFolder) {
		const existing = entries.get(name);
		const subtree = existing?.mode === TREE_MODE ? existing.oid : null;
		// oxlint-disable-next-line no-await-in-loop
		const rebuilt = await rebuild(repo, subtree, children, objects);
		if (rebuilt === null) entries.delete(name);
		else entries.set(name, { mode: TREE_MODE, name, oid: rebuilt });
	}

	if (entries.size === 0) return null;
	const data = serializeTree([...entries.values()]);
	const oid = await hashObject({ type: "tree", data });
	objects.push({ type: "tree", data, oid });
	return oid;
}

async function emptyTree(objects: StoredObject[]): Promise<Oid> {
	const data = new Uint8Array(0);
	const oid = await hashObject({ type: "tree", data });
	objects.push({ type: "tree", data, oid });
	return oid;
}
