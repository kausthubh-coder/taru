// Prepares a fresh checkout or worktree: installs deps, copies local secrets from the main checkout,
// picks a free dev port, and applies D1 migrations to the local database.
// Usage: bun run setup
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

run("bun install");

// Claude Code reads .claude/skills, Codex reads .agents/skills: one folder, linked. Git can't store the link.
const claudeSkills = join(root, ".claude", "skills");
if (!existsSync(claudeSkills)) {
	mkdirSync(join(root, ".claude"), { recursive: true });
	symlinkSync(join(root, ".agents", "skills"), claudeSkills, "junction");
	console.warn("linked .claude/skills -> .agents/skills");
}

// .dev.vars holds local secrets. Copy it from the main checkout, or start from the example.
const devVars = join(root, ".dev.vars");
if (!existsSync(devVars)) {
	const commonDir = execSync("git rev-parse --git-common-dir", { cwd: root, encoding: "utf8" }).trim();
	const mainCheckout = dirname(resolve(root, commonDir));
	const fromMain = join(mainCheckout, ".dev.vars");
	copyFileSync(existsSync(fromMain) && fromMain !== devVars ? fromMain : join(root, ".dev.vars.example"), devVars);
	console.warn(`wrote .dev.vars`);
}

function isFree(port) {
	return new Promise((done) => {
		const server = createServer().once("error", () => done(false));
		server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
	});
}

const envLocal = join(root, ".env.local");
const current = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
const existing = Number(/^PORT=(\d+)/m.exec(current)?.[1]);
let port = existing || 5173;
while (!(await isFree(port))) port++;
if (port !== existing) {
	writeFileSync(envLocal, current.replace(/^PORT=.*\n?/m, "") + `PORT=${port}\n`);
}
console.warn(`dev port: ${port}`);

run("bunx wrangler d1 migrations apply taru --local");
