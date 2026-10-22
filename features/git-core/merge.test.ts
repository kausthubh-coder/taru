// Merges checked against the real git binary: the merge base matches `git merge-base`, clean merges produce
// the tree `git merge-tree --write-tree` produces, and conflicts land on the paths git reports.

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { decodeText } from "./bytes.ts";
import { diff3 } from "./diff3.ts";
import type { MemoryRepo } from "./memoryRepo.ts";
import { isAncestor, mergeBase, mergeTrees } from "./merge.ts";
import { git, gitStatus, loadGitRepo, writeFile } from "./oracle.test-helpers.ts";
import { readPath } from "./tree.ts";

let work: string;
let source: string;
let repo: MemoryRepo;

const LABELS = { ours: "main", theirs: "feature" };

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1103515245) + 12345) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

const LINES = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";

beforeAll(() => {
	work = mkdtempSync(join(tmpdir(), "taru-merge-"));
	source = join(work, "source");
	git(work, "init", "-q", source);
	writeFile(source, "README.md", "# Demo\n");
	writeFile(source, "src/app.ts", LINES);
	writeFile(source, "src/lib/util.ts", "export const add = (a: number, b: number) => a + b;\n");
	writeFile(source, "assets/logo.bin", pseudoRandomBytes(4096, 11));
	writeFile(source, "tools/run.sh", "#!/bin/sh\necho run\n");
	writeFile(source, "shared.txt", "same on both sides\n");
	git(source, "add", "-A");
	git(source, "commit", "-qm", "base");

	// Clean: main edits the top of app.ts, adds a file, deletes util.ts; feature edits the bottom of app.ts,
	// adds a nested file, changes a mode, and both add the identical shared2.txt.
	git(source, "checkout", "-qb", "feature");
	writeFile(source, "src/app.ts", LINES.replace("line 39\n", "line 39 changed by feature\n"));
	writeFile(source, "docs/deep/feature.md", "from feature\n");
	writeFile(source, "shared2.txt", "identical on both\n");
	// On disk, not only `update-index --chmod`: the later `commit -a` restages from the working tree.
	chmodSync(join(source, "tools/run.sh"), 0o755);
	git(source, "add", "-A");
	git(source, "commit", "-qm", "feature work");
	writeFile(source, "README.md", "# Demo\n\nfeature second commit\n");
	git(source, "commit", "-qam", "feature second");

	git(source, "checkout", "-q", "main");
	writeFile(source, "src/app.ts", LINES.replace("line 2\n", "line 2 changed by main\n"));
	writeFile(source, "main.txt", "from main\n");
	writeFile(source, "shared2.txt", "identical on both\n");
	git(source, "rm", "-q", "src/lib/util.ts");
	git(source, "add", "-A");
	git(source, "commit", "-qm", "main work");

	// Conflicting: same line of app.ts, both change the binary, add/add of a new file, modify/delete of README.
	git(source, "checkout", "-qb", "clash", "main");
	writeFile(source, "src/app.ts", LINES.replace("line 20\n", "line 20 by clash\n"));
	writeFile(source, "assets/logo.bin", pseudoRandomBytes(4096, 12));
	writeFile(source, "new.txt", "clash version\n");
	git(source, "rm", "-q", "README.md");
	git(source, "add", "-A");
	git(source, "commit", "-qm", "clash");
	git(source, "checkout", "-qb", "clash2", "main");
	writeFile(source, "src/app.ts", LINES.replace("line 20\n", "line 20 by clash2\n"));
	writeFile(source, "assets/logo.bin", pseudoRandomBytes(4096, 13));
	writeFile(source, "new.txt", "clash2 version\n");
	writeFile(source, "README.md", "# Demo edited\n");
	git(source, "add", "-A");
	git(source, "commit", "-qm", "clash2");
	git(source, "checkout", "-q", "main");

	repo = loadGitRepo(source);
});

afterAll(() => {
	rmSync(work, { recursive: true, force: true });
});

/** Conflict markers without their labels: git's say "clash", ours say what the caller passed. */
const strip = (text: string) => text.replaceAll(/^(<{7}|>{7}) .*$/gm, "$1");
const rev = (name: string) => git(source, "rev-parse", name);
const tree = (name: string) => git(source, "rev-parse", `${name}^{tree}`);

describe("merge base", () => {
	test("matches git merge-base, and ancestry is detected both ways", async () => {
		expect(await mergeBase(repo, rev("main"), rev("feature"))).toBe(git(source, "merge-base", "main", "feature"));
		expect(await mergeBase(repo, rev("clash"), rev("clash2"))).toBe(rev("main"));
		expect(await mergeBase(repo, rev("main"), rev("main"))).toBe(rev("main"));
		expect(await isAncestor(repo, rev("main"), rev("clash"))).toBe(true);
		expect(await isAncestor(repo, rev("clash"), rev("main"))).toBe(false);
		expect(await isAncestor(repo, rev("main"), rev("feature"))).toBe(false);
	});
});

describe("mergeTrees", () => {
	test("a clean merge produces the tree git merge-tree produces", async () => {
		const base = (await mergeBase(repo, rev("main"), rev("feature")))!;
		const result = await mergeTrees(repo, tree(base), tree("main"), tree("feature"), LABELS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const expected = gitStatus(source, "merge-tree", "--write-tree", "main", "feature");
		expect(expected.status).toBe(0);
		expect(result.tree).toBe(expected.stdout);

		await repo.putObjects(result.objects);
		expect((await readPath(repo, result.tree, "tools/run.sh"))?.mode).toBe("100755");
		expect(await readPath(repo, result.tree, "src/lib")).toBeUndefined();
		const app = decodeText((await repo.getObject((await readPath(repo, result.tree, "src/app.ts"))!.oid))!.data);
		expect(app).toContain("line 2 changed by main\n");
		expect(app).toContain("line 39 changed by feature\n");
	});

	test("the same tree on both sides, and one side unchanged, need no new objects", async () => {
		const unchanged = await mergeTrees(repo, tree("main"), tree("main"), tree("feature"), LABELS);
		expect(unchanged).toEqual({ ok: true, tree: tree("feature"), objects: [] });
		const same = await mergeTrees(repo, tree("main"), tree("clash"), tree("clash"), LABELS);
		expect(same).toEqual({ ok: true, tree: tree("clash"), objects: [] });
	});

	test("conflicts are reported on the paths git reports, with nothing to store", async () => {
		const result = await mergeTrees(repo, tree("main"), tree("clash"), tree("clash2"), { ours: "clash", theirs: "clash2" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const expected = gitStatus(source, "merge-tree", "--write-tree", "--name-only", "clash", "clash2");
		expect(expected.status).toBe(1);
		const [gitTree, ...rest] = expected.stdout.split("\n");
		const gitPaths = rest.slice(0, rest.indexOf("")).toSorted();
		expect(result.conflicts.map((c) => c.path).toSorted()).toEqual(gitPaths);
		expect(Object.fromEntries(result.conflicts.map((c) => [c.path, c.kind]))).toEqual({
			"README.md": "modify/delete",
			"assets/logo.bin": "binary",
			"new.txt": "add/add",
			"src/app.ts": "content",
		});

		const app = result.conflicts.find((c) => c.path === "src/app.ts")!;
		expect(app.base).toBe(git(source, "rev-parse", "main:src/app.ts"));
		expect(app.ours).toBe(git(source, "rev-parse", "clash:src/app.ts"));
		expect(app.theirs).toBe(git(source, "rev-parse", "clash2:src/app.ts"));
		// git wrote its own conflict-marked file into the merge-tree result; same text, label lines aside.
		const gitMarked = git(source, "cat-file", "-p", `${gitTree}:src/app.ts`) + "\n";
		expect(strip(app.conflict_text!)).toBe(strip(gitMarked));
		expect(app.conflict_text).toContain("<<<<<<< clash\nline 20 by clash\n=======\nline 20 by clash2\n>>>>>>> clash2\n");

		const readme = result.conflicts.find((c) => c.path === "README.md")!;
		expect(readme).toEqual({ path: "README.md", kind: "modify/delete", base: git(source, "rev-parse", "main:README.md"), ours: null, theirs: git(source, "rev-parse", "clash2:README.md") });
	});
});

describe("diff3", () => {
	test("takes each side's change, keeps a missing final newline, and marks conflicts", () => {
		expect(diff3("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n")).toEqual({ text: "A\nb\nC\n", conflicts: 0 });
		expect(diff3("a\nb\nc", "a\nb\nc\nd", "a\nb\nc")).toEqual({ text: "a\nb\nc\nd", conflicts: 0 });
		expect(diff3("a\nb\nc\n", "a\nc\n", "a\nb\nc\nd\n")).toEqual({ text: "a\nc\nd\n", conflicts: 0 });
		// Deleting b and appending right after b touch each other: a conflict, as in git.
		expect(diff3("a\nb\n", "a\n", "a\nb\nc\n").conflicts).toBe(1);
		expect(diff3("", "x\n", "x\n")).toEqual({ text: "x\n", conflicts: 0 });
		expect(diff3("a\nb\nc\n", "a\nX\nc\n", "a\nY\nc\n")).toEqual({
			text: "a\n<<<<<<< ours\nX\n=======\nY\n>>>>>>> theirs\nc\n",
			conflicts: 1,
		});
		// Adjacent changes touch, so they're one conflict, as in git.
		expect(diff3("a\nb\nc\nd\n", "a\nB\nc\nd\n", "a\nb\nC\nd\n").conflicts).toBe(1);
	});
});
