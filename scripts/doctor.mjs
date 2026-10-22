// Is this checkout healthy? Run it before trusting a failure. Exits 1 if anything is wrong.
// Usage: bun run doctor
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const problems = [];
const ok = (msg) => console.warn(`ok    ${msg}`);
const bad = (msg) => {
	problems.push(msg);
	console.warn(`FAIL  ${msg}`);
};
const sh = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

if (!existsSync(join(root, "node_modules"))) bad("node_modules missing: run `bun run setup`");
else {
	try {
		sh("bun install --frozen-lockfile --dry-run");
		ok("dependencies match bun.lock");
	} catch {
		bad("dependencies don't match bun.lock: run `bun install`");
	}
}

const devVars = join(root, ".dev.vars");
if (existsSync(devVars) && /^TARU_ADMIN_TOKEN=.+/m.test(readFileSync(devVars, "utf8"))) ok(".dev.vars has TARU_ADMIN_TOKEN");
else bad(".dev.vars missing or has no TARU_ADMIN_TOKEN: run `bun run setup`");

const types = join(root, "worker-configuration.d.ts");
if (statSync(types).mtimeMs >= statSync(join(root, "wrangler.jsonc")).mtimeMs) ok("worker types are newer than wrangler.jsonc");
else bad("wrangler.jsonc changed since types were generated: run `bun run cf-typegen`");

try {
	ok(`git ${sh("git --version").replace("git version ", "")} (git-core end-to-end tests need it)`);
} catch {
	bad("git is not on PATH; git-core end-to-end tests need it");
}

const envLocal = join(root, ".env.local");
const port = Number(existsSync(envLocal) && /^PORT=(\d+)/m.exec(readFileSync(envLocal, "utf8"))?.[1]) || 5173;
const free = await new Promise((done) => {
	const server = createServer().once("error", () => done(false));
	server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
});
console.warn(`${free ? "ok   " : "note "} dev port ${port} ${free ? "is free" : "is in use (a dev server may already be running here)"}`);

try {
	sh("git fetch --quiet origin main");
	const behind = sh("git rev-list --count HEAD..origin/main");
	console.warn(`note  ${behind} commits behind origin/main`);
} catch {
	console.warn("note  no origin/main to compare against");
}

if (problems.length) {
	console.error(`\n${problems.length} problem(s).`);
	process.exit(1);
}
console.warn("\nhealthy");
