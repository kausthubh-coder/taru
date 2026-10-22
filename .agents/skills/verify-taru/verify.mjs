#!/usr/bin/env node
// Drives a real, isolated Taru instance and saves evidence. Run from the repo root:
//   node .agents/skills/verify-taru/verify.mjs <command> [args]
// Commands: launch | doctor | stop | shot <name> [--phone] [--dark] | waitlist <email> | repos | git-roundtrip | agent-api | mcp
// Instance state: .verify/instance.json. Throwaway backend: .verify/state. Evidence: .verify/evidence/<run>/ (kept).
import { execFileSync, execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const dir = join(root, ".verify");
const instanceFile = join(dir, "instance.json");
const stateDir = join(dir, "state");
const isWin = process.platform === "win32";

const [command, ...args] = process.argv.slice(2);
const log = (msg) => console.warn(msg);
const fail = (msg) => {
	console.error(`FAIL ${msg}`);
	process.exit(1);
};

function instance() {
	if (!existsSync(instanceFile)) fail("no instance: run `launch` first");
	return JSON.parse(readFileSync(instanceFile, "utf8"));
}

function evidenceDir() {
	const inst = existsSync(instanceFile) ? JSON.parse(readFileSync(instanceFile, "utf8")) : null;
	const run = inst?.run ?? new Date().toISOString().replace(/[:.]/g, "-");
	const out = join(dir, "evidence", run);
	mkdirSync(out, { recursive: true });
	return out;
}

function adminToken() {
	const vars = readFileSync(join(root, ".dev.vars"), "utf8");
	const token = /^TARU_ADMIN_TOKEN=(.+)$/m.exec(vars)?.[1]?.trim();
	if (!token) fail(".dev.vars has no TARU_ADMIN_TOKEN: run `bun run setup`");
	return token;
}

function free(port) {
	return new Promise((done) => {
		const server = createServer().once("error", () => done(false));
		server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
	});
}

async function ready(url) {
	try {
		const [page, api] = await Promise.all([fetch(url), fetch(`${url}/api/nope`)]);
		return page.ok && (await page.text()).includes("Source control built for coding agents") && api.status === 404;
	} catch {
		return false;
	}
}

function killTree(pid) {
	try {
		if (isWin) execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
		else process.kill(-pid, "SIGTERM");
	} catch {
		// Already gone.
	}
}

async function launch() {
	if (existsSync(instanceFile)) fail(`an instance is already recorded in ${relative(root, instanceFile)}: run \`stop\` first`);
	execSync("node scripts/setup.mjs", { cwd: root, stdio: ["ignore", 2, 2], env: { ...process.env, TARU_SETUP_QUIET: "1" } });

	// Fresh, throwaway backend every launch; dev data in .wrangler/state is never touched.
	rmSync(stateDir, { recursive: true, force: true });
	mkdirSync(stateDir, { recursive: true });
	execSync(`bunx wrangler d1 migrations apply taru --local --persist-to "${stateDir}"`, { cwd: root, stdio: ["ignore", 2, 2] });

	// Our own port, away from the checkout's dev port, so a running `bun run dev` is never driven by mistake.
	const devPort = Number(/^PORT=(\d+)/m.exec(readFileSync(join(root, ".env.local"), "utf8"))?.[1]) || 5173;
	let port = devPort + 1000;
	// oxlint-disable-next-line no-await-in-loop
	while (!(await free(port))) port++;

	const run = new Date().toISOString().replace(/[:.]/g, "-");
	mkdirSync(join(dir, "evidence", run), { recursive: true });
	const logFile = join(dir, "dev.log");
	const out = (await import("node:fs")).openSync(logFile, "w");
	// Run Vite directly with node: through `bun run dev` the recorded PID exits right away on Windows and
	// leaves Vite orphaned, so `stop` couldn't find it.
	const child = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js")], {
		cwd: root,
		env: { ...process.env, PORT: String(port), TARU_STATE_DIR: stateDir },
		stdio: ["ignore", out, out],
		detached: true, // own process group, so the server outlives this launcher on every platform
		windowsHide: true,
	});
	child.unref();
	const url = `http://localhost:${port}`;
	writeFileSync(instanceFile, JSON.stringify({ pid: child.pid, port, url, run, startedAt: new Date().toISOString() }, null, 2));

	const deadline = Date.now() + 60_000;
	// oxlint-disable-next-line no-await-in-loop
	while (!(await ready(url))) {
		if (Date.now() > deadline) fail(`not ready after 60s; see ${relative(root, logFile)}`);
		// oxlint-disable-next-line no-await-in-loop
		await new Promise((r) => setTimeout(r, 500));
	}
	log(`ready: ${url} (pid ${child.pid}, backend ${relative(root, stateDir)}, evidence .verify/evidence/${run})`);
}

async function doctor() {
	const inst = instance();
	const checks = [];
	let alive = true;
	try {
		process.kill(inst.pid, 0);
	} catch {
		alive = false;
	}
	checks.push([alive, `process ${inst.pid} is running`]);
	checks.push([await ready(inst.url), `${inst.url} serves the landing page and the API`]);
	checks.push([existsSync(join(stateDir, "v3")), "throwaway backend exists at .verify/state"]);
	checks.push([Boolean(adminToken()), "admin token available from .dev.vars"]);
	for (const [ok, msg] of checks) log(`${ok ? "ok  " : "FAIL"} ${msg}`);
	if (checks.some(([ok]) => !ok)) process.exit(1);
	log("instance is healthy");
}

function stop() {
	if (!existsSync(instanceFile)) return log("no instance recorded");
	const inst = JSON.parse(readFileSync(instanceFile, "utf8"));
	killTree(inst.pid);
	rmSync(instanceFile, { force: true });
	try {
		rmSync(stateDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
	} catch (error) {
		log(`could not remove ${relative(root, stateDir)} (${error.code}); the next launch replaces it`);
	}
	log(`stopped pid ${inst.pid}; evidence kept in .verify/evidence/${inst.run}`);
}

async function browser(fn) {
	const { chromium } = await import("playwright");
	const b = await chromium.launch();
	try {
		return await fn(b);
	} finally {
		await b.close();
	}
}

async function shot(name, flags) {
	if (!name) fail("usage: shot <name> [--phone] [--dark]");
	const inst = instance();
	const out = evidenceDir();
	const phone = flags.includes("--phone");
	await browser(async (b) => {
		const page = await b.newPage({
			viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
			colorScheme: flags.includes("--dark") ? "dark" : "light",
		});
		await page.goto(inst.url, { waitUntil: "networkidle" });
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
		await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
		writeFileSync(join(out, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
		log(`saved ${relative(root, join(out, name))}.png and .aria.txt${overflow ? " (WARNING: horizontal overflow)" : ""}`);
	});
}

async function waitlist(email) {
	if (!email) fail("usage: waitlist <email>");
	const inst = instance();
	const out = evidenceDir();
	const message = await browser(async (b) => {
		const page = await b.newPage();
		await page.goto(inst.url, { waitUntil: "networkidle" });
		const form = page.locator("form[data-waitlist]").first();
		await form.getByLabel("Email").fill(email);
		await form.getByRole("button", { name: "Join the waitlist" }).click();
		const status = form.getByRole("status");
		await status.filter({ hasText: /\S/ }).waitFor({ timeout: 10_000 });
		await page.screenshot({ path: join(out, "waitlist-after-submit.png") });
		return (await status.textContent())?.trim();
	});
	const rows = execSync(
		`bunx wrangler d1 execute taru --local --persist-to "${stateDir}" --json --command "select email, created_at from waitlist where email = '${email.toLowerCase().replace(/'/g, "''")}'"`,
		{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
	);
	const stored = JSON.parse(rows)[0]?.results ?? [];
	writeFileSync(join(out, "waitlist.json"), JSON.stringify({ email, message, stored }, null, 2));
	log(`form said: ${message}`);
	log(`D1 rows for ${email}: ${stored.length}`);
	if (stored.length !== 1) fail("expected exactly one stored row");
}

async function repos() {
	const inst = instance();
	const res = await fetch(`${inst.url}/api/repos`);
	log(JSON.stringify(await res.json(), null, 2));
}

function git(cwd, ...gitArgs) {
	return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", ...gitArgs], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Verify", GIT_AUTHOR_EMAIL: "verify@taru.invalid", GIT_COMMITTER_NAME: "Verify", GIT_COMMITTER_EMAIL: "verify@taru.invalid" },
	}).trim();
}

function filesHash(folder) {
	const hash = createHash("sha256");
	const walk = (d) => {
		for (const name of readdirSync(d).toSorted()) {
			if (name === ".git") continue;
			const p = join(d, name);
			if (statSync(p).isDirectory()) walk(p);
			else hash.update(relative(folder, p).replaceAll("\\", "/")).update(readFileSync(p));
		}
	};
	walk(folder);
	return hash.digest("hex");
}

async function gitRoundtrip() {
	const inst = instance();
	const out = evidenceDir();
	const transcript = [];
	const step = (title, value) => {
		transcript.push(`## ${title}\n${value}`);
		log(`${title}: ${value.split("\n")[0]}`);
	};
	const token = adminToken();
	const name = `roundtrip-${Date.now()}`;
	const created = await fetch(`${inst.url}/api/repos`, {
		method: "POST",
		headers: { authorization: `Basic ${btoa(`verify:${token}`)}`, "content-type": "application/json" },
		body: JSON.stringify({ owner: "verify", name }),
	});
	step("create repo", `${created.status} ${await created.text()}`);
	if (created.status !== 201) fail("could not create repo");

	const work = mkdtempSync(join(tmpdir(), "taru-verify-"));
	const src = join(work, "src");
	mkdirSync(join(src, "lib", "deep"), { recursive: true });
	git(work, "init", "-q", src);
	writeFileSync(join(src, "README.md"), "# roundtrip\n");
	writeFileSync(join(src, "lib", "deep", "util.ts"), "export const answer = 42;\n");
	writeFileSync(join(src, "empty.txt"), "");
	writeFileSync(join(src, "bytes.bin"), Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7) & 0xff)));
	git(src, "add", "-A");
	git(src, "commit", "-qm", "first");
	writeFileSync(join(src, "big.dat"), Buffer.alloc(1_200_000, 7));
	git(src, "add", "-A");
	git(src, "commit", "-qm", "second: a file over 1 MB");

	const remote = `${inst.url.replace("://", `://verify:${token}@`)}/verify/${name}.git`;
	const publicUrl = `${inst.url}/verify/${name}.git`;
	try {
		step("push", git(src, "push", remote, "main") || "(no output)");
	} catch (e) {
		step("push FAILED", String(e.stderr || e.message));
		writeFileSync(join(out, "git-roundtrip.md"), transcript.join("\n\n"));
		fail(`push failed; transcript in ${relative(root, join(out, "git-roundtrip.md"))}`);
	}
	step("ls-remote", git(work, "ls-remote", publicUrl));
	const clone = join(work, "clone");
	git(work, "clone", "-q", publicUrl, clone);
	const same = git(src, "rev-parse", "HEAD") === git(clone, "rev-parse", "HEAD") && filesHash(src) === filesHash(clone);
	step("clone matches source (HEAD and every file's bytes)", String(same));
	step("fsck clone", git(clone, "fsck", "--full") || "clean");

	writeFileSync(join(src, "lib", "deep", "util.ts"), "export const answer = 43;\n");
	git(src, "commit", "-qam", "third: incremental change");
	step("incremental push", git(src, "push", remote, "main") || "(no output)");
	git(clone, "pull", "-q", "--ff-only");
	const sameAfter = git(src, "rev-parse", "HEAD") === git(clone, "rev-parse", "HEAD") && filesHash(src) === filesHash(clone);
	step("pull after incremental push matches", String(sameAfter));

	writeFileSync(join(out, "git-roundtrip.md"), transcript.join("\n\n").replaceAll(token, "<admin-token>"));
	rmSync(work, { recursive: true, force: true });
	if (!same || !sameAfter) fail("clone did not match the source");
	log(`PASS; transcript in ${relative(root, join(out, "git-roundtrip.md"))}`);
}

/** A transcript writer: each step is logged and kept for the evidence file, with the token redacted at the end. */
function transcriptFor(file, token) {
	const steps = [];
	return {
		step(title, value) {
			const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
			steps.push(`## ${title}\n${text}`);
			log(`${title}: ${text.split("\n")[0]}`);
		},
		save() {
			writeFileSync(file, steps.join("\n\n").replaceAll(token, "<admin-token>"));
		},
	};
}

/** JSON request to the REST API; returns {status, body}. */
async function restCall(inst, token, method, path, body) {
	const headers = token ? { authorization: `Basic ${btoa(`verify:${token}`)}` } : {};
	const init = body ? { method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) } : { method, headers };
	const res = await fetch(`${inst.url}${path}`, init);
	return { status: res.status, body: await res.json() };
}

/** A real-shaped repo pushed with git, plus a clone of it. Returns the paths and URLs. */
function pushSeedRepo(inst, token, name, t) {
	const work = mkdtempSync(join(tmpdir(), "taru-verify-"));
	const src = join(work, "src");
	git(work, "init", "-q", src);
	writeFileSync(join(src, "README.md"), "# agent demo\n\nline two\n");
	mkdirSync(join(src, "src", "lib", "deep"), { recursive: true });
	writeFileSync(join(src, "src", "app.ts"), "export const app = () => 'hi';\n");
	writeFileSync(join(src, "src", "lib", "deep", "util.ts"), "export const answer = 42;\n");
	writeFileSync(join(src, "to-delete.txt"), "going away\n");
	writeFileSync(join(src, "logo.bin"), Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 13) & 0xff)));
	mkdirSync(join(src, "tools"));
	writeFileSync(join(src, "tools", "run.sh"), "#!/bin/sh\necho run\n", { mode: 0o755 });
	git(src, "add", "-A");
	git(src, "commit", "-qm", "first");
	writeFileSync(join(src, "src", "app.ts"), "export const app = () => 'hello';\n");
	git(src, "commit", "-qam", "second");
	const remote = `${inst.url.replace("://", `://verify:${token}@`)}/verify/${name}.git`;
	const publicUrl = `${inst.url}/verify/${name}.git`;
	t.step("git push (seed, two commits)", git(src, "push", remote, "main") || "(no output)");
	const clone = join(work, "clone");
	git(work, "clone", "-q", publicUrl, clone);
	t.step("git clone HEAD", git(clone, "rev-parse", "HEAD"));
	return { work, src, clone, remote, publicUrl };
}

/** Every path the API says changed must have exactly those bytes (or be gone) in the clone after a pull. */
function expectChangesOnDisk(clone, changes, t) {
	const problems = [];
	for (const change of changes) {
		const file = join(clone, change.path);
		if (change.delete) {
			if (existsSync(file)) problems.push(`${change.path} still exists`);
			continue;
		}
		const expected = change.content_base64 ? Buffer.from(change.content_base64, "base64") : Buffer.from(change.content, "utf8");
		if (!existsSync(file)) problems.push(`${change.path} missing`);
		else if (!readFileSync(file).equals(expected)) problems.push(`${change.path} bytes differ`);
		else if (change.mode === "100755" && process.platform !== "win32" && !(statSync(file).mode & 0o100)) problems.push(`${change.path} not executable`);
	}
	t.step("every changed path matches on disk after git pull", problems.length ? problems.join("\n") : "all match");
	return problems.length === 0;
}

async function agentApi() {
	const inst = instance();
	const out = evidenceDir();
	const token = adminToken();
	const t = transcriptFor(join(out, "agent-api.md"), token);
	const name = `agent-${Date.now()}`;
	const base = `/api/repos/verify/${name}`;
	const created = await restCall(inst, token, "POST", "/api/repos", { owner: "verify", name });
	t.step("create repo", `${created.status} ${JSON.stringify(created.body)}`);
	if (created.status !== 201) fail("could not create repo");
	const { work, src, clone, remote, publicUrl } = pushSeedRepo(inst, token, name, t);
	const failures = [];
	const check = (ok, what) => {
		if (!ok) failures.push(what);
	};

	// Reads, public.
	const tree = await restCall(inst, null, "GET", `${base}/tree?path=src/lib`);
	t.step("GET tree?path=src/lib", tree);
	check(tree.status === 200 && tree.body.entries?.[0]?.path === "src/lib/deep", "tree read");
	const file = await restCall(inst, null, "GET", `${base}/file?ref=main&path=src/lib/deep/util.ts`);
	t.step("GET file src/lib/deep/util.ts", file);
	check(file.body.content === "export const answer = 42;\n" && file.body.commit === git(src, "rev-parse", "HEAD"), "file read");

	// Commit through the API: edit nested, add binary, delete, new folder.
	const changes = [
		{ path: "src/lib/deep/util.ts", content: "export const answer = 43; // edited through the API\n" },
		{ path: "assets/photo.bin", content_base64: Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 7 + 3) & 0xff)).toString("base64") },
		{ path: "to-delete.txt", delete: true },
		{ path: "features/new/index.ts", content: "export const fresh = true;\n" },
		{ path: "tools/build.sh", content: "#!/bin/sh\nbun run build\n", mode: "100755" },
	];
	const noAuth = await restCall(inst, null, "POST", `${base}/commits`, { branch: "main", expected_head: file.body.commit, message: "x", changes });
	t.step("POST commits without token", `${noAuth.status} ${JSON.stringify(noAuth.body)}`);
	check(noAuth.status === 401, "write needs auth");
	const commit = await restCall(inst, token, "POST", `${base}/commits`, { branch: "main", expected_head: file.body.commit, message: "Edit through the agent API\n\nNo clone involved.", author: { name: "Agent", email: "agent@taru.invalid" }, changes });
	t.step("POST commits (edit nested, add binary, delete, new folder, executable)", `${commit.status} ${JSON.stringify(commit.body)}`);
	check(commit.status === 201, "commit created");
	writeFileSync(join(out, "agent-api-commit.json"), JSON.stringify({ request: changes.map((c) => ({ ...c, content_base64: c.content_base64 ? `<${c.content_base64.length} chars>` : undefined })), response: commit.body }, null, 2));

	git(clone, "pull", "-q", "--ff-only");
	const pulledHead = git(clone, "rev-parse", "HEAD");
	t.step("git pull in the existing clone: HEAD", pulledHead);
	check(pulledHead === commit.body.commit, "pulled HEAD is the API commit");
	t.step("git log -1", git(clone, "log", "-1", "--format=%H %an <%ae>%n%B"));
	check(expectChangesOnDisk(clone, changes, t), "files on disk");
	check(git(clone, "ls-tree", "HEAD", "tools/build.sh").startsWith("100755"), "mode 100755 in git");
	t.step("git fsck --full", git(clone, "fsck", "--full") || "clean");

	// CAS: a stale expected_head is refused with the current head.
	const stale = await restCall(inst, token, "POST", `${base}/commits`, { branch: "main", expected_head: file.body.commit, message: "stale", changes: [{ path: "x", content: "x" }] });
	t.step("POST commits with stale expected_head", `${stale.status} ${JSON.stringify(stale.body)}`);
	check(stale.status === 409 && stale.body.error === "head_mismatch" && stale.body.head === commit.body.commit, "CAS 409");

	// Branch via the API, diverge main, clean three-way merge.
	const feature = await restCall(inst, token, "POST", `${base}/commits`, { branch: "feature", expected_head: null, start_rev: "main", message: "feature: edit app.ts", changes: [{ path: "src/app.ts", content: "export const app = () => 'hello from feature';\n" }] });
	t.step("POST commits: create branch feature from main", `${feature.status} ${JSON.stringify(feature.body)}`);
	check(feature.status === 201 && feature.body.parent === commit.body.commit, "branch created");
	const mainMore = await restCall(inst, token, "POST", `${base}/commits`, { branch: "main", expected_head: commit.body.commit, message: "main: edit README", changes: [{ path: "README.md", content: "# agent demo\n\nline two, edited on main\n" }] });
	check(mainMore.status === 201, "main moved");
	const merged = await restCall(inst, token, "POST", `${base}/merges`, { into: "main", from: "feature", message: "Merge feature into main" });
	t.step("POST merges feature -> main", `${merged.status} ${JSON.stringify(merged.body)}`);
	check(merged.status === 200 && merged.body.result === "merged", "clean merge");
	git(clone, "pull", "-q", "--ff-only");
	const parents = git(clone, "log", "-1", "--format=%P");
	t.step("git pull: merge commit parents", parents);
	check(git(clone, "rev-parse", "HEAD") === merged.body.commit && parents === `${mainMore.body.commit} ${feature.body.commit}`, "merge commit pulled with two parents");
	check(readFileSync(join(clone, "src", "app.ts"), "utf8") === "export const app = () => 'hello from feature';\n" && readFileSync(join(clone, "README.md"), "utf8").includes("edited on main"), "merged content");

	// Conflicting merge: 409 with the report, nothing written.
	const clash = await restCall(inst, token, "POST", `${base}/commits`, { branch: "clash", expected_head: null, start_rev: "main", message: "clash", changes: [{ path: "README.md", content: "# agent demo\n\nline two, clash version\n" }] });
	const mainAgain = await restCall(inst, token, "POST", `${base}/commits`, { branch: "main", expected_head: merged.body.commit, message: "main again", changes: [{ path: "README.md", content: "# agent demo\n\nline two, main version\n" }] });
	check(clash.status === 201 && mainAgain.status === 201, "clash setup");
	const conflict = await restCall(inst, token, "POST", `${base}/merges`, { into: "main", from: "clash" });
	t.step("POST merges clash -> main (conflict)", `${conflict.status} ${JSON.stringify(conflict.body, null, 2)}`);
	check(conflict.status === 409 && conflict.body.error === "merge_conflict" && conflict.body.conflicts?.[0]?.path === "README.md" && conflict.body.conflicts[0].kind === "content" && conflict.body.conflicts[0].conflict_text.includes("<<<<<<<"), "conflict report");
	const lsRemote = git(work, "ls-remote", publicUrl, "refs/heads/main");
	t.step("ls-remote main after the conflict", lsRemote);
	check(lsRemote.startsWith(mainAgain.body.commit), "main unchanged after conflict");

	// Both paths interleave: git push on top of API commits, then an API commit on top of the push.
	git(clone, "pull", "-q", "--ff-only");
	writeFileSync(join(clone, "src", "lib", "deep", "util.ts"), "export const answer = 44; // pushed with git\n");
	git(clone, "commit", "-qam", "pushed with git on top of API commits");
	t.step("git push on top of API commits", git(clone, "push", remote, "main") || "(no output)");
	const pushed = git(clone, "rev-parse", "HEAD");
	const afterPush = await restCall(inst, null, "GET", `${base}/file?path=src/lib/deep/util.ts`);
	check(afterPush.body.commit === pushed && afterPush.body.content.includes("44"), "API sees the pushed commit");
	const onTop = await restCall(inst, token, "POST", `${base}/commits`, { branch: "main", expected_head: pushed, message: "API on top of the push", changes: [{ path: "src/lib/deep/util.ts", content: "export const answer = 45;\n" }] });
	t.step("POST commits on top of the git push", `${onTop.status} ${JSON.stringify(onTop.body)}`);
	git(clone, "pull", "-q", "--ff-only");
	check(onTop.status === 201 && git(clone, "rev-parse", "HEAD") === onTop.body.commit && readFileSync(join(clone, "src", "lib", "deep", "util.ts"), "utf8") === "export const answer = 45;\n", "pull after API commit on top of push");
	t.step("git log --oneline --graph", git(clone, "log", "--oneline", "--graph"));
	t.step("git fsck --full (final)", git(clone, "fsck", "--full") || "clean");

	t.save();
	rmSync(work, { recursive: true, force: true });
	if (failures.length) fail(`${failures.join("; ")}; transcript in ${relative(root, join(out, "agent-api.md"))}`);
	log(`PASS; transcript in ${relative(root, join(out, "agent-api.md"))}`);
}

async function mcp() {
	const inst = instance();
	const out = evidenceDir();
	const token = adminToken();
	const t = transcriptFor(join(out, "mcp.md"), token);
	const name = `mcp-${Date.now()}`;
	const created = await restCall(inst, token, "POST", "/api/repos", { owner: "verify", name });
	if (created.status !== 201) fail("could not create repo");
	const { work, clone } = pushSeedRepo(inst, token, name, t);
	const failures = [];
	const check = (ok, what) => {
		if (!ok) failures.push(what);
	};
	const headers = { authorization: `Basic ${btoa(`verify:${token}`)}` };

	// Plain HTTP first: the protocol as any client speaks it.
	const raw = async (id, method, params) => {
		const res = await fetch(`${inst.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
		return { status: res.status, body: await res.json() };
	};
	const init = await raw(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "0" } });
	t.step("POST /mcp initialize", init);
	check(init.status === 200 && init.body.result?.serverInfo?.name === "taru", "initialize");
	const list = await raw(2, "tools/list", {});
	t.step("POST /mcp tools/list", list.body.result?.tools?.map((tool) => tool.name));
	check(list.body.result?.tools?.length === 5, "tools/list");

	// Then the official client over its Streamable HTTP transport.
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
	const client = new Client({ name: "taru-verify", version: "0" });
	await client.connect(new StreamableHTTPClientTransport(new URL(`${inst.url}/mcp`), { requestInit: { headers } }));
	t.step("SDK client connected", `server ${JSON.stringify(client.getServerVersion())}, protocol ${client.transport?.protocolVersion ?? "?"}`);
	const tools = await client.listTools();
	check(tools.tools.map((tool) => tool.name).includes("commit_changes"), "SDK tools/list");

	const read = await client.callTool({ name: "read_file", arguments: { repo: `verify/${name}`, path: "src/lib/deep/util.ts" } });
	t.step("SDK tools/call read_file", read.structuredContent);
	check(!read.isError && read.structuredContent.content === "export const answer = 42;\n", "read_file");
	const changes = [
		{ path: "src/lib/deep/util.ts", content: "export const answer = 43; // via MCP\n" },
		{ path: "mcp/hello.txt", content: "written through the MCP server\n" },
		{ path: "to-delete.txt", delete: true },
	];
	const commit = await client.callTool({ name: "commit_changes", arguments: { repo: `verify/${name}`, branch: "main", expected_head: read.structuredContent.commit, message: "Edit through MCP", changes } });
	t.step("SDK tools/call commit_changes", commit.structuredContent);
	check(!commit.isError && commit.structuredContent.parent === read.structuredContent.commit, "commit_changes");
	await client.close();

	git(clone, "pull", "-q", "--ff-only");
	const head = git(clone, "rev-parse", "HEAD");
	t.step("git pull: HEAD", head);
	check(head === commit.structuredContent?.commit, "pulled HEAD is the MCP commit");
	check(expectChangesOnDisk(clone, changes, t), "files on disk");
	t.step("git fsck --full", git(clone, "fsck", "--full") || "clean");

	t.save();
	rmSync(work, { recursive: true, force: true });
	if (failures.length) fail(`${failures.join("; ")}; transcript in ${relative(root, join(out, "mcp.md"))}`);
	log(`PASS; transcript in ${relative(root, join(out, "mcp.md"))}`);
}

switch (command) {
	case "launch":
		await launch();
		break;
	case "doctor":
		await doctor();
		break;
	case "stop":
		stop();
		break;
	case "shot":
		await shot(args[0], args.slice(1));
		break;
	case "waitlist":
		await waitlist(args[0]);
		break;
	case "repos":
		await repos();
		break;
	case "git-roundtrip":
		await gitRoundtrip();
		break;
	case "agent-api":
		await agentApi();
		break;
	case "mcp":
		await mcp();
		break;
	default:
		fail("commands: launch | doctor | stop | shot <name> [--phone] [--dark] | waitlist <email> | repos | git-roundtrip | agent-api | mcp");
}
