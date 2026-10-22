#!/usr/bin/env node
// Drives a real, isolated Taru instance and saves evidence. Run from the repo root:
//   node .agents/skills/verify-taru/verify.mjs <command> [args]
// Commands: launch | doctor | stop | shot <name> [--phone] [--dark] | waitlist <email> | repos | git-roundtrip
//           import <git-url> | mirror
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

async function callApi(inst, path, init = {}) {
	const token = adminToken();
	const res = await fetch(`${inst.url}${path}`, {
		...init,
		headers: { authorization: `Basic ${btoa(`verify:${token}`)}`, "content-type": "application/json", ...init.headers },
	});
	return { status: res.status, body: await res.json().catch(() => null) };
}

/** "<oid> <ref>" lines for branches and tags, sorted by ref, from `git ls-remote` output. */
function refLines(lsRemote) {
	return lsRemote
		.split("\n")
		.filter((line) => /\trefs\/(heads|tags)\//.test(line) && !line.endsWith("^{}"))
		.map((line) => line.split("\t").toReversed().join(" "))
		.toSorted();
}

function refLinesFromApi(refs) {
	return Object.entries(refs)
		.filter(([name]) => name.startsWith("refs/heads/") || name.startsWith("refs/tags/"))
		.map(([name, oid]) => `${name} ${oid}`)
		.toSorted();
}

async function importFromGithub(url) {
	if (!url) fail("usage: import <https://github.com/owner/repo.git>");
	const inst = instance();
	const out = evidenceDir();
	const transcript = [];
	const step = (title, value) => {
		transcript.push(`## ${title}\n${value}`);
		log(`${title}: ${value.split("\n")[0]}`);
	};
	const name = `import-${Date.now()}`;
	const created = await callApi(inst, "/api/repos", { method: "POST", body: JSON.stringify({ owner: "verify", name }) });
	step("create repo", `${created.status} ${JSON.stringify(created.body)}`);
	if (created.status !== 201) fail("could not create repo");

	const started = Date.now();
	const imported = await callApi(inst, `/api/repos/verify/${name}/import`, { method: "POST", body: JSON.stringify({ url }) });
	step(`import ${url}`, `${imported.status} in ${((Date.now() - started) / 1000).toFixed(1)}s: ${imported.body?.objects} objects, ${Object.keys(imported.body?.refs ?? {}).length} refs, head ${imported.body?.head}`);
	if (imported.status !== 200) fail(`import failed: ${JSON.stringify(imported.body)}`);

	const taruUrl = `${inst.url}/verify/${name}.git`;
	const work = mkdtempSync(join(tmpdir(), "taru-verify-import-"));
	const githubRefs = refLines(git(work, "ls-remote", url));
	const taruRefs = refLines(git(work, "ls-remote", taruUrl));
	const sameRefs = githubRefs.join("\n") === taruRefs.join("\n");
	step(`refs match (${githubRefs.length} branches and tags on GitHub, ${taruRefs.length} on Taru)`, String(sameRefs));
	if (!sameRefs) {
		step("refs on GitHub", githubRefs.join("\n"));
		step("refs on Taru", taruRefs.join("\n"));
	}
	const headOf = (remote) => /^ref: (\S+)\tHEAD/m.exec(git(work, "ls-remote", "--symref", remote, "HEAD"))?.[1];
	const sameHead = headOf(url) === headOf(taruUrl);
	step(`HEAD matches (${headOf(url)})`, String(sameHead));

	const fromGithub = join(work, "github");
	const fromTaru = join(work, "taru");
	git(work, "clone", "-q", url, fromGithub);
	git(work, "clone", "-q", taruUrl, fromTaru);
	const sameHistory = git(fromGithub, "rev-parse", "HEAD") === git(fromTaru, "rev-parse", "HEAD") && git(fromGithub, "rev-list", "--count", "HEAD") === git(fromTaru, "rev-list", "--count", "HEAD");
	step(`history matches (${git(fromTaru, "rev-list", "--count", "HEAD")} commits on the default branch)`, String(sameHistory));
	const sameFiles = filesHash(fromGithub) === filesHash(fromTaru);
	step("every file's bytes match", String(sameFiles));
	const mirrorClone = join(work, "taru-mirror");
	git(work, "clone", "-q", "--mirror", taruUrl, mirrorClone);
	const fsck = git(mirrorClone, "fsck", "--full", "--no-dangling") || "clean";
	step("fsck of a --mirror clone from Taru (every object)", fsck);

	writeFileSync(join(out, "import.md"), transcript.join("\n\n"));
	rmSync(work, { recursive: true, force: true });
	if (!sameRefs || !sameHead || !sameHistory || !sameFiles || fsck !== "clean") fail(`import did not match; transcript in ${relative(root, join(out, "import.md"))}`);
	log(`PASS; transcript in ${relative(root, join(out, "import.md"))}`);
}

/** Starts scripts/fake-github.mjs in its own process group; returns its port and a stop() that kills by PID. */
async function startFakeGithub(githubRoot) {
	const child = spawn(process.execPath, [join(root, "scripts", "fake-github.mjs"), githubRoot], { stdio: ["ignore", "pipe", "inherit"], detached: true });
	const port = await new Promise((done, reject) => {
		child.stdout.on("data", (chunk) => {
			const m = /listening (\d+)/.exec(String(chunk));
			if (m) done(m[1]);
		});
		child.on("exit", (code) => reject(new Error(`fake github exited with ${code}`)));
	});
	return { port, pid: child.pid, stop: () => killTree(child.pid) };
}

async function mirror() {
	const inst = instance();
	const out = evidenceDir();
	const transcript = [];
	const step = (title, value) => {
		transcript.push(`## ${title}\n${value}`);
		log(`${title}: ${value.split("\n")[0]}`);
	};
	const work = mkdtempSync(join(tmpdir(), "taru-verify-mirror-"));
	const githubRoot = join(work, "github");
	const bare = join(githubRoot, "verify", "copy.git");
	mkdirSync(join(githubRoot, "verify"), { recursive: true });
	git(work, "init", "-q", "--bare", "-b", "main", bare);
	const github = await startFakeGithub(githubRoot);
	step("fake GitHub", `pid ${github.pid} on port ${github.port}, bare repo ${bare}`);

	try {
		const name = `mirror-${Date.now()}`;
		const created = await callApi(inst, "/api/repos", { method: "POST", body: JSON.stringify({ owner: "verify", name }) });
		step("create repo", `${created.status}`);
		if (created.status !== 201) fail("could not create repo");
		const mirrorUrl = `http://127.0.0.1:${github.port}/verify/copy.git`;
		const set = await callApi(inst, `/api/repos/verify/${name}/mirror`, { method: "PUT", body: JSON.stringify({ url: mirrorUrl }) });
		step("set mirror url", `${set.status} ${JSON.stringify(set.body)}`);
		if (set.status !== 200) fail("could not set the mirror");

		const token = adminToken();
		const remote = `${inst.url.replace("://", `://verify:${token}@`)}/verify/${name}.git`;
		const src = join(work, "src");
		mkdirSync(join(src, "lib", "deep"), { recursive: true });
		git(work, "init", "-q", src);
		writeFileSync(join(src, "README.md"), "# mirror\n");
		writeFileSync(join(src, "lib", "deep", "util.ts"), "export const answer = 42;\n");
		writeFileSync(join(src, "bytes.bin"), Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7) & 0xff)));
		git(src, "add", "-A");
		git(src, "commit", "-qm", "first");
		writeFileSync(join(src, "big.dat"), Buffer.alloc(1_200_000, 7));
		git(src, "add", "-A");
		git(src, "commit", "-qm", "second: a file over 1 MB");
		git(src, "tag", "-a", "v1", "-m", "release 1");

		// The copy is pushed from an alarm about a second after the ref change; wait for the status to say so
		// and for the bare repo to really hold the same branches and tags.
		async function waitForCopy(label) {
			const deadline = Date.now() + 30_000;
			// Polling is the point: the copy lands when the alarm fires.
			/* oxlint-disable no-await-in-loop */
			for (;;) {
				const shown = await callApi(inst, `/api/repos/verify/${name}`);
				const status = shown.body?.mirror?.status;
				const taruRefs = refLinesFromApi(shown.body?.refs ?? {});
				const copyRefs = refLines(git(work, "ls-remote", bare));
				if (status?.state === "ok" && taruRefs.join("\n") === copyRefs.join("\n")) {
					step(`${label}: copy matches Taru (${copyRefs.length} refs)`, `${JSON.stringify(status)}\n${copyRefs.join("\n")}`);
					return;
				}
				if (Date.now() > deadline) {
					step(`${label}: copy did not catch up`, `status ${JSON.stringify(status)}\nTaru: ${taruRefs.join(", ")}\ncopy: ${copyRefs.join(", ")}`);
					throw new Error(`${label}: the copy did not match within 30s`);
				}
				await new Promise((r) => setTimeout(r, 500));
			}
			/* oxlint-enable no-await-in-loop */
		}

		step("push to Taru", git(src, "push", "-q", remote, "main", "v1") || "(no output)");
		await waitForCopy("initial push");
		const clone = join(work, "clone-of-copy");
		git(work, "clone", "-q", bare, clone);
		step("clone of the copy matches the source (HEAD and every file's bytes)", String(git(src, "rev-parse", "HEAD") === git(clone, "rev-parse", "HEAD") && filesHash(src) === filesHash(clone)));
		step("fsck of the copy", git(bare, "fsck", "--full") || "clean");

		writeFileSync(join(src, "lib", "deep", "util.ts"), "export const answer = 43;\n");
		git(src, "commit", "-qam", "third: incremental change");
		git(src, "checkout", "-qb", "feature");
		writeFileSync(join(src, "feature.txt"), "feature\n");
		git(src, "add", "-A");
		git(src, "commit", "-qm", "feature work");
		git(src, "checkout", "-q", "main");
		step("incremental push (main and a new branch)", git(src, "push", "-q", remote, "main", "feature") || "(no output)");
		await waitForCopy("incremental push");
		step("copy's feature branch is the source's", String(git(bare, "rev-parse", "refs/heads/feature") === git(src, "rev-parse", "feature")));

		step("delete the branch on Taru", git(src, "push", "-q", remote, "--delete", "feature") || "(no output)");
		await waitForCopy("branch delete");
		step("copy has no feature branch", String(!git(work, "ls-remote", bare).includes("refs/heads/feature")));
		step("fsck of the copy after everything", git(bare, "fsck", "--full", "--no-dangling") || "clean");
		writeFileSync(join(out, "mirror.md"), transcript.join("\n\n").replaceAll(token, "<admin-token>"));
		if (transcript.some((entry) => entry.endsWith("\nfalse"))) fail(`a check was false; transcript in ${relative(root, join(out, "mirror.md"))}`);
		log(`PASS; transcript in ${relative(root, join(out, "mirror.md"))}`);
	} catch (error) {
		writeFileSync(join(out, "mirror.md"), transcript.join("\n\n").replaceAll(adminToken(), "<admin-token>"));
		fail(`${error.message}; transcript in ${relative(root, join(out, "mirror.md"))}`);
	} finally {
		github.stop();
		log(`stopped fake GitHub pid ${github.pid}`);
		rmSync(work, { recursive: true, force: true });
	}
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
	case "import":
		await importFromGithub(args[0]);
		break;
	case "mirror":
		await mirror();
		break;
	default:
		fail("commands: launch | doctor | stop | shot <name> [--phone] [--dark] | waitlist <email> | repos | git-roundtrip | import <git-url> | mirror");
}
