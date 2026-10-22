// Picks the objects a fetch needs: everything reachable from the wants that is not reachable from the
// haves. The commit walk mirrors git's revision.c limit_list(): a date-ordered queue where "uninteresting"
// spreads to parents, stopped a few steps after only uninteresting commits remain. Trees and blobs of the
// boundary commits (uninteresting parents of commits we send, and the haves) are excluded, like git's
// mark_edges_uninteresting(). Sending a few extra objects is allowed; missing one is not.
// Awaits in loops are deliberate: a graph walk reads one object to learn the next, and the store is single-threaded.
/* oxlint-disable no-await-in-loop */

import { identTimestamp, parseCommit, parseTag, parseTree } from "./objects.ts";
import type { ObjectType, Oid, Repo } from "./repo.ts";

interface CommitNode {
	oid: Oid;
	tree: Oid;
	parents: Oid[];
	time: number;
	uninteresting: boolean;
	queued: boolean;
}

/** git's slop: how many uninteresting-only steps to keep walking so clock skew between commits doesn't cut the walk short. */
const SLOP = 5;

/**
 * `wants` and `haves` are any object ids (tags get peeled). Haves that the repo doesn't have must be filtered
 * out by the caller. With `includeTags`, annotated tags pointing at sent objects come along (the include-tag capability).
 * Returns oids to send: commits first, then trees and blobs, then tags.
 */
export async function selectObjects(repo: Repo, wants: Oid[], haves: Oid[], includeTags: boolean): Promise<Oid[]> {
	const nodes = new Map<Oid, CommitNode>();
	const out: Oid[] = [];
	const sent = new Set<Oid>();
	const nonCommitWants: { oid: Oid; type: ObjectType }[] = [];

	function send(oid: Oid): void {
		if (sent.has(oid)) return;
		sent.add(oid);
		out.push(oid);
	}

	async function loadCommit(oid: Oid): Promise<CommitNode | undefined> {
		const existing = nodes.get(oid);
		if (existing) return existing;
		const object = await repo.getObject(oid);
		if (!object || object.type !== "commit") return undefined;
		const commit = parseCommit(object.data);
		const node: CommitNode = {
			oid,
			tree: commit.tree,
			parents: commit.parents,
			time: identTimestamp(commit.committer),
			uninteresting: false,
			queued: false,
		};
		nodes.set(oid, node);
		return node;
	}

	// Peels tags down to the commit (or tree/blob) they name. The tag objects themselves are sent too.
	async function peel(oid: Oid, sendTags: boolean): Promise<{ oid: Oid; type: ObjectType } | undefined> {
		let current = oid;
		for (;;) {
			const object = await repo.getObject(current);
			if (!object) return undefined;
			if (object.type !== "tag") return { oid: current, type: object.type };
			if (sendTags) send(current);
			current = parseTag(object.data).object;
		}
	}

	// Walking parents of an uninteresting commit marks them all; git calls this mark_parents_uninteresting.
	function markUninteresting(start: CommitNode): void {
		const stack = [start];
		while (stack.length > 0) {
			const node = stack.pop()!;
			if (node.uninteresting) continue;
			node.uninteresting = true;
			for (const parent of node.parents) {
				const parentNode = nodes.get(parent);
				if (parentNode && !parentNode.uninteresting) stack.push(parentNode);
			}
		}
	}

	// Queue ordered by commit time, newest first; equal times keep insertion order like git's commit_list_insert_by_date.
	const queue: CommitNode[] = [];
	function enqueue(node: CommitNode): void {
		if (node.queued) return;
		node.queued = true;
		let lo = 0;
		let hi = queue.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (queue[mid].time >= node.time) lo = mid + 1;
			else hi = mid;
		}
		queue.splice(lo, 0, node);
	}

	const haveNodes: CommitNode[] = [];
	for (const have of haves) {
		const peeled = await peel(have, false);
		if (!peeled || peeled.type !== "commit") continue;
		const node = await loadCommit(peeled.oid);
		if (!node) continue;
		node.uninteresting = true;
		haveNodes.push(node);
		enqueue(node);
	}
	for (const want of wants) {
		const peeled = await peel(want, true);
		if (!peeled) throw new Error(`want ${want} not found`);
		if (peeled.type !== "commit") {
			nonCommitWants.push(peeled);
			continue;
		}
		const node = await loadCommit(peeled.oid);
		if (node) enqueue(node);
	}

	const candidates: CommitNode[] = [];
	let slop = SLOP;
	let lastInterestingTime = Number.POSITIVE_INFINITY;
	while (queue.length > 0) {
		const node = queue.shift()!;
		for (const parent of node.parents) {
			const parentNode = await loadCommit(parent);
			if (!parentNode) throw new Error(`commit ${parent} (parent of ${node.oid}) is missing`);
			if (node.uninteresting) markUninteresting(parentNode);
			enqueue(parentNode);
		}
		if (node.uninteresting) {
			slop = stillInteresting(queue, lastInterestingTime, slop);
			if (slop > 0) continue;
			break;
		}
		lastInterestingTime = node.time;
		candidates.push(node);
	}

	const commits = candidates.filter((node) => !node.uninteresting);
	for (const commit of commits) send(commit.oid);

	// Objects the client already has: trees and blobs of the boundary. A tree already seen is skipped whole.
	const known = new Set<Oid>();
	const boundary = new Set<CommitNode>(haveNodes);
	for (const commit of commits) {
		for (const parent of commit.parents) {
			const parentNode = nodes.get(parent)!;
			if (parentNode.uninteresting) boundary.add(parentNode);
		}
	}
	for (const node of boundary) await walkTree(repo, node.tree, known, undefined);
	for (const commit of commits) await walkTree(repo, commit.tree, known, send);
	for (const want of nonCommitWants) {
		if (want.type === "tree") await walkTree(repo, want.oid, known, send);
		else send(want.oid);
	}

	if (includeTags) {
		const refs = await repo.listRefs();
		for (const [name, oid] of refs) {
			if (!name.startsWith("refs/tags/") || sent.has(oid)) continue;
			const object = await repo.getObject(oid);
			if (!object || object.type !== "tag") continue;
			const target = await peel(oid, false);
			if (target && sent.has(target.oid)) send(oid);
		}
	}

	return out;
}

/** git's still_interesting(): keep going while newer commits remain or any queued commit is interesting. */
function stillInteresting(queue: CommitNode[], lastInterestingTime: number, slop: number): number {
	if (queue.length === 0) return 0;
	if (lastInterestingTime <= queue[0].time) return SLOP;
	if (queue.some((node) => !node.uninteresting)) return SLOP;
	return slop - 1;
}

/** Visits a tree recursively. With `send`, unseen trees and blobs are emitted; without, they are only marked known. */
async function walkTree(repo: Repo, tree: Oid, known: Set<Oid>, send: ((oid: Oid) => void) | undefined): Promise<void> {
	const stack = [tree];
	while (stack.length > 0) {
		const oid = stack.pop()!;
		if (known.has(oid)) continue;
		known.add(oid);
		const object = await repo.getObject(oid);
		if (!object) throw new Error(`tree ${oid} is missing`);
		send?.(oid);
		for (const entry of parseTree(object.data)) {
			// 160000 is a submodule commit that lives in another repo; nothing to send.
			if (entry.mode === "160000" || known.has(entry.oid)) continue;
			if (entry.mode === "40000") stack.push(entry.oid);
			else {
				known.add(entry.oid);
				send?.(entry.oid);
			}
		}
	}
}

/**
 * git's ok_to_give_up(): can every want reach some have by walking parents? Commits older than the oldest
 * have cannot lead to one, so the walk stops there (clock skew only costs an extra negotiation round).
 */
export async function allWantsReachHaves(repo: Repo, wants: Oid[], haves: Set<Oid>): Promise<boolean> {
	if (haves.size === 0) return false;
	let minHaveTime = Number.POSITIVE_INFINITY;
	for (const have of haves) {
		const object = await repo.getObject(have);
		if (object?.type === "commit") minHaveTime = Math.min(minHaveTime, identTimestamp(parseCommit(object.data).committer));
	}
	const reaches = new Set<Oid>(haves);
	const deadEnds = new Set<Oid>();
	for (const want of wants) {
		const object = await repo.getObject(want);
		if (!object) return false;
		let start = want;
		if (object.type === "tag") {
			let current = object;
			while (current.type === "tag") {
				start = parseTag(current.data).object;
				const next = await repo.getObject(start);
				if (!next) return false;
				current = next;
			}
			if (current.type !== "commit") continue;
		} else if (object.type !== "commit") {
			continue;
		}
		if (!(await reachesHave(repo, start, reaches, deadEnds, minHaveTime))) return false;
	}
	return true;
}

async function reachesHave(repo: Repo, start: Oid, reaches: Set<Oid>, deadEnds: Set<Oid>, minTime: number): Promise<boolean> {
	const stack = [start];
	const visited = new Set<Oid>();
	while (stack.length > 0) {
		const oid = stack.pop()!;
		if (reaches.has(oid)) {
			reaches.add(start);
			return true;
		}
		if (visited.has(oid) || deadEnds.has(oid)) continue;
		visited.add(oid);
		const object = await repo.getObject(oid);
		if (!object || object.type !== "commit") continue;
		const commit = parseCommit(object.data);
		if (identTimestamp(commit.committer) < minTime) continue;
		for (const parent of commit.parents) stack.push(parent);
	}
	for (const seen of visited) deadEnds.add(seen);
	return false;
}
