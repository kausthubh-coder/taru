// Turning the names agents use ("main", "refs/tags/v1", a 40-hex oid) into commits.

import { isHexOid } from "./bytes.ts";
import { parseCommit, parseTag, type Commit } from "./objects.ts";
import type { Oid, Repo } from "./repo.ts";

export interface Revision {
	/** The full ref name the revision came from, or null when it was given as an oid. */
	ref: string | null;
	commit: Oid;
	tree: Oid;
}

/** The full ref name for a branch given as "main" or "refs/heads/main". */
export function branchRef(branch: string): string {
	return branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
}

/**
 * Resolves `rev` to a commit: a full ref name, a branch, a tag (peeled), or a commit oid.
 * Undefined when nothing matches or the object isn't a commit.
 */
export async function resolveRevision(repo: Repo, rev: string): Promise<Revision | undefined> {
	const refs = await repo.listRefs();
	const candidates = rev.startsWith("refs/") ? [rev] : [`refs/heads/${rev}`, `refs/tags/${rev}`];
	for (const ref of candidates) {
		const oid = refs.get(ref);
		if (!oid) continue;
		// oxlint-disable-next-line no-await-in-loop
		const commit = await peelToCommit(repo, oid);
		if (!commit) return undefined;
		return { ref, commit: commit.oid, tree: commit.commit.tree };
	}
	if (isHexOid(rev)) {
		const commit = await peelToCommit(repo, rev);
		if (commit) return { ref: null, commit: commit.oid, tree: commit.commit.tree };
	}
	return undefined;
}

export async function readCommit(repo: Repo, oid: Oid): Promise<Commit> {
	const object = await repo.getObject(oid);
	if (!object) throw new Error(`missing commit ${oid}`);
	if (object.type !== "commit") throw new Error(`${oid} is a ${object.type}, not a commit`);
	return parseCommit(object.data);
}

async function peelToCommit(repo: Repo, oid: Oid): Promise<{ oid: Oid; commit: Commit } | undefined> {
	let current = oid;
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop
		const object = await repo.getObject(current);
		if (!object) return undefined;
		if (object.type === "commit") return { oid: current, commit: parseCommit(object.data) };
		if (object.type !== "tag") return undefined;
		current = parseTag(object.data).object;
	}
}
