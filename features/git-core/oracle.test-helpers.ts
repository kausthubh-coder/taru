// Test helpers that use the real `git` binary as the oracle: build a repo on disk, load its objects into a
// MemoryRepo, and run git commands in it. Only tests import this.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MemoryRepo } from "./memoryRepo.ts";
import type { ObjectType, StoredObject } from "./repo.ts";

export const ORACLE_ENV: NodeJS.ProcessEnv = {
	...process.env,
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_AUTHOR_NAME: "Taru Test",
	GIT_AUTHOR_EMAIL: "test@taru.dev",
	GIT_AUTHOR_DATE: "1700000000 +0000",
	GIT_COMMITTER_NAME: "Taru Test",
	GIT_COMMITTER_EMAIL: "test@taru.dev",
	GIT_COMMITTER_DATE: "1700000000 +0000",
	GIT_TERMINAL_PROMPT: "0",
};

export function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", ...args], {
		cwd,
		env: ORACLE_ENV,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 64 * 1024 * 1024,
	}).trim();
}

/** Like git(), but returns the exit status too: `git merge-tree` exits 1 on conflicts. */
export function gitStatus(cwd: string, ...args: string[]): { status: number; stdout: string } {
	try {
		return { status: 0, stdout: git(cwd, ...args) };
	} catch (error) {
		const failed = error as { status: number; stdout: string };
		return { status: failed.status, stdout: String(failed.stdout).trim() };
	}
}

export function writeFile(root: string, path: string, content: string | Uint8Array): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
}

/** Every object in the git repo at `dir`, copied into a MemoryRepo along with its refs. */
export function loadGitRepo(dir: string): MemoryRepo {
	const repo = new MemoryRepo();
	const raw = execFileSync("git", ["cat-file", "--batch-all-objects", "--batch", "--unordered"], {
		cwd: dir,
		env: ORACLE_ENV,
		maxBuffer: 256 * 1024 * 1024,
	});
	const objects: StoredObject[] = [];
	let pos = 0;
	while (pos < raw.length) {
		const newline = raw.indexOf(0x0a, pos);
		const [oid, type, sizeText] = raw.subarray(pos, newline).toString("utf8").split(" ");
		const size = Number(sizeText);
		const start = newline + 1;
		objects.push({ oid, type: type as ObjectType, data: new Uint8Array(raw.subarray(start, start + size)) });
		pos = start + size + 1;
	}
	void repo.putObjects(objects);
	for (const line of git(dir, "for-each-ref", "--format=%(refname) %(objectname)").split("\n")) {
		if (!line) continue;
		const [ref, oid] = line.split(" ");
		repo.refs.set(ref, oid);
	}
	return repo;
}
