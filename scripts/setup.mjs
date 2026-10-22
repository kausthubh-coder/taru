// Makes any checkout or worktree of this repo work, isolated, in one command. Safe to rerun; fast when
// nothing is missing. Uses only Node built-ins: it runs before dependencies are installed.
// Usage: bun run setup   (or: node scripts/setup.mjs)
//
// Isolation per checkout:
//   - port: derived from a hash of the checkout path, skipping ports other worktrees claimed, written to .env.local
//   - backend: Wrangler keeps local Durable Objects, R2 and D1 under ./.wrangler/state, which is per checkout.
//     Nothing in dev talks to Cloudflare production.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const quiet = process.env.TARU_SETUP_QUIET === "1";
const log = (msg) => console.warn(msg);
const run = (cmd) => execSync(cmd, { cwd: root, stdio: quiet ? ["ignore", 2, 2] : "inherit" });
const sh = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// 1. Dependencies: install when missing or older than the lockfile.
const nodeModules = join(root, "node_modules");
const lock = join(root, "bun.lock");
if (!existsSync(nodeModules) || statSync(lock).mtimeMs > statSync(nodeModules).mtimeMs) {
	try {
		sh("bun --version");
	} catch {
		// Fresh cloud VMs have no bun. Install it the official way and put it on PATH for this process.
		if (process.platform === "win32") throw new Error("bun is not installed: https://bun.sh");
		execSync("curl -fsSL https://bun.sh/install | bash", { stdio: ["ignore", 2, 2], shell: "/bin/bash" });
		process.env.PATH = `${process.env.HOME}/.bun/bin:${process.env.PATH}`;
	}
	run("bun install");
	// Touch node_modules so the next run sees it as newer than the lockfile.
	const now = new Date();
	utimesSync(nodeModules, now, now);
}

// 2. Skills link: Claude Code reads .claude/skills, Codex reads .agents/skills. Git can't store the link.
const claudeSkills = join(root, ".claude", "skills");
if (!existsSync(claudeSkills)) {
	mkdirSync(join(root, ".claude"), { recursive: true });
	symlinkSync(join(root, ".agents", "skills"), claudeSkills, process.platform === "win32" ? "junction" : "dir");
	log("linked .claude/skills -> .agents/skills");
}

// 3. Local secrets (.dev.vars): copy from the main checkout, else start from the example. Never production values.
const devVars = join(root, ".dev.vars");
if (!existsSync(devVars)) {
	let source = join(root, ".dev.vars.example");
	try {
		const mainCheckout = dirname(resolve(root, sh("git rev-parse --git-common-dir")));
		const fromMain = join(mainCheckout, ".dev.vars");
		if (fromMain !== devVars && existsSync(fromMain)) source = fromMain;
	} catch {
		// Not a git checkout (e.g. a tarball): the example is fine.
	}
	if (/CLOUDFLARE_API_TOKEN|prod/i.test(readFileSync(source, "utf8"))) {
		console.error(`refusing to copy ${source}: it mentions production credentials. Fix it or copy .dev.vars.example.`);
		process.exit(1);
	}
	copyFileSync(source, devVars);
	log(`wrote .dev.vars from ${source === devVars ? "example" : source}`);
}

// 4. Port: stable per checkout path, skipping ports other worktrees claimed (running or not) and busy ports.
function claimedByOtherWorktrees() {
	const claimed = new Set();
	try {
		for (const line of sh("git worktree list --porcelain").split("\n")) {
			if (!line.startsWith("worktree ")) continue;
			const dir = resolve(line.slice("worktree ".length));
			if (dir === root) continue;
			const env = join(dir, ".env.local");
			const port = existsSync(env) && /^PORT=(\d+)/m.exec(readFileSync(env, "utf8"))?.[1];
			if (port) claimed.add(Number(port));
		}
	} catch {
		// No git: nothing to skip.
	}
	return claimed;
}

function listenable(port, host) {
	return new Promise((done) => {
		const server = createServer().once("error", (err) => done(err.code === "EADDRNOTAVAIL"));
		server.listen(port, host, () => server.close(() => done(true)));
	});
}
const isFree = async (port) => (await listenable(port, "127.0.0.1")) && (await listenable(port, "::1"));

const envLocal = join(root, ".env.local");
const envText = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
const current = Number(/^PORT=(\d+)/m.exec(envText)?.[1]) || 0;
const claimed = claimedByOtherWorktrees();
let port = current;
if (!port || claimed.has(port)) {
	let hash = 0;
	for (const ch of root.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	port = 5200 + (hash % 700);
	// Probe one port at a time on purpose: we want the first free one, not all of them.
	// oxlint-disable-next-line no-await-in-loop
	while (claimed.has(port) || !(await isFree(port))) port++;
	writeFileSync(envLocal, envText.replace(/^PORT=.*\n?/m, "") + `PORT=${port}\n`);
	log(`claimed dev port ${port}`);
}

// 5. Local database schema. Wrangler takes seconds to start, so skip it when the migrations haven't changed.
const migrationsDir = join(root, "migrations");
const migrationsStamp = join(root, ".wrangler", "migrations-applied.txt");
const migrationsNow = (existsSync(migrationsDir) ? readdirSync(migrationsDir) : [])
	.filter((f) => f.endsWith(".sql"))
	.toSorted()
	.map((f) => `${f} ${statSync(join(migrationsDir, f)).size}`)
	.join("\n");
if (!existsSync(migrationsStamp) || readFileSync(migrationsStamp, "utf8") !== migrationsNow) {
	run("bunx wrangler d1 migrations apply taru --local");
	mkdirSync(dirname(migrationsStamp), { recursive: true });
	writeFileSync(migrationsStamp, migrationsNow);
}

// 6. Doctor, then one summary line.
try {
	execSync("node scripts/doctor.mjs", { cwd: root, stdio: quiet ? ["ignore", 2, 2] : "inherit" });
	log(`setup done: ${root} on port ${port}, local backend in .wrangler/state`);
} catch {
	log(`setup finished with doctor failures above (${root})`);
	process.exit(1);
}
