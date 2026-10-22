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
	const matchA = matchLines(o, a);
	const matchB = matchLines(o, b);

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

/** For each line of `from`, the index of its matched line in `to`, or -1. Matches are strictly increasing. */
export function matchLines(from: string[], to: string[]): Int32Array {
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
	for (const [i, j] of myersMatches(from.slice(prefix, from.length - suffix), to.slice(prefix, to.length - suffix))) {
		match[prefix + i] = prefix + j;
	}
	return match;
}

/** Past this many edits the middle is treated as fully rewritten; the trace would otherwise cost O(D^2) memory. */
const MAX_EDITS = 10_000;

/** Myers' O(ND) diff, returning the (i, j) pairs of equal lines on the shortest edit path. */
function myersMatches(a: string[], b: string[]): [number, number][] {
	const n = a.length;
	const m = b.length;
	if (n === 0 || m === 0) return [];
	const max = Math.min(n + m, MAX_EDITS);
	const offset = max;
	const trace: Int32Array[] = [];
	let v = new Int32Array(2 * max + 2);
	v[offset + 1] = 0;
	let found = -1;
	for (let d = 0; d <= max && found < 0; d++) {
		trace.push(v);
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
	if (found < 0) return [];

	// Walk the trace back from (n, m) to (0, 0); diagonal moves are the matches.
	const matches: [number, number][] = [];
	let x = n;
	let y = m;
	for (let d = found; d >= 0; d--) {
		const vd = trace[d];
		const k = x - y;
		let prevK: number;
		if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) prevK = k + 1;
		else prevK = k - 1;
		const prevX = d === 0 ? 0 : vd[offset + prevK];
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
