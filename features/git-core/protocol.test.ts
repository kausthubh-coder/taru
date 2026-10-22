// End to end: the real `git` binary pushes, clones, fetches and deletes against the three protocol functions,
// served over node:http with a memory repo. This is the proof that Taru is a drop-in Git server.

import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { concatBytes, decodeText, encodeText } from "./bytes.ts";
import { MemoryRepo } from "./memoryRepo.ts";
import { hashObject, parseCommit, serializeCommit, ZERO_OID } from "./objects.ts";
import { scanPack } from "./packReader.ts";
import { writePack } from "./packWriter.ts";
import { PktReader, PktWriter } from "./pktline.ts";
import { advertiseRefs, isValidRefName, receivePack, uploadPack, type GitService } from "./protocol.ts";

interface RecordedRequest {
	service: GitService;
	gzip: boolean;
	body: Uint8Array;
	response: Uint8Array;
}

const repo = new MemoryRepo();
const requests: RecordedRequest[] = [];
let server: Server;
let remoteUrl: string;
let workDir: string;
let gitEnv: NodeJS.ProcessEnv;

beforeAll(async () => {
	workDir = mkdtempSync(join(tmpdir(), "taru-e2e-"));
	// An isolated git config: no credential helpers, proxies or autocrlf from the machine running the test.
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

	server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			void handle(Buffer.concat(chunks));
		});

		async function handle(raw: Buffer): Promise<void> {
			const url = new URL(request.url!, "http://localhost");
			try {
				if (request.method === "GET" && url.pathname === "/r.git/info/refs") {
					const service = url.searchParams.get("service") as GitService;
					const body = await advertiseRefs(service, repo);
					response.writeHead(200, { "Content-Type": `application/x-${service}-advertisement`, "Cache-Control": "no-cache" });
					response.end(body);
					return;
				}
				if (request.method === "POST" && (url.pathname === "/r.git/git-upload-pack" || url.pathname === "/r.git/git-receive-pack")) {
					const service = url.pathname.slice("/r.git/".length) as GitService;
					const gzip = request.headers["content-encoding"] === "gzip";
					const body = new Uint8Array(gzip ? gunzipSync(raw) : raw);
					const result = service === "git-upload-pack" ? await uploadPack(body, repo) : await receivePack(body, repo);
					requests.push({ service, gzip, body, response: result });
					response.writeHead(200, { "Content-Type": `application/x-${service}-result`, "Cache-Control": "no-cache" });
					response.end(result);
					return;
				}
				response.writeHead(404).end();
			} catch (error) {
				response.writeHead(500).end(String(error));
			}
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("no server port");
	remoteUrl = `http://127.0.0.1:${address.port}/r.git`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	rmSync(workDir, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs git without blocking the event loop: the HTTP server it talks to lives in this same process. */
function git(cwd: string, ...args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("git", ["-c", "core.autocrlf=false", ...args], { cwd, env: gitEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) reject(new Error(`git ${args.join(" ")} failed: ${stderr || error.message}`));
			else resolve(stdout.trim());
		});
	});
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

/** Every file under `root` except .git, as relative path -> bytes. */
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

function expectSameWorkingTree(a: string, b: string): void {
	const left = snapshotFiles(a);
	const right = snapshotFiles(b);
	expect([...right.keys()].toSorted()).toEqual([...left.keys()].toSorted());
	for (const [path, bytes] of left) expect(right.get(path), path).toEqual(bytes);
}

async function expectSameHistory(a: string, b: string): Promise<void> {
	expect(await git(b, "rev-parse", "HEAD")).toBe(await git(a, "rev-parse", "HEAD"));
	expect(await git(b, "log", "--format=%H %T %P %s")).toBe(await git(a, "log", "--format=%H %T %P %s"));
	// Modes and blob ids for every path, which also covers the executable bit.
	expect(await git(b, "ls-tree", "-r", "HEAD")).toBe(await git(a, "ls-tree", "-r", "HEAD"));
	expect(await git(b, "fsck", "--strict")).toBe("");
}

async function lsRemote(cwd: string): Promise<string[]> {
	return (await git(cwd, "ls-remote", remoteUrl))
		.split("\n")
		.map((line) => line.split("\t")[1]);
}

/** Pack bytes from an upload-pack response: band-1 payloads, skipping the ACK/NAK lines in front. */
function sentPack(response: Uint8Array): Uint8Array {
	const reader = new PktReader(response);
	const bands: Uint8Array[] = [];
	for (let pkt = reader.next(); pkt; pkt = reader.next()) {
		if (pkt.kind === "data" && pkt.data[0] === 1) bands.push(pkt.data.subarray(1));
	}
	return concatBytes(bands);
}

/** Pack bytes from a recorded receive-pack body: everything after the flush that ends the command list. */
function pushedPack(body: Uint8Array): Uint8Array {
	const reader = new PktReader(body);
	let pkt = reader.next();
	while (pkt && pkt.kind !== "flush") pkt = reader.next();
	return body.subarray(reader.offset);
}

describe("real git against the protocol", () => {
	let source: string;
	let clone1: string;
	const extraTags = Array.from({ length: 20 }, (_, i) => `refs/tags/t${String(i + 1).padStart(2, "0")}`);

	test("a. pushes a real-shaped repo into the empty server", async () => {
		source = join(workDir, "source");
		mkdirSync(source);
		await git(source, "init", "-q");

		writeFile(source, "README.md", "# Demo\n\nA repo for Taru.\n");
		writeFile(source, "src/app.ts", "export const app = () => 'hi';\n");
		writeFile(source, "src/lib/util.ts", "export const add = (a: number, b: number) => a + b;\n");
		writeFile(source, "docs/guide/intro.md", "Intro\n");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "first");

		writeFile(source, "assets/logo.bin", pseudoRandomBytes(4096, 11));
		writeFile(source, "data/big.bin", pseudoRandomBytes(1_500_000, 12));
		writeFile(source, "empty.txt", "");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "binary, big and empty files");

		writeFile(source, "tools/run.sh", "#!/bin/sh\necho run\n");
		// Executable on disk too, not only in the index: Linux git (core.filemode=true) would otherwise stage the
		// file back to 100644 on the next `git add -A`, adding a tree object the fetch count doesn't expect.
		chmodSync(join(source, "tools/run.sh"), 0o755);
		writeFile(source, "src/lib/deep/nested/more/file.txt", "deep\n");
		writeFile(source, "README.md", "# Demo\n\nA repo for Taru.\n\nThird commit.\n");
		await git(source, "add", "-A");
		await git(source, "update-index", "--chmod=+x", "tools/run.sh");
		await git(source, "commit", "-q", "-m", "executable and deeper nesting");

		await git(source, "remote", "add", "origin", remoteUrl);
		await git(source, "push", "-q", "-u", "origin", "main");

		expect(repo.refs.get("refs/heads/main")).toBe(await git(source, "rev-parse", "HEAD"));
		expect(await git(source, "ls-tree", "HEAD", "tools/run.sh")).toMatch(/^100755 blob/);
		expect(await lsRemote(source)).toEqual(["HEAD", "refs/heads/main"]);
	});

	test("b. a fresh clone matches the source byte for byte and passes fsck", async () => {
		clone1 = join(workDir, "clone1");
		await git(workDir, "clone", "-q", remoteUrl, clone1);
		expect(await git(clone1, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
		await expectSameHistory(source, clone1);
		expectSameWorkingTree(source, clone1);
	});

	test("c. a second push sends a thin pack with deltas, and the clone fetches it incrementally", async () => {
		const clonePack = await scanPack(sentPack(requests.findLast((r) => r.service === "git-upload-pack")!.response));

		writeFile(source, "README.md", "# Demo\n\nA repo for Taru.\n\nThird commit.\n\nFourth commit edits the README.\n");
		const big = pseudoRandomBytes(1_500_000, 12);
		big.set(encodeText("changed in the middle"), 700_000);
		writeFile(source, "data/big.bin", big);
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "edit existing files");
		writeFile(source, "src/app.ts", "export const app = () => 'hello';\n");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "another edit");
		await git(source, "push", "-q", "origin", "main");

		const push = requests.findLast((r) => r.service === "git-receive-pack")!;
		const entries = await scanPack(pushedPack(push.body));
		// git deltifies the edited big blob against the base it knows the server has: a REF_DELTA, thin pack.
		expect(entries.some((entry) => entry.type === 7)).toBe(true);
		expect(repo.refs.get("refs/heads/main")).toBe(await git(source, "rev-parse", "HEAD"));

		const before = requests.length;
		await git(clone1, "pull", "-q", "--ff-only");
		const fetchRounds = requests.slice(before).filter((r) => r.service === "git-upload-pack");
		expect(fetchRounds.length).toBeGreaterThan(0);
		expect(fetchRounds.some((r) => decodeText(r.body).includes("have "))).toBe(true);
		// Incremental: only what changed. 2 commits, their root trees, the data/ and src/ trees, and 3 edited blobs.
		const fetchPack = await scanPack(sentPack(fetchRounds[fetchRounds.length - 1].response));
		expect(fetchPack.length).toBe(9);
		expect(clonePack.length).toBeGreaterThan(fetchPack.length);

		await expectSameHistory(source, clone1);
		expectSameWorkingTree(source, clone1);
	});

	test("d. a second branch and an annotated tag show up in a fresh clone (gzip request bodies)", async () => {
		await git(source, "checkout", "-q", "-b", "feature");
		writeFile(source, "feature.txt", "feature work\n");
		await git(source, "add", "-A");
		await git(source, "commit", "-q", "-m", "feature commit");
		await git(source, "tag", "-a", "v1.0", "-m", "release 1.0");
		// The extra lightweight tags push the next clone's want list past 1 KB, which is when git gzips a request body.
		await git(source, "push", "-q", "origin", "feature", "v1.0", ...extraTags.map((tag) => `main:${tag}`));
		await git(source, "checkout", "-q", "main");

		expect(repo.refs.get("refs/heads/feature")).toBe(await git(source, "rev-parse", "feature"));
		expect(repo.refs.get("refs/tags/v1.0")).toBe(await git(source, "rev-parse", "v1.0"));
		expect(await lsRemote(source)).toEqual(["HEAD", "refs/heads/feature", "refs/heads/main", ...extraTags, "refs/tags/v1.0", "refs/tags/v1.0^{}"]);

		const before = requests.length;
		const clone2 = join(workDir, "clone2");
		await git(workDir, "clone", "-q", remoteUrl, clone2);
		expect(requests.slice(before).some((r) => r.gzip)).toBe(true);

		await expectSameHistory(source, clone2);
		expectSameWorkingTree(source, clone2);
		expect(await git(clone2, "rev-parse", "origin/feature")).toBe(await git(source, "rev-parse", "feature"));
		expect(await git(clone2, "cat-file", "-t", "v1.0")).toBe("tag");
		expect(await git(clone2, "rev-parse", "v1.0")).toBe(await git(source, "rev-parse", "v1.0"));
		expect(await git(clone2, "tag", "-n1", "v1.0")).toMatch(/release 1\.0$/);
	});

	test("e. deleting the branch via push removes it from ls-remote", async () => {
		await git(source, "push", "-q", "origin", "--delete", "feature");
		expect(repo.refs.has("refs/heads/feature")).toBe(false);
		expect(await lsRemote(source)).toEqual(["HEAD", "refs/heads/main", ...extraTags, "refs/tags/v1.0", "refs/tags/v1.0^{}"]);
	});

	test("f. receivePack rejects a wrong old oid and applies nothing", async () => {
		const main = repo.refs.get("refs/heads/main")!;
		const parent = parseCommit((await repo.getObject(main))!.data);
		const commitData = serializeCommit({ ...parent, parents: [main], message: "forged\n" });
		const commitOid = await hashObject({ type: "commit", data: commitData });
		const pack = await writePack([{ type: "commit", data: commitData }], 1);

		const request = new PktWriter();
		request.line(`${"1".repeat(40)} ${commitOid} refs/heads/main\0report-status\n`);
		request.flush();
		request.raw(pack);
		const refsBefore = new Map(repo.refs);
		const objectCount = repo.objects.size;

		const response = decodeText(await receivePack(request.bytes(), repo));
		expect(response).toBe(`000eunpack ok\n002cng refs/heads/main failed to update ref\n0000`);
		expect(repo.refs).toEqual(refsBefore);
		expect(repo.objects.size).toBe(objectCount);
		expect(repo.objects.has(commitOid)).toBe(false);
	});
});

describe("protocol details", () => {
	test("advertises an empty repo with the capabilities^{} line", async () => {
		const empty = new MemoryRepo();
		const advertisement = decodeText(await advertiseRefs("git-receive-pack", empty));
		expect(advertisement).toBe(
			"001f# service=git-receive-pack\n0000" +
				`008b${ZERO_OID} capabilities^{}\0report-status delete-refs side-band-64k quiet atomic ofs-delta agent=taru/0.1\n0000`,
		);
	});

	test("advertises HEAD as a symref so clones check out the right branch", async () => {
		const advertisement = decodeText(await advertiseRefs("git-upload-pack", repo));
		const main = repo.refs.get("refs/heads/main")!;
		expect(advertisement).toContain(`${main} HEAD\0multi_ack_detailed side-band-64k ofs-delta no-progress include-tag symref=HEAD:refs/heads/main agent=taru/0.1\n`);
		expect(advertisement).toContain(`${repo.refs.get("refs/tags/v1.0")} refs/tags/v1.0\n`);
	});

	test("rejects wants that are not advertised tips", async () => {
		const request = new PktWriter();
		request.line(`want ${"a".repeat(40)} side-band-64k\n`);
		request.flush();
		request.line("done\n");
		const response = decodeText(await uploadPack(request.bytes(), repo));
		expect(response).toBe(`004aERR upload-pack: not our ref ${"a".repeat(40)}\n`);
	});

	test("atomic push: one bad command rejects them all without touching refs", async () => {
		const main = repo.refs.get("refs/heads/main")!;
		const request = new PktWriter();
		request.line(`${ZERO_OID} ${main} refs/heads/copy\0report-status atomic\n`);
		request.line(`${ZERO_OID} ${main} refs/heads/bad..name\n`);
		request.flush();
		const response = decodeText(await receivePack(request.bytes(), repo));
		expect(response).toContain("ng refs/heads/bad..name funny refname\n");
		expect(response).toContain("ng refs/heads/copy atomic push failed\n");
		expect(repo.refs.has("refs/heads/copy")).toBe(false);
	});

	test("non-atomic push: a bad command does not block the others", async () => {
		const main = repo.refs.get("refs/heads/main")!;
		const request = new PktWriter();
		request.line(`${ZERO_OID} ${main} refs/heads/copy\0report-status side-band-64k\n`);
		request.line(`${ZERO_OID} ${main} refs/heads/main\n`);
		request.flush();
		const response = await receivePack(request.bytes(), repo);
		// With side-band-64k the report rides in band 1, then a flush.
		const reader = new PktReader(response);
		const bands = [];
		for (let pkt = reader.next(); pkt; pkt = reader.next()) if (pkt.kind === "data") bands.push(pkt.data);
		const report = decodeText(concatBytes(bands.map((band) => band.subarray(1))));
		expect(report).toBe("000eunpack ok\n0017ok refs/heads/copy\n002cng refs/heads/main failed to update ref\n0000");
		expect(decodeText(response.subarray(-4))).toBe("0000");
		expect(repo.refs.get("refs/heads/copy")).toBe(main);
		expect(repo.refs.get("refs/heads/main")).toBe(main);
	});

	test("refuses to delete the branch HEAD points at", async () => {
		const main = repo.refs.get("refs/heads/main")!;
		const request = new PktWriter();
		request.line(`${main} ${ZERO_OID} refs/heads/main\0report-status delete-refs\n`);
		request.flush();
		const response = decodeText(await receivePack(request.bytes(), repo));
		expect(response).toContain("ng refs/heads/main deletion of the current branch prohibited\n");
		expect(repo.refs.get("refs/heads/main")).toBe(main);
	});

	test("ref name rules follow check-ref-format", () => {
		expect(isValidRefName("refs/heads/main")).toBe(true);
		expect(isValidRefName("refs/heads/feature/x-1.2")).toBe(true);
		for (const bad of ["main", "refs/heads/", "refs/heads/.hidden", "refs/heads/a..b", "refs/heads/a b", "refs/heads/x.lock", "refs/heads/a@{b}", "refs/heads/a~1"]) {
			expect(isValidRefName(bad), bad).toBe(false);
		}
	});
});
