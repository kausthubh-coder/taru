// History checked against the real git binary: readLog lists the same commits in the same order as `git log`,
// readCommitChanges reports the same files as `git diff-tree` with the same line counts as `git diff --numstat`,
// and its patches, fed to `git apply`, rebuild the commit's exact tree.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readCommitChanges, readLog, unifiedDiff, type ChangedFile } from "./history.ts";
import type { MemoryRepo } from "./memoryRepo.ts";
import { git, loadGitRepo, ORACLE_ENV, writeFile } from "./oracle.test-helpers.ts";

let work: string;
let source: string;
let repo: MemoryRepo;
let time = 1_700_000_000;

/** Commits everything with its own committer date, so `git log` order is fully set by dates. */
function commit(message: string, at = (time += 60)): string {
	git(source, "add", "-A");
	execFileSync("git", ["commit", "-qm", message], { cwd: source, env: { ...ORACLE_ENV, GIT_AUTHOR_DATE: `${at} +0530`, GIT_COMMITTER_DATE: `${at} +0530` } });
	return git(source, "rev-parse", "HEAD");
}

const LINES = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
let edits: string;

beforeAll(() => {
	work = mkdtempSync(join(tmpdir(), "taru-history-"));
	source = join(work, "source");
	git(work, "init", "-q", source);
	writeFile(source, "README.md", "# Demo\n");
	writeFile(source, "src/app.ts", LINES);
	writeFile(source, "src/lib/util.ts", "export const add = (a: number, b: number) => a + b;\n");
	writeFile(source, "logo.bin", new Uint8Array([0, 1, 2, 3, 0, 255]));
	writeFile(source, "old.txt", "going away\n");
	commit("first");

	git(source, "checkout", "-qb", "feature");
	writeFile(source, "feature.md", "from the branch\n");
	commit("feature one");

	git(source, "checkout", "-q", "main");
	// Two hunks far apart, one change near the top, a deleted file, a new nested file, an edit that drops the
	// final newline, and a binary change.
	writeFile(source, "src/app.ts", LINES.replace("line 2\n", "line 2 edited\n").replace("line 50\n", "line 50 edited\nline 50b\n").replace("line 55\n", ""));
	rmSync(join(source, "old.txt"));
	writeFile(source, "docs/deep/guide.md", "# Guide\n\nstep one\nstep two\n");
	writeFile(source, "README.md", "# Demo\n\nno newline at the end");
	writeFile(source, "logo.bin", new Uint8Array([0, 9, 9, 9]));
	edits = commit("edits on main");

	git(source, "checkout", "-q", "feature");
	writeFile(source, "feature.md", "from the branch\nsecond line\n");
	commit("feature two");

	git(source, "checkout", "-q", "main");
	execFileSync("git", ["merge", "-q", "--no-ff", "-m", "Merge feature", "feature"], { cwd: source, env: { ...ORACLE_ENV, GIT_COMMITTER_DATE: `${(time += 60)} +0000`, GIT_AUTHOR_DATE: `${time} +0000` } });
	writeFile(source, "src/lib/util.ts", "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n");
	commit("after merge");
	repo = loadGitRepo(source);
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("readLog", () => {
	test("lists every commit in git log order", async () => {
		const result = await readLog(repo, { rev: "main", limit: 100, skip: 0 });
		if (!result.ok) throw new Error(result.message);
		expect(result.commits.map((c) => c.commit)).toEqual(git(source, "log", "--format=%H", "main").split("\n"));
		expect(result.more).toBe(false);
		expect(result.ref).toBe("refs/heads/main");
	});

	test("pages like --skip and -n", async () => {
		const result = await readLog(repo, { rev: null, limit: 2, skip: 1 });
		if (!result.ok) throw new Error(result.message);
		expect(result.commits.map((c) => c.commit)).toEqual(git(source, "log", "--format=%H", "--skip=1", "-n", "2", "main").split("\n"));
		expect(result.more).toBe(true);
	});

	test("parses author, dates, parents and message", async () => {
		const result = await readLog(repo, { rev: edits, limit: 1, skip: 0 });
		if (!result.ok) throw new Error(result.message);
		const [entry] = result.commits;
		expect(entry.author).toEqual({ name: "Taru Test", email: "test@taru.dev", time: Number(git(source, "log", "-1", "--format=%at", edits)), timezone: "+0530" });
		expect(entry.parents).toEqual(git(source, "log", "-1", "--format=%P", edits).split(" "));
		expect(entry.message).toBe("edits on main\n");
		expect(result.ref).toBeNull();
	});

	test("an unknown revision is not_found", async () => {
		const result = await readLog(repo, { rev: "nope", limit: 10, skip: 0 });
		expect(result).toMatchObject({ ok: false, error: "not_found" });
	});
});

const STATUS: Record<string, ChangedFile["status"]> = { A: "added", D: "deleted", M: "modified" };

describe("readCommitChanges", () => {
	test("reports the files, statuses and line counts git reports, for every commit", async () => {
		for (const oid of git(source, "log", "--format=%H", "main").split("\n")) {
			// oxlint-disable-next-line no-await-in-loop
			const result = await readCommitChanges(repo, oid);
			if (!result.ok) throw new Error(result.message);
			const parent = result.compared_to;
			const nameStatus = parent ? git(source, "diff-tree", "-r", "--name-status", parent, oid) : git(source, "diff-tree", "-r", "--root", "--no-commit-id", "--name-status", oid);
			expect(result.files.map((f) => `${f.status} ${f.path}`)).toEqual(
				nameStatus.split("\n").filter(Boolean).map((line) => {
					const [status, path] = line.split("\t");
					return `${STATUS[status]} ${path}`;
				}),
			);
			const numstat = git(source, "diff", "--numstat", parent ?? "4b825dc642cb6eb9a060e54bf8d69288fbee4904", oid);
			expect(result.files.map((f) => (f.binary ? `-\t-\t${f.path}` : `${f.additions}\t${f.deletions}\t${f.path}`)).toSorted()).toEqual(numstat.split("\n").filter(Boolean).toSorted());
		}
	});

	test("its patches rebuild the commit's tree with git apply", async () => {
		const result = await readCommitChanges(repo, edits);
		if (!result.ok) throw new Error(result.message);
		expect(result.files.find((f) => f.path === "logo.bin")).toMatchObject({ binary: true, patch: null });

		const checkout = join(work, "apply");
		git(work, "clone", "-q", source, checkout);
		git(checkout, "checkout", "-q", result.compared_to!);
		let patch = "";
		for (const file of result.files) {
			if (file.binary) continue;
			patch += `diff --git a/${file.path} b/${file.path}\n`;
			if (file.status === "added") patch += `new file mode ${file.new_mode}\n`;
			if (file.status === "deleted") patch += `deleted file mode ${file.old_mode}\n`;
			patch += `--- ${file.status === "added" ? "/dev/null" : `a/${file.path}`}\n`;
			patch += `+++ ${file.status === "deleted" ? "/dev/null" : `b/${file.path}`}\n`;
			patch += file.patch;
		}
		execFileSync("git", ["apply", "-"], { cwd: checkout, input: patch, env: ORACLE_ENV });
		// The binary file is the one change a patch can't carry: take it from the commit.
		git(checkout, "checkout", edits, "--", "logo.bin");
		git(checkout, "add", "-A");
		expect(git(checkout, "write-tree")).toBe(result.tree);
	});

	test("a root commit lists every file as added", async () => {
		const root = git(source, "rev-list", "--max-parents=0", "main");
		const result = await readCommitChanges(repo, root);
		if (!result.ok) throw new Error(result.message);
		expect(result.compared_to).toBeNull();
		expect(result.files.every((f) => f.status === "added")).toBe(true);
	});
});

describe("unifiedDiff", () => {
	test("matches git's hunks for a small edit", () => {
		const before = "a\nb\nc\nd\ne\nf\ng\nh\n";
		const after = "a\nb\nc\nD\ne\nf\ng\nh\ni\n";
		expect(unifiedDiff(before, after)).toEqual({
			patch: "@@ -1,8 +1,9 @@\n a\n b\n c\n-d\n+D\n e\n f\n g\n h\n+i\n",
			additions: 2,
			deletions: 1,
		});
	});

	test("an added file starts at 0,0", () => {
		expect(unifiedDiff("", "x\ny\n").patch).toBe("@@ -0,0 +1,2 @@\n+x\n+y\n");
	});
});
