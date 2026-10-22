// Is this checkout healthy? Read-only. Prints the fix for each failure and exits 1 if anything is wrong.
// Usage: bun run doctor   (or: node scripts/doctor.mjs)
import { execSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const problems = [];
const ok = (msg) => console.warn(`ok    ${msg}`);
const note = (msg) => console.warn(`note  ${msg}`);
const bad = (msg, fix) => {
	problems.push(msg);
	console.warn(`FAIL  ${msg}\n      fix: ${fix}`);
};
const sh = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

if (!existsSync(join(root, "node_modules"))) bad("dependencies not installed", "bun run setup");
else if (statSync(join(root, "bun.lock")).mtimeMs > statSync(join(root, "node_modules")).mtimeMs)
	bad("bun.lock is newer than node_modules", "bun install");
else ok("dependencies installed");

const devVars = join(root, ".dev.vars");
if (existsSync(devVars) && /^TARU_ADMIN_TOKEN=.+/m.test(readFileSync(devVars, "utf8"))) ok(".dev.vars has TARU_ADMIN_TOKEN");
else bad(".dev.vars missing or has no TARU_ADMIN_TOKEN", "bun run setup");

const skillsLink = join(root, ".claude", "skills");
if (existsSync(skillsLink) && lstatSync(skillsLink).isSymbolicLink()) ok(".claude/skills links to .agents/skills");
else bad(".claude/skills link missing", "bun run setup");

// File times are meaningless in a fresh checkout, so ask Wrangler. Types include .dev.vars secret names too.
try {
	sh("bunx wrangler types --check");
	ok("worker types match wrangler.jsonc and .dev.vars");
} catch {
	bad("worker-configuration.d.ts is out of date with wrangler.jsonc or .dev.vars", "bun run cf-typegen");
}

try {
	ok(`git ${sh("git --version").replace("git version ", "")} (git-core end-to-end tests need it)`);
} catch {
	bad("git is not on PATH; git-core end-to-end tests need it", "install git");
}

// Port: claimed in .env.local and not claimed by another worktree.
const envLocal = join(root, ".env.local");
const port = Number(existsSync(envLocal) && /^PORT=(\d+)/m.exec(readFileSync(envLocal, "utf8"))?.[1]) || 0;
if (!port) bad("no dev port claimed in .env.local", "bun run setup");
else {
	let clash = "";
	try {
		for (const line of sh("git worktree list --porcelain").split("\n")) {
			if (!line.startsWith("worktree ")) continue;
			const dir = resolve(line.slice("worktree ".length));
			const env = join(dir, ".env.local");
			if (dir !== root && existsSync(env) && new RegExp(`^PORT=${port}$`, "m").test(readFileSync(env, "utf8"))) clash = dir;
		}
	} catch {
		// No git: no other worktrees.
	}
	if (clash) bad(`port ${port} is also claimed by ${clash}`, "delete PORT from .env.local, then bun run setup");
	else {
		const free = await new Promise((done) => {
			const server = createServer().once("error", () => done(false));
			server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
		});
		(free ? ok : note)(`dev port ${port} ${free ? "is free" : "is in use (a dev server may already be running in this checkout)"}`);
	}
}

ok("backend is local and per checkout (.wrangler/state); dev never talks to Cloudflare production");

try {
	sh("git fetch --quiet origin main");
	note(`${sh("git rev-list --count HEAD..origin/main")} commits behind origin/main`);
} catch {
	note("no origin/main to compare against");
}

if (problems.length) {
	console.error(`\n${problems.length} problem(s).`);
	process.exit(1);
}
console.warn("\nhealthy");
