// End to end for the client side: fetchFromRemote and pushToRemote against real `git http-backend`
// (scripts/fake-github.mjs), with the real `git` binary building the history and checking the results.
// This is the proof that an import from GitHub and the GitHub copy move bytes exactly.

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { encodeText } from "./bytes.ts";
import { fetchAdvertisement, type RemoteError } from "./client.ts";
import { MemoryRepo } from "./memoryRepo.ts";
import { advertiseRefs, type GitService, receivePack, uploadPack } from "./protocol.ts";
import { fetchFromRemote, pushToRemote } from "./sync.ts";

const TOKEN = "s3cret-pat";
const auth = { Authorization: `Basic ${btoa(`x-access-token:${TOKEN}`)}` };
const options = { headers: auth, maxPackBytes: 50 * 1024 * 1024 };

const repo = new MemoryRepo();
let fakeGithub: ChildProcess;
let githubUrl: string;
let originUrl: string;
let mirrorUrl: string;
let originDir: string;
let mirrorDir: string;
let taruServer: Server;
let taruUrl: string;
let workDir: string;
let source: string;
let gitEnv: NodeJS.ProcessEnv;

beforeAll(async () => {
	workDir = mkdtempSync(join(tmpdir(), "taru-sync-"));
	const globalConfig = join(workDir, "gitconfig");
	writeFileSync(globalConfig, "[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n");
	gitEnv = {
		...process.env,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: globalConfig,
		GIT_AUTHOR_NAME: "Taru Test",
		GIT_AUTHOR_EMAIL: "test@taru.dev",
		GIT_COMMITTER_NAME: "Taru Test",
		GIT_COMMITTER_EMAIL: "test@taru.dev",
		GIT_TERMINAL_PROMPT: "0",
	};

	const githubRoot = join(workDir, "github");
	originDir = join(githubRoot, "octo", "origin.git");
	mirrorDir = join(githubRoot, "octo", "copy.git");
	mkdirSync(join(githubRoot, "octo"), { recursive: true });
	await git(workDir, "init", "-q", "--bare", "-b", "main", originDir);
	await git(workDir, "init", "-q", "--bare", "-b", "main", mirrorDir);

	const script = resolve(import.meta.dirname, "..", "..", "scripts", "fake-github.mjs");
	fakeGithub = spawn(process.execPath, [script, githubRoot, "--token", TOKEN], { stdio: ["ignore", "pipe", "inherit"] });
	const port = await new Promise<string>((resolvePort, reject) => {
		fakeGithub.stdout!.on("data", (chunk: Buffer) => {
			const m = /listening (\d+)/.exec(chunk.toString());
			if (m) resolvePort(m[1]);
		});
		fakeGithub.on("exit", (code) => reject(new Error(`fake github exited with ${code}`)));
	});
	githubUrl = `http://127.0.0.1:${port}`;
	originUrl = `${githubUrl}/octo/origin.git`;
	mirrorUrl = `${githubUrl}/octo/copy.git`;

	// The memory repo served the way Taru serves it, so `git clone` can check what the fetch stored.
	taruServer = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			void (async () => {
				const url = new URL(request.url!, "http://localhost");
				try {
					if (request.method === "GET" && url.pathname === "/m.git/info/refs") {
						const service = url.searchParams.get("service") as GitService;
						response.writeHead(200, { "Content-Type": `application/x-${service}-advertisement` });
						response.end(await advertiseRefs(service, repo));
						return;
					}
					if (request.method === "POST") {
						const service = url.pathname.slice("/m.git/".length) as GitService;
						const body = new Uint8Array(Buffer.concat(chunks));
						const result = service === "git-upload-pack" ? await uploadPack(body, repo) : await receivePack(body, repo);
						response.writeHead(200, { "Content-Type": `application/x-${service}-result` });
						response.end(result);
						return;
					}
					response.writeHead(404).end();
				} catch (error) {
					response.writeHead(500).end(String(error));
				}
			})();
		});
	});
	await new Promise<void>((done) => taruServer.listen(0, "127.0.0.1", done));
	const address = taruServer.address();
	if (!address || typeof address === "string") throw new Error("no server port");
	taruUrl = `http://127.0.0.1:${address.port}/m.git`;
});

afterAll(async () => {
	fakeGithub.kill("SIGTERM");
	await new Promise<void>((done) => taruServer.close(() => done()));
	rmSync(workDir, { recursive: true, force: true, maxRetries: 10 });
});

function git(cwd: string, ...args: string[]): Promise<string> {
	return new Promise((resolveOut, reject) => {
		execFile("git", args, { cwd, env: gitEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) reject(new Error(`git ${args.join(" ")} failed: ${stderr || error.message}`));
			else resolveOut(stdout.trim());
		});
	});
}

/** The URL git uses to talk to the fake GitHub: the token as the Basic password. */
function withToken(url: string): string {
	return url.replace("http://", `http://x-access-token:${TOKEN}@`);
}

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1103515245) + 12345) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

function writeFile(root: string, path: string, content: string | Uint8Array): void {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), content);
}

function snapshotFiles(root: string): Map<string, Uint8Array> {
	const files = new Map<string, Uint8Array>();
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			if (name === ".git") continue;
			const full = join(dir, name);
			if (statSync(full).isDirectory()) walk(full);
			else files.set(relative(root, full).replaceAll("\\", "/"), new Uint8Array(readFileSync(full)));
		}
	};
	walk(root);
	return files;
}

/** Branches and tags of a repo as "<oid> <ref>" lines, the way both sides must agree on them. */
async function syncedRefs(dir: string): Promise<string[]> {
	const lines = (await git(dir, "show-ref")).split("\n").filter((line) => / refs\/(heads|tags)\//.test(line));
	return lines.toSorted(byRefName);
}

function memoryRefs(): string[] {
	return [...repo.refs].map(([name, oid]) => `${oid} ${name}`).toSorted(byRefName);
}

function byRefName(a: string, b: string): number {
	return a.split(" ")[1].localeCompare(b.split(" ")[1]);
}

async function expectSameHistory(a: string, b: string, ref: string): Promise<void> {
	expect(await git(b, "rev-parse", ref)).toBe(await git(a, "rev-parse", ref));
	expect(await git(b, "log", "--format=%H %T %P %s", ref)).toBe(await git(a, "log", "--format=%H %T %P %s", ref));
	expect(await git(b, "ls-tree", "-r", ref)).toBe(await git(a, "ls-tree", "-r", ref));
}

async function expectMirrorMatchesOrigin(): Promise<void> {
	expect(await syncedRefs(mirrorDir)).toEqual(await syncedRefs(originDir));
	expect(await syncedRefs(mirrorDir)).toEqual(memoryRefs());
	// A force-push leaves the replaced commits unreachable on the copy, as it does on any Git server.
	expect(await git(mirrorDir, "fsck", "--full", "--strict", "--no-dangling")).toBe("");
	for (const line of await syncedRefs(mirrorDir)) {
		const ref = line.split(" ")[1];
		if (ref.startsWith("refs/heads/")) await expectSameHistory(originDir, mirrorDir, ref);
	}
}

describe("fetchFromRemote (import)", () => {
	test("a. real git builds a real-shaped history on the fake GitHub", async () => {
		source = join(workDir, "source");
		mkdirSync(source);
		await git(source, "init", "-q");
		writeFile(source, "README.md", "# Demo\n");
		writeFile(source, "src/app.ts", "export const app = () => 'hi';\n");
		writeFile(source, "src/lib/deep/util.ts", "export const add = (a: number, b: number) => a + b;\n");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "first");
		writeFile(source, "assets/logo.bin", pseudoRandomBytes(4096, 11));
		writeFile(source, "data/big.bin", pseudoRandomBytes(1_200_000, 12));
		writeFile(source, "empty.txt", "");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "binary, big and empty");
		writeFile(source, "tools/run.sh", "#!/bin/sh\necho run\n");
		chmodSync(join(source, "tools/run.sh"), 0o755);
		writeFile(source, "README.md", "# Demo\n\nThird.\n");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "executable and an edit");
		await git(source, "tag", "-a", "v1.0", "-m", "release 1.0");
		await git(source, "tag", "light");
		await git(source, "checkout", "-q", "-b", "feature");
		writeFile(source, "feature.txt", "feature work\n");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "feature commit");
		await git(source, "checkout", "-q", "main");

		await git(source, "push", "-q", "--mirror", withToken(originUrl));
		expect((await syncedRefs(originDir)).map((line) => line.split(" ")[1])).toEqual([
			"refs/heads/feature",
			"refs/heads/main",
			"refs/tags/light",
			"refs/tags/v1.0",
		]);
	});

	test("b. without the token the fake GitHub answers 401, like GitHub", async () => {
		const error = await fetchAdvertisement(originUrl, "git-upload-pack", { maxResponseBytes: 1024 }).catch((e: RemoteError) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as RemoteError).status).toBe(401);
	});

	test("c. imports every branch, tag and object into an empty repo", async () => {
		const result = await fetchFromRemote(repo, originUrl, options);
		expect(result.head).toBe("refs/heads/main");
		expect([...result.refs.keys()].toSorted()).toEqual(["refs/heads/feature", "refs/heads/main", "refs/tags/light", "refs/tags/v1.0"]);
		expect(memoryRefs()).toEqual(await syncedRefs(originDir));
		// Every object git has, we have, with the same id (so the same bytes).
		const originObjects = (await git(originDir, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)")).split("\n").toSorted();
		expect([...repo.objects.keys()].toSorted()).toEqual(originObjects);
		expect(result.objects).toBe(originObjects.length);
		repo.head = result.head!;

		const clone = join(workDir, "clone-of-import");
		await git(workDir, "clone", "-q", taruUrl, clone);
		expect(await git(clone, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
		await expectSameHistory(source, clone, "HEAD");
		expect(snapshotFiles(clone)).toEqual(snapshotFiles(source));
		expect(await git(clone, "fsck", "--strict")).toBe("");
		expect(await git(clone, "rev-parse", "origin/feature")).toBe(await git(source, "rev-parse", "feature"));
		expect(await git(clone, "cat-file", "-t", "v1.0")).toBe("tag");
		expect(await git(clone, "ls-tree", "HEAD", "tools/run.sh")).toMatch(/^100755 blob/);
	});

	test("d. a pack over the limit is refused with a clear error and stores nothing", async () => {
		const fresh = new MemoryRepo();
		const error = await fetchFromRemote(fresh, originUrl, { ...options, maxPackBytes: 1000 }).catch((e: RemoteError) => e);
		expect(String((error as Error).message)).toMatch(/1000 byte limit/);
		expect(fresh.objects.size).toBe(0);
		expect(fresh.refs.size).toBe(0);
	});
});

describe("pushToRemote (mirror)", () => {
	test("e. the first push copies every branch and tag into an empty remote", async () => {
		const result = await pushToRemote(repo, mirrorUrl, options);
		expect(result.commands.map((command) => command.ref).toSorted()).toEqual(["refs/heads/feature", "refs/heads/main", "refs/tags/light", "refs/tags/v1.0"]);
		expect(result.commands.every((command) => command.old === null)).toBe(true);
		expect(result.results.every((r) => r.ok)).toBe(true);
		expect(result.objects).toBe(repo.objects.size);
		await expectMirrorMatchesOrigin();

		const clone = join(workDir, "clone-of-mirror");
		await git(workDir, "clone", "-q", mirrorDir, clone);
		expect(snapshotFiles(clone)).toEqual(snapshotFiles(source));
		expect(await git(clone, "tag", "-n1", "v1.0")).toMatch(/release 1\.0$/);
	});

	test("f. nothing to do when the remote already matches", async () => {
		const result = await pushToRemote(repo, mirrorUrl, options);
		expect(result.commands).toEqual([]);
		expect(result.objects).toBe(0);
	});

	test("g. an incremental change sends only the new objects", async () => {
		writeFile(source, "src/app.ts", "export const app = () => 'hello';\n");
		writeFile(source, "data/big.bin", (() => {
			const big = pseudoRandomBytes(1_200_000, 12);
			big.set(encodeText("changed in the middle"), 600_000);
			return big;
		})());
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "edit two files");
		await git(source, "branch", "topic");
		await git(source, "push", "-q", withToken(originUrl), "main", "topic");

		const fetched = await fetchFromRemote(repo, originUrl, options);
		// 1 commit, root tree, src/ and data/ trees, 2 blobs.
		expect(fetched.objects).toBe(6);
		expect(fetched.updates.map((u) => u.ref).toSorted()).toEqual(["refs/heads/main", "refs/heads/topic"]);
		expect(memoryRefs()).toEqual(await syncedRefs(originDir));

		const pushed = await pushToRemote(repo, mirrorUrl, options);
		expect(pushed.commands.map((c) => c.ref).toSorted()).toEqual(["refs/heads/main", "refs/heads/topic"]);
		expect(pushed.objects).toBe(6);
		expect(pushed.results.every((r) => r.ok)).toBe(true);
		await expectMirrorMatchesOrigin();
	});

	test("h. a force-push is copied as a forced update", async () => {
		const before = await git(originDir, "rev-parse", "refs/heads/main");
		await git(source, "commit", "-q", "--amend", "-m", "edit two files (amended)");
		await git(source, "push", "-q", "-f", withToken(originUrl), "main");
		const after = await git(originDir, "rev-parse", "refs/heads/main");
		expect(after).not.toBe(before);

		const fetched = await fetchFromRemote(repo, originUrl, options);
		expect(fetched.updates).toEqual([{ ref: "refs/heads/main", old: before, new: after }]);
		const pushed = await pushToRemote(repo, mirrorUrl, options);
		expect(pushed.commands).toEqual([{ ref: "refs/heads/main", old: before, new: after }]);
		expect(pushed.results).toEqual([{ ref: "refs/heads/main", ok: true }]);
		await expectMirrorMatchesOrigin();
	});

	test("i. deleting a branch and a tag deletes them on the copy", async () => {
		await git(source, "push", "-q", withToken(originUrl), "--delete", "feature", "light");
		const fetched = await fetchFromRemote(repo, originUrl, options);
		expect(fetched.objects).toBe(0);
		expect(fetched.updates.map((u) => [u.ref, u.new])).toEqual([
			["refs/heads/feature", null],
			["refs/tags/light", null],
		]);
		const pushed = await pushToRemote(repo, mirrorUrl, options);
		expect(pushed.commands.map((c) => [c.ref, c.new])).toEqual([
			["refs/heads/feature", null],
			["refs/tags/light", null],
		]);
		expect(pushed.results.every((r) => r.ok)).toBe(true);
		expect((await syncedRefs(mirrorDir)).map((line) => line.split(" ")[1])).toEqual(["refs/heads/main", "refs/heads/topic", "refs/tags/v1.0"]);
		await expectMirrorMatchesOrigin();
	});

	test("j. a ref the remote refuses comes back as a per-ref failure, the others still land", async () => {
		await git(mirrorDir, "config", "receive.denyNonFastForwards", "true");
		await git(source, "commit", "-q", "--amend", "-m", "amended again");
		await git(source, "branch", "extra");
		await git(source, "push", "-q", "-f", withToken(originUrl), "main", "extra");
		await fetchFromRemote(repo, originUrl, options);

		const pushed = await pushToRemote(repo, mirrorUrl, options);
		expect(pushed.results.toSorted((a, b) => a.ref.localeCompare(b.ref))).toEqual([
			{ ref: "refs/heads/extra", ok: true },
			{ ref: "refs/heads/main", ok: false, reason: "non-fast-forward" },
		]);
		expect(await git(mirrorDir, "rev-parse", "refs/heads/extra")).toBe(await git(originDir, "rev-parse", "refs/heads/extra"));
		expect(await git(mirrorDir, "rev-parse", "refs/heads/main")).not.toBe(await git(originDir, "rev-parse", "refs/heads/main"));

		await git(mirrorDir, "config", "--unset", "receive.denyNonFastForwards");
		const retried = await pushToRemote(repo, mirrorUrl, options);
		expect(retried.results).toEqual([{ ref: "refs/heads/main", ok: true }]);
		await expectMirrorMatchesOrigin();
	});
});
