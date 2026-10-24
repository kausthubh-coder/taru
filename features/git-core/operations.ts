// What an agent does to a repo without a clone: read a tree, read a file, commit a set of changes, merge
// two branches. Each one is a function over the Repo contract, so it runs inside the RepoObject next to
// its storage, and tests run it against a MemoryRepo. Results are plain data: an `ok` union with a named
// error code, which the HTTP and MCP layers turn into statuses.

import { buildCommit, TARU_IDENT, type Ident } from "./commit.ts";
import { isBinary, isAncestor, mergeBase, mergeTrees, type Conflict } from "./merge.ts";
import type { TreeEntry } from "./objects.ts";
import { isValidRefName } from "./protocol.ts";
import type { Oid, Repo } from "./repo.ts";
import { branchRef, readCommit, resolveRevision } from "./revisions.ts";
import { applyChanges, changesProblem, readPath, readTree, TREE_MODE, type FileChange } from "./tree.ts";

export type OperationError =
	| { ok: false; error: "not_found"; message: string }
	| { ok: false; error: "invalid_request"; message: string }
	| { ok: false; error: "head_mismatch"; message: string; branch: string; head: Oid | null }
	| { ok: false; error: "merge_conflict"; message: string; base: Oid; ours: Oid; theirs: Oid; conflicts: Conflict[] }
	| { ok: false; error: "no_merge_base"; message: string };

export type EntryType = "file" | "dir" | "symlink" | "submodule";

export interface Entry {
	name: string;
	path: string;
	type: EntryType;
	mode: string;
	oid: Oid;
}

export interface ReadTreeInput {
	/** Branch, tag, full ref or commit oid. Null means the branch HEAD points at. */
	rev: string | null;
	/** "" for the root. */
	path: string;
}

export interface ReadTreeOk {
	ok: true;
	ref: string | null;
	commit: Oid;
	tree: Oid;
	path: string;
	entries: Entry[];
}

export interface ReadFileOk {
	ok: true;
	ref: string | null;
	commit: Oid;
	path: string;
	type: EntryType;
	mode: string;
	oid: Oid;
	size: number;
	/** "utf-8" when the bytes are valid text without NULs, otherwise "base64". */
	encoding: "utf-8" | "base64";
	content: string;
}

export interface CommitChangesInput {
	/** "main" or "refs/heads/main". */
	branch: string;
	/** The commit the branch must point at now. Null means the branch must not exist yet. */
	expected_head: Oid | null;
	/** With expected_head null: the revision to start the new branch from. Null starts an orphan commit. */
	start_rev?: string | null;
	message: string;
	author?: Ident;
	changes: FileChange[];
}

export interface CommitChangesOk {
	ok: true;
	branch: string;
	commit: Oid;
	tree: Oid;
	parent: Oid | null;
}

export interface MergeInput {
	/** The branch that receives the merge: "main" or "refs/heads/main". */
	into: string;
	/** Branch, tag, full ref or commit oid. */
	from: string;
	message?: string;
	author?: Ident;
	/** When set, `into` must point at this commit, like expected_head on a commit. */
	expected_head?: Oid;
	/** Compute the merge and report, but write nothing. */
	dry_run?: boolean;
}

export interface MergeOk {
	ok: true;
	/** "up_to_date": `from` is already in `into`. "fast_forward": `into` moved to `from`, no new commit. "merged": a merge commit. */
	result: "up_to_date" | "fast_forward" | "merged";
	dry_run: boolean;
	into: string;
	from: string | null;
	commit: Oid;
	tree: Oid;
	base: Oid | null;
}

function entryType(mode: string): EntryType {
	if (mode === TREE_MODE) return "dir";
	if (mode === "120000") return "symlink";
	if (mode === "160000") return "submodule";
	return "file";
}

function notFound(message: string): OperationError {
	return { ok: false, error: "not_found", message };
}

async function resolveOrHead(repo: Repo, rev: string | null) {
	const name = rev ?? (await repo.headTarget());
	const revision = await resolveRevision(repo, name);
	return revision ?? null;
}

export async function readTreeAt(repo: Repo, input: ReadTreeInput): Promise<ReadTreeOk | OperationError> {
	const revision = await resolveOrHead(repo, input.rev);
	if (!revision) return notFound(`revision ${JSON.stringify(input.rev ?? "HEAD")} not found`);
	let tree = revision.tree;
	if (input.path !== "") {
		const entry = await readPath(repo, revision.tree, input.path);
		if (!entry) return notFound(`path ${JSON.stringify(input.path)} not found at ${revision.commit}`);
		if (entry.mode !== TREE_MODE) return notFound(`path ${JSON.stringify(input.path)} is a file, not a folder`);
		tree = entry.oid;
	}
	const entries = (await readTree(repo, tree)).map((e: TreeEntry) => ({
		name: e.name,
		path: input.path ? `${input.path}/${e.name}` : e.name,
		type: entryType(e.mode),
		mode: e.mode,
		oid: e.oid,
	}));
	return { ok: true, ref: revision.ref, commit: revision.commit, tree, path: input.path, entries };
}

export interface ReadBlobOk {
	ok: true;
	ref: string | null;
	commit: Oid;
	type: EntryType;
	mode: string;
	oid: Oid;
	data: Uint8Array;
}

/** A file's bytes at a revision. readFileAt and the raw endpoint both read through this. */
export async function readBlobAt(repo: Repo, input: ReadTreeInput): Promise<ReadBlobOk | OperationError> {
	const revision = await resolveOrHead(repo, input.rev);
	if (!revision) return notFound(`revision ${JSON.stringify(input.rev ?? "HEAD")} not found`);
	const entry = await readPath(repo, revision.tree, input.path);
	if (!entry) return notFound(`path ${JSON.stringify(input.path)} not found at ${revision.commit}`);
	if (entry.mode === TREE_MODE) return notFound(`path ${JSON.stringify(input.path)} is a folder, not a file`);
	const object = await repo.getObject(entry.oid);
	if (!object) throw new Error(`missing blob ${entry.oid}`);
	return { ok: true, ref: revision.ref, commit: revision.commit, type: entryType(entry.mode), mode: entry.mode, oid: entry.oid, data: object.data };
}

export async function readFileAt(repo: Repo, input: ReadTreeInput): Promise<ReadFileOk | OperationError> {
	const blob = await readBlobAt(repo, input);
	if (!blob.ok) return blob;
	const text = asText(blob.data);
	return {
		ok: true,
		ref: blob.ref,
		commit: blob.commit,
		path: input.path,
		type: blob.type,
		mode: blob.mode,
		oid: blob.oid,
		size: blob.data.byteLength,
		encoding: text === null ? "base64" : "utf-8",
		content: text ?? base64(blob.data),
	};
}

/** The bytes as a string when they're valid UTF-8 with no NUL; null for binary content. */
function asText(data: Uint8Array): string | null {
	if (isBinary(data)) return null;
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data);
	} catch {
		return null;
	}
}

export function base64(data: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
	return btoa(binary);
}

export async function commitChanges(repo: Repo, input: CommitChangesInput): Promise<CommitChangesOk | OperationError> {
	const ref = branchRef(input.branch);
	if (!ref.startsWith("refs/heads/") || !isValidRefName(ref)) {
		return { ok: false, error: "invalid_request", message: `branch ${JSON.stringify(input.branch)} is not a valid branch name` };
	}
	const problem = changesProblem(input.changes);
	if (problem) return { ok: false, error: "invalid_request", message: problem };

	const head = (await repo.listRefs()).get(ref) ?? null;
	if (head !== input.expected_head) {
		const message = head === null ? `branch ${ref} does not exist` : `branch ${ref} is at ${head}, not ${input.expected_head ?? "unborn"}`;
		return { ok: false, error: "head_mismatch", message, branch: ref, head };
	}

	let parent: Oid | null = head;
	let baseTree: Oid | null = null;
	if (head) {
		baseTree = (await readCommit(repo, head)).tree;
	} else if (input.start_rev) {
		const start = await resolveRevision(repo, input.start_rev);
		if (!start) return notFound(`start_rev ${JSON.stringify(input.start_rev)} not found`);
		parent = start.commit;
		baseTree = start.tree;
	}

	const built = await applyChanges(repo, baseTree, input.changes);
	const commit = await buildCommit({
		tree: built.tree,
		parents: parent ? [parent] : [],
		author: input.author ?? TARU_IDENT,
		message: input.message,
	});
	await repo.putObjects([...built.objects, commit]);
	const [result] = await repo.updateRefs([{ ref, old: head, new: commit.oid }]);
	if (!result.ok) {
		const now = (await repo.listRefs()).get(ref) ?? null;
		return { ok: false, error: "head_mismatch", message: result.reason, branch: ref, head: now };
	}
	return { ok: true, branch: ref, commit: commit.oid, tree: built.tree, parent };
}

export async function mergeBranches(repo: Repo, input: MergeInput): Promise<MergeOk | OperationError> {
	const intoRef = branchRef(input.into);
	if (!intoRef.startsWith("refs/heads/") || !isValidRefName(intoRef)) {
		return { ok: false, error: "invalid_request", message: `into ${JSON.stringify(input.into)} is not a valid branch name` };
	}
	const ours = await resolveRevision(repo, intoRef);
	if (!ours) return notFound(`branch ${intoRef} not found`);
	const theirs = await resolveRevision(repo, input.from);
	if (!theirs) return notFound(`from ${JSON.stringify(input.from)} not found`);
	if (input.expected_head !== undefined && input.expected_head !== ours.commit) {
		return { ok: false, error: "head_mismatch", message: `branch ${intoRef} is at ${ours.commit}, not ${input.expected_head}`, branch: intoRef, head: ours.commit };
	}
	const dry_run = input.dry_run === true;
	const shared = { dry_run, into: intoRef, from: theirs.ref };

	if (ours.commit === theirs.commit || (await isAncestor(repo, theirs.commit, ours.commit))) {
		return { ok: true, result: "up_to_date", ...shared, commit: ours.commit, tree: ours.tree, base: theirs.commit };
	}
	if (await isAncestor(repo, ours.commit, theirs.commit)) {
		if (!dry_run) {
			const [result] = await repo.updateRefs([{ ref: intoRef, old: ours.commit, new: theirs.commit }]);
			if (!result.ok) return { ok: false, error: "head_mismatch", message: result.reason, branch: intoRef, head: (await repo.listRefs()).get(intoRef) ?? null };
		}
		return { ok: true, result: "fast_forward", ...shared, commit: theirs.commit, tree: theirs.tree, base: ours.commit };
	}

	const base = await mergeBase(repo, ours.commit, theirs.commit);
	if (!base) return { ok: false, error: "no_merge_base", message: `${intoRef} and ${input.from} have no common ancestor` };
	const baseTree = (await readCommit(repo, base)).tree;
	const labels = { ours: ours.ref ?? ours.commit, theirs: theirs.ref ?? theirs.commit };
	const merged = await mergeTrees(repo, baseTree, ours.tree, theirs.tree, labels);
	if (!merged.ok) {
		return {
			ok: false,
			error: "merge_conflict",
			message: `${merged.conflicts.length} conflict(s) merging ${input.from} into ${intoRef}`,
			base,
			ours: ours.commit,
			theirs: theirs.commit,
			conflicts: merged.conflicts,
		};
	}
	const commit = await buildCommit({
		tree: merged.tree,
		parents: [ours.commit, theirs.commit],
		author: input.author ?? TARU_IDENT,
		message: input.message ?? `Merge ${theirs.ref ?? theirs.commit} into ${intoRef}`,
	});
	if (!dry_run) {
		await repo.putObjects([...merged.objects, commit]);
		const [result] = await repo.updateRefs([{ ref: intoRef, old: ours.commit, new: commit.oid }]);
		if (!result.ok) return { ok: false, error: "head_mismatch", message: result.reason, branch: intoRef, head: (await repo.listRefs()).get(intoRef) ?? null };
	}
	return { ok: true, result: "merged", ...shared, commit: commit.oid, tree: merged.tree, base };
}
