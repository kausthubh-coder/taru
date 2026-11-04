// Line-level three-way merge of text, the way `git merge` does it for a file changed on both sides.
// Two Myers diffs (base->ours, base->theirs) give the matched lines; the diff3 walk from Khanna, Kunal and
// Pierce ("A formal investigation of diff3") splits the three texts into stable chunks (all agree) and
// unstable chunks, and each unstable chunk is taken from the side that changed it, or marked as a conflict.

export interface Diff3Result {
	/** The merged text. With conflicts, the conflicting chunks carry "<<<<<<<" / "=======" / ">>>>>>>" markers. */
	text: string;
	conflicts: number;
}

/** Lines keep their "\n" so joining them back gives the original bytes, including a missing final newline. */
export function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	const lines = text.split("\n");
	const last = lines.pop()!;
	const out = lines.map((line) => `${line}\n`);
	if (last.length > 0) out.push(last);
	return out;
}

export function diff3(base: string, ours: string, theirs: string, labels = { ours: "ours", theirs: "theirs" }): Diff3Result {
	const o = splitLines(base);
	const a = splitLines(ours);
	const b = splitLines(theirs);
	// Past the edit budget a side's middle stays unmatched: it counts as rewritten, which can only add conflicts.
	const matchA = matchLines(o, a).match;
	const matchB = matchLines(o, b).match;

	const out: string[] = [];
	let conflicts = 0;
	let lo = 0;
	let la = 0;
	let lb = 0;
	for (;;) {
		// Stable run: base, ours and theirs advance in step while the matches line up.
		let i = 0;
		while (lo + i < o.length && matchA[lo + i] === la + i && matchB[lo + i] === lb + i) i++;
		for (let n = 0; n < i; n++) out.push(o[lo + n]);
		lo += i;
		la += i;
		lb += i;
		if (lo >= o.length && la >= a.length && lb >= b.length) break;

		// Unstable chunk: up to the next base line matched on both sides, or to the end.
		let next = lo;
		while (next < o.length && (matchA[next] < 0 || matchB[next] < 0)) next++;
		const endA = next < o.length ? matchA[next] : a.length;
		const endB = next < o.length ? matchB[next] : b.length;
		const chunkO = o.slice(lo, next);
		const chunkA = a.slice(la, endA);
		const chunkB = b.slice(lb, endB);
		if (sameLines(chunkA, chunkB) || sameLines(chunkB, chunkO)) out.push(...chunkA);
		else if (sameLines(chunkA, chunkO)) out.push(...chunkB);
		else {
			conflicts++;
			out.push(`<<<<<<< ${labels.ours}\n`, ...terminated(chunkA), "=======\n", ...terminated(chunkB), `>>>>>>> ${labels.theirs}\n`);
		}
		lo = next;
		la = endA;
		lb = endB;
	}
	return { text: out.join(""), conflicts };
}

function sameLines(x: string[], y: string[]): boolean {
	if (x.length !== y.length) return false;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
}

/** Inside conflict markers every line needs its newline, or the next marker would share its line. */
function terminated(lines: string[]): string[] {
	if (lines.length === 0 || lines[lines.length - 1].endsWith("\n")) return lines;
	return [...lines.slice(0, -1), `${lines[lines.length - 1]}\n`];
}

/**
 * For each line of `from`, the index of its matched line in `to`, or -1. Matches are strictly increasing.
 * `complete` is false when the middle needed more than MAX_EDITS edits: then only the common prefix and suffix
 * are matched.
 */
export function matchLines(from: string[], to: string[]): { match: Int32Array; complete: boolean } {
	const match = new Int32Array(from.length).fill(-1);
	// Common prefix and suffix are matched outright; the edit script is only computed for the middle.
	let prefix = 0;
	while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) {
		match[prefix] = prefix;
		prefix++;
	}
	let suffix = 0;
	while (suffix < from.length - prefix && suffix < to.length - prefix && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) {
		match[from.length - 1 - suffix] = to.length - 1 - suffix;
		suffix++;
	}
	const matches = myersMatches(from.slice(prefix, from.length - suffix), to.slice(prefix, to.length - suffix));
	for (const [i, j] of matches ?? []) match[prefix + i] = prefix + j;
	return { match, complete: matches !== null };
}

/**
 * The most edits (lines added plus lines removed, after the common prefix and suffix) Myers will search.
 * The trace keeps 2d + 3 numbers for each step d, so its memory is about 4 * MAX_EDITS^2 bytes: 16 MB here,
 * well inside a Durable Object's 128 MB.
 */
export const MAX_EDITS = 2_000;

/** Myers' O(ND) diff: the (i, j) pairs of equal lines on the shortest edit path, or null past MAX_EDITS. */
function myersMatches(a: string[], b: string[]): [number, number][] | null {
	const n = a.length;
	const m = b.length;
	if (n === 0 || m === 0) return [];
	const max = Math.min(n + m, MAX_EDITS);
	const offset = max + 1;
	// trace[d] is v as step d found it, cut to diagonals -d-1..d+1: the only ones the walk back reads.
	const trace: Int32Array[] = [];
	let v = new Int32Array(2 * max + 3);
	v[offset + 1] = 0;
	let found = -1;
	for (let d = 0; d <= max && found < 0; d++) {
		trace.push(v.slice(offset - d - 1, offset + d + 2));
		const next = new Int32Array(v);
		for (let k = -d; k <= d; k += 2) {
			let x: number;
			if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
			else x = v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			next[offset + k] = x;
			if (x >= n && y >= m) {
				found = d;
				break;
			}
		}
		v = next;
	}
	if (found < 0) return null;

	// Walk the trace back from (n, m) to (0, 0); diagonal moves are the matches. Diagonal k of trace[d] is at
	// index k + d + 1.
	const matches: [number, number][] = [];
	let x = n;
	let y = m;
	for (let d = found; d >= 0; d--) {
		const vd = trace[d];
		const k = x - y;
		let prevK: number;
		if (k === -d || (k !== d && vd[k - 1 + d + 1] < vd[k + 1 + d + 1])) prevK = k + 1;
		else prevK = k - 1;
		const prevX = d === 0 ? 0 : vd[prevK + d + 1];
		const prevY = prevX - prevK;
		while (x > prevX && y > prevY) {
			x--;
			y--;
			matches.push([x, y]);
		}
		if (d > 0) {
			x = prevX;
			y = prevY;
		}
	}
	return matches.toReversed();
}
