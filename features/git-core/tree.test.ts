// Reading and rebuilding trees, checked against the real git binary: the same edits made in a working copy
// and staged with git must produce the same tree and commit ids as applyChanges and buildCommit.

import { chmodSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { decodeText, encodeText } from "./bytes.ts";
import { buildCommit } from "./commit.ts";
import type { MemoryRepo } from "./memoryRepo.ts";
import { git, loadGitRepo, writeFile } from "./oracle.test-helpers.ts";
import { resolveRevision } from "./revisions.ts";
import { applyChanges, changesProblem, pathProblem, readPath, readTree } from "./tree.ts";

let work: string;
let source: string;
let repo: MemoryRepo;
let headTree: string;

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1103515245) + 12345) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

beforeAll(() => {
	work = mkdtempSync(join(tmpdir(), "taru-tree-"));
	source = join(work, "source");
	git(work, "init", "-q", source);
	writeFile(source, "README.md", "# Demo\n");
	writeFile(source, "src/app.ts", "export const app = () => 'hi';\n");
	writeFile(source, "src/lib/util.ts", "export const add = (a: number, b: number) => a + b;\n");
	git(source, "add", "-A");
	git(source, "commit", "-qm", "first");
	writeFile(source, "assets/logo.bin", pseudoRandomBytes(4096, 11));
	writeFile(source, "tools/run.sh", "#!/bin/sh\necho run\n");
	chmodSync(join(source, "tools/run.sh"), 0o755);
	symlinkSync("README.md", join(source, "README.link"));
	writeFile(source, "docs/guide/intro.md", "Intro\n");
	writeFile(source, "docs/guide/only.md", "Only file in this folder after the edit\n");
	git(source, "add", "-A");
	git(source, "commit", "-qm", "binary, executable, symlink, nested docs");
	writeFile(source, "src/app.ts", "export const app = () => 'hello';\n");
	git(source, "commit", "-qam", "third");
	repo = loadGitRepo(source);
	headTree = git(source, "rev-parse", "HEAD^{tree}");
});

afterAll(() => {
	rmSync(work, { recursive: true, force: true });
});

describe("reading", () => {
	test("resolveRevision takes a branch, a full ref, and an oid", async () => {
		const head = git(source, "rev-parse", "HEAD");
		expect(await resolveRevision(repo, "main")).toEqual({ ref: "refs/heads/main", commit: head, tree: headTree });
		expect(await resolveRevision(repo, "refs/heads/main")).toEqual({ ref: "refs/heads/main", commit: head, tree: headTree });
		expect(await resolveRevision(repo, head)).toEqual({ ref: null, commit: head, tree: headTree });
		expect(await resolveRevision(repo, "nope")).toBeUndefined();
	});

	test("readPath finds files and folders with git's modes, and nothing for bad paths", async () => {
		const util = await readPath(repo, headTree, "src/lib/util.ts");
		expect(util).toEqual({ mode: "100644", name: "util.ts", oid: git(source, "rev-parse", "HEAD:src/lib/util.ts") });
		expect((await readPath(repo, headTree, "tools/run.sh"))?.mode).toBe("100755");
		expect((await readPath(repo, headTree, "README.link"))?.mode).toBe("120000");
		expect((await readPath(repo, headTree, "src/lib"))?.mode).toBe("40000");
		expect(await readPath(repo, headTree, "src/missing.ts")).toBeUndefined();
		expect(await readPath(repo, headTree, "README.md/inside")).toBeUndefined();
		expect((await readTree(repo, headTree)).map((e) => e.name)).toEqual(git(source, "ls-tree", "--name-only", "HEAD").split("\n"));
	});

	test("pathProblem rejects what git refuses", () => {
		expect(pathProblem("src/app.ts")).toBeNull();
		expect(pathProblem("")).toMatch(/empty/);
		expect(pathProblem("/abs")).toMatch(/relative/);
		expect(pathProblem("a//b")).toMatch(/empty segments/);
		expect(pathProblem("a/")).toMatch(/empty segments/);
		expect(pathProblem("../x")).toMatch(/'\.\.'/);
		expect(pathProblem("a/./b")).toMatch(/'\.'/);
		expect(pathProblem("a/.git/config")).toMatch(/\.git/);
		expect(pathProblem(".GIT")).toMatch(/\.git/);
		expect(pathProblem(42)).toMatch(/string/);
		expect(changesProblem([])).toMatch(/at least one/);
		expect(changesProblem([{ path: "a", delete: true }, { path: "a", delete: true }])).toMatch(/twice/);
		expect(changesProblem([{ path: "a", delete: true }, { path: "a/b", delete: true }])).toMatch(/folder/);
	});
});

describe("applyChanges matches git write-tree", () => {
	test("edit nested, add binary, delete, new deep folder, executable, symlink, emptied folder", async () => {
		const binary = pseudoRandomBytes(2000, 5);
		const changes = [
			{ path: "src/lib/util.ts", content: encodeText("export const add = (a: number, b: number) => a + b + 0;\n") },
			{ path: "assets/photo.bin", content: binary },
			{ path: "README.md", delete: true as const },
			{ path: "features/x/y/z/new.ts", content: encodeText("export {};\n") },
			{ path: "tools/build.sh", content: encodeText("#!/bin/sh\nbun run build\n"), mode: "100755" as const },
			{ path: "tools/run.sh", content: encodeText("#!/bin/sh\necho changed, still executable\n") },
			{ path: "src/link", content: encodeText("app.ts"), mode: "120000" as const },
			{ path: "docs/guide/intro.md", delete: true as const },
			{ path: "docs/guide/only.md", delete: true as const },
		];
		const built = await applyChanges(repo, headTree, changes);

		// The same edits in git's working copy.
		writeFile(source, "src/lib/util.ts", "export const add = (a: number, b: number) => a + b + 0;\n");
		writeFile(source, "assets/photo.bin", binary);
		unlinkSync(join(source, "README.md"));
		writeFile(source, "features/x/y/z/new.ts", "export {};\n");
		writeFile(source, "tools/build.sh", "#!/bin/sh\nbun run build\n");
		chmodSync(join(source, "tools/build.sh"), 0o755);
		writeFile(source, "tools/run.sh", "#!/bin/sh\necho changed, still executable\n");
		symlinkSync("app.ts", join(source, "src/link"));
		rmSync(join(source, "docs"), { recursive: true });
		git(source, "add", "-A");
		expect(built.tree).toBe(git(source, "write-tree"));
		expect(await repo.hasObjects([built.tree])).toEqual(new Set());

		await repo.putObjects(built.objects);
		expect((await readPath(repo, built.tree, "tools/run.sh"))?.mode).toBe("100755");
		expect((await readPath(repo, built.tree, "tools/build.sh"))?.mode).toBe("100755");
		expect(await readPath(repo, built.tree, "docs")).toBeUndefined();
		expect(await readPath(repo, built.tree, "README.md")).toBeUndefined();
		expect(decodeText((await repo.getObject((await readPath(repo, built.tree, "src/link"))!.oid))!.data)).toBe("app.ts");

		const commit = await buildCommit({
			tree: built.tree,
			parents: [git(source, "rev-parse", "HEAD")],
			author: { name: "Taru Test", email: "test@taru.dev" },
			time: 1700000000,
			message: "edits through the API",
		});
		expect(commit.oid).toBe(git(source, "commit-tree", built.tree, "-p", "HEAD", "-m", "edits through the API"));
	});

	test("an empty base and emptying the whole tree", async () => {
		const fresh = await applyChanges(repo, null, [{ path: "a/b.txt", content: encodeText("b\n") }]);
		const scratch = join(work, "scratch");
		git(work, "init", "-q", scratch);
		writeFile(scratch, "a/b.txt", "b\n");
		git(scratch, "add", "-A");
		expect(fresh.tree).toBe(git(scratch, "write-tree"));

		await repo.putObjects(fresh.objects);
		const emptied = await applyChanges(repo, fresh.tree, [{ path: "a/b.txt", delete: true }]);
		expect(emptied.tree).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
	});
});
