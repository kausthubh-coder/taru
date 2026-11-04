// Reading history on the server: the commit list of a branch (`git log`) and what one commit changed
// (`git show`), so the web app and agents can review work without a clone. Same Repo contract and result
// shapes as operations.ts.

import { decodeText } from "./bytes.ts";
import { matchLines, splitLines } from "./diff3.ts";
import { isBinary } from "./merge.ts";
import { identTimestamp, type TreeEntry } from "./objects.ts";
import type { OperationError } from "./operations.ts";
import type { Oid, Repo } from "./repo.ts";
import { readCommit, resolveRevision } from "./revisions.ts";
import { readTree, TREE_MODE } from "./tree.ts";

export interface Person {
	name: string;
	email: string;
	/** Unix seconds. */
	time: number;
	/** As git stored it, like "+0530". */
	timezone: string;
}

export interface CommitSummary {
	commit: Oid;
	tree: Oid;
	parents: Oid[];
	author: Person;
	committer: Person;
	message: string;
}

export interface ReadLogInput {
	/** Branch, tag, full ref or commit oid. Null means the branch HEAD points at. */
	rev: string | null;
	limit: number;
	/** Commits to pass over first, for the next page. */
	skip: number;
}

export interface ReadLogOk {
	ok: true;
	ref: string | null;
	head: Oid;
	commits: CommitSummary[];
	/** True when older commits remain: ask again with skip + commits.length. */
	more: boolean;
}

export type ChangeStatus = "added" | "deleted" | "modified";

export interface ChangedFile {
	path: string;
	status: ChangeStatus;
	old_oid: Oid | null;
	new_oid: Oid | null;
	old_mode: string | null;
	new_mode: string | null;
	binary: boolean;
	additions: number;
	deletions: number;
	/** Unified diff hunks ("@@ -1,3 +1,4 @@" onward), or null for binary files and when too_large. */
	patch: string | null;
	/**
	 * True when the diff is too large to show: a side over MAX_DIFF_FILE_BYTES, more than MAX_EDITS changed lines,
	 * or the commit's patches already past MAX_PATCH_BYTES. patch is null; additions and deletions are 0 unless
	 * only the patch budget ran out.
	 */
	too_large: boolean;
}

export interface ReadCommitOk extends CommitSummary {
	ok: true;
	/** The parent the files are compared against: the first parent, like GitHub; null for a root commit. */
	compared_to: Oid | null;
	files: ChangedFile[];
	/** True when the file list stopped at MAX_CHANGED_FILES. */
	truncated: boolean;
}

export const MAX_LOG_LIMIT = 100;
export const MAX_CHANGED_FILES = 300;
/** Files bigger than this on either side get counts of zero and no patch: a diff of them is not for reading. */
export const MAX_DIFF_FILE_BYTES = 1024 * 1024;
/** Once the patches of one commit add up to this, the rest come back without a patch. */
export const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const CONTEXT = 3;

/** "Name <email> 1700000000 +0000" split into its parts. A malformed ident keeps its text as the name. */
export function parsePerson(ident: string): Person {
	const match = /^(.*?) ?<([^>]*)> (\d+) ([+-]\d{4})$/.exec(ident);
	if (!match) return { name: ident, email: "", time: identTimestamp(ident), timezone: "+0000" };
	return { name: match[1], email: match[2], time: Number(match[3]), timezone: match[4] };
}

async function summary(repo: Repo, oid: Oid): Promise<CommitSummary> {
	const commit = await readCommit(repo, oid);
	return {
		commit: oid,
		tree: commit.tree,
		parents: commit.parents,
		author: parsePerson(commit.author),
		committer: parsePerson(commit.committer),
		message: commit.message,
	};
}

function notFound(message: string): OperationError {
	return { ok: false, error: "not_found", message };
}

/**
 * `git log` order: newest committer date first, walking parents as they're reached; equal dates keep the order
 * they were reached in, as git's date queue does.
 */
export async function readLog(repo: Repo, input: ReadLogInput): Promise<ReadLogOk | OperationError> {
	const name = input.rev ?? (await repo.headTarget());
	const revision = await resolveRevision(repo, name);
	if (!revision) return notFound(`revision ${JSON.stringify(input.rev ?? "HEAD")} not found`);

	const queue: { summary: CommitSummary; seq: number }[] = [];
	let seq = 0;
	const seen = new Set<Oid>([revision.commit]);
	queue.push({ summary: await summary(repo, revision.commit), seq: seq++ });
	const commits: CommitSummary[] = [];
	let passed = 0;
	while (queue.length > 0 && commits.length <= input.limit) {
		let best = 0;
		for (let i = 1; i < queue.length; i++) {
			const a = queue[i];
			const b = queue[best];
			if (a.summary.committer.time > b.summary.committer.time || (a.summary.committer.time === b.summary.committer.time && a.seq < b.seq)) best = i;
		}
		const [next] = queue.splice(best, 1);
		if (passed < input.skip) passed++;
		else commits.push(next.summary);
		for (const parent of next.summary.parents) {
			if (seen.has(parent)) continue;
			seen.add(parent);
			// oxlint-disable-next-line no-await-in-loop
			queue.push({ summary: await summary(repo, parent), seq: seq++ });
		}
	}
	const more = commits.length > input.limit;
	return { ok: true, ref: revision.ref, head: revision.commit, commits: commits.slice(0, input.limit), more };
}

/** One commit and the files it changed against its first parent, with unified diffs of the text files. */
export async function readCommitChanges(repo: Repo, rev: string): Promise<ReadCommitOk | OperationError> {
	const revision = await resolveRevision(repo, rev);
	if (!revision) return notFound(`revision ${JSON.stringify(rev)} not found`);
	const commit = await summary(repo, revision.commit);
	const parent = commit.parents[0] ?? null;
	const parentTree = parent ? (await readCommit(repo, parent)).tree : null;

	const changes: Change[] = [];
	const complete = await diffTrees(repo, parentTree, commit.tree, "", changes);
	const files: ChangedFile[] = [];
	let patchBytes = 0;
	for (const change of changes) {
		// oxlint-disable-next-line no-await-in-loop
		const file = await describeChange(repo, change, patchBytes < MAX_PATCH_BYTES);
		patchBytes += file.patch?.length ?? 0;
		files.push(file);
	}
	return { ok: true, ...commit, compared_to: parent, files, truncated: !complete };
}

interface Change {
	path: string;
	old: TreeEntry | null;
	new: TreeEntry | null;
}

/** Folders sort as if their name ended in "/", which is git's tree order and so `git diff-tree`'s output order. */
function sortKey(entry: TreeEntry): string {
	return entry.mode === TREE_MODE ? `${entry.name}/` : entry.name;
}

/** Collects file-level changes between two trees, depth first in git's order. False when it hit MAX_CHANGED_FILES. */
async function diffTrees(repo: Repo, oldTree: Oid | null, newTree: Oid | null, prefix: string, out: Change[]): Promise<boolean> {
	if (oldTree === newTree) return true;
	const oldEntries = new Map((oldTree ? await readTree(repo, oldTree) : []).map((e) => [sortKey(e), e]));
	const newEntries = new Map((newTree ? await readTree(repo, newTree) : []).map((e) => [sortKey(e), e]));
	const keys = [...new Set([...oldEntries.keys(), ...newEntries.keys()])].toSorted(compareBytes);
	for (const key of keys) {
		const before = oldEntries.get(key) ?? null;
		const after = newEntries.get(key) ?? null;
		if (before && after && before.oid === after.oid && before.mode === after.mode) continue;
		const path = prefix + (before ?? after)!.name;
		if ((before ?? after)!.mode === TREE_MODE) {
			// oxlint-disable-next-line no-await-in-loop
			if (!(await diffTrees(repo, before?.oid ?? null, after?.oid ?? null, `${path}/`, out))) return false;
			continue;
		}
		if (out.length >= MAX_CHANGED_FILES) return false;
		out.push({ path, old: before, new: after });
	}
	return true;
}

/** Git compares names as bytes; for the ASCII-ordered keys here, UTF-16 order matches except past U+FFFF. */
function compareBytes(a: string, b: string): number {
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
	return x.length - y.length;
}

async function blobBytes(repo: Repo, entry: TreeEntry | null): Promise<Uint8Array> {
	if (!entry || entry.mode === "160000") return new Uint8Array(0);
	const object = await repo.getObject(entry.oid);
	if (!object) throw new Error(`missing blob ${entry.oid}`);
	return object.data;
}

async function describeChange(repo: Repo, change: Change, withPatch: boolean): Promise<ChangedFile> {
	const status: ChangeStatus = !change.old ? "added" : !change.new ? "deleted" : "modified";
	const base = {
		path: change.path,
		status,
		old_oid: change.old?.oid ?? null,
		new_oid: change.new?.oid ?? null,
		old_mode: change.old?.mode ?? null,
		new_mode: change.new?.mode ?? null,
	};
	const [before, after] = await Promise.all([blobBytes(repo, change.old), blobBytes(repo, change.new)]);
	if (isBinary(before) || isBinary(after)) return { ...base, binary: true, additions: 0, deletions: 0, patch: null, too_large: false };
	const tooLarge = { ...base, binary: false, additions: 0, deletions: 0, patch: null, too_large: true };
	if (before.length > MAX_DIFF_FILE_BYTES || after.length > MAX_DIFF_FILE_BYTES) return tooLarge;
	const diff = unifiedDiff(decodeText(before), decodeText(after));
	if (!diff) return tooLarge;
	return { ...base, binary: false, additions: diff.additions, deletions: diff.deletions, patch: withPatch ? diff.patch : null, too_large: !withPatch };
}

/**
 * A unified diff with three lines of context, as `git diff` prints it after the "+++" line. Null when it needs
 * more than MAX_EDITS (diff3.ts) changed lines.
 */
export function unifiedDiff(before: string, after: string): { patch: string; additions: number; deletions: number } | null {
	const a = splitLines(before);
	const b = splitLines(after);
	const { match, complete } = matchLines(a, b);
	if (!complete) return null;

	// The edit script: " " keeps a line, "-" drops one from a, "+" adds one from b.
	const ops: { op: " " | "-" | "+"; line: string }[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && match[i] === -1) ops.push({ op: "-", line: a[i++] });
		else if (j < b.length && (i >= a.length || j < match[i])) ops.push({ op: "+", line: b[j++] });
		else {
			ops.push({ op: " ", line: a[i] });
			i++;
			j++;
		}
	}

	let additions = 0;
	let deletions = 0;
	let patch = "";
	let k = 0;
	while (k < ops.length) {
		while (k < ops.length && ops[k].op === " ") k++;
		if (k >= ops.length) break;
		// A hunk runs from CONTEXT lines before this change to CONTEXT lines after the last change that is
		// within 2 * CONTEXT unchanged lines of the one before it.
		const start = Math.max(0, k - CONTEXT);
		let end = k;
		for (;;) {
			while (end < ops.length && ops[end].op !== " ") end++;
			let gap = 0;
			while (end + gap < ops.length && ops[end + gap].op === " ") gap++;
			if (end + gap < ops.length && gap <= 2 * CONTEXT) end += gap;
			else {
				end = Math.min(ops.length, end + CONTEXT);
				break;
			}
		}
		let oldStart = 0;
		let newStart = 0;
		for (let n = 0; n < start; n++) {
			if (ops[n].op !== "+") oldStart++;
			if (ops[n].op !== "-") newStart++;
		}
		let oldCount = 0;
		let newCount = 0;
		let body = "";
		for (let n = start; n < end; n++) {
			const { op, line } = ops[n];
			if (op !== "+") oldCount++;
			if (op !== "-") newCount++;
			if (op === "+") additions++;
			if (op === "-") deletions++;
			body += op + line;
			if (!line.endsWith("\n")) body += "\n\\ No newline at end of file\n";
		}
		patch += `@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@\n${body}`;
		k = end;
	}
	return { patch, additions, deletions };
}

/** Git's hunk range: "start,count", with ",1" left out and an empty range starting at the line before it. */
function range(start: number, count: number): string {
	if (count === 0) return `${start},0`;
	return count === 1 ? `${start + 1}` : `${start + 1},${count}`;
}
