// Removes a worktree of this repo cleanly. On Windows `git worktree remove` leaves the .claude\skills junction
// and the folder behind, and refuses while a dev server holds files open. On Linux it deletes the folder under a
// running dev server, which keeps running orphaned.
// Usage: bun run remove-worktree <path>      (refuses if the worktree has uncommitted changes)
import { execSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const target = process.argv[2] && resolve(process.argv[2]);
const root = resolve(import.meta.dirname, "..");
if (!target) {
	console.error("usage: bun run remove-worktree <path>");
	process.exit(1);
}
const sh = (cmd, cwd = root) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const mainCheckout = resolve(sh("git rev-parse --path-format=absolute --git-common-dir"), "..");
if (target === mainCheckout) {
	console.error("refusing to remove the main checkout");
	process.exit(1);
}
if (sh("git status --porcelain", target)) {
	console.error(`${target} has uncommitted changes; commit or discard them first`);
	process.exit(1);
}

// Stop dev servers and workerd running from this worktree, with their children.
if (process.platform === "win32") {
	const escaped = target.replace(/'/g, "''");
	const pids = sh(
		`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${escaped}*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { $_.ProcessId }"`,
	)
		.split(/\s+/)
		.filter(Boolean);
	for (const pid of pids) {
		try {
			sh(`taskkill /T /F /PID ${pid}`);
			console.warn(`stopped process tree ${pid}`);
		} catch {
			// Already gone.
		}
	}
} else if (existsSync("/proc")) {
	// Linux: a dev server started as `node node_modules/vite/...` has a relative command line, so match its
	// working directory too, not only the command line (workerd's has the absolute path).
	const inside = (path) => path === target || path.startsWith(`${target}/`);
	// `bun run remove-worktree <path>` and its shell have the path in their command lines: never stop our own
	// ancestors. The parent pid is the 4th field of /proc/<pid>/stat, after the ")" that ends the command name.
	const ancestors = new Set();
	for (let pid = process.pid; pid > 1; ) {
		ancestors.add(pid);
		pid = Number(readFileSync(`/proc/${pid}/stat`, "utf8").split(")").pop().trim().split(" ")[1]);
	}
	for (const entry of readdirSync("/proc")) {
		const pid = Number(entry);
		if (!pid || ancestors.has(pid)) continue;
		try {
			const cwd = readlinkSync(`/proc/${pid}/cwd`);
			const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
			if (!inside(cwd) && !cmdline.some(inside)) continue;
			process.kill(pid, "SIGTERM");
			console.warn(`stopped process ${pid} (${cmdline.join(" ").trim().slice(0, 80)})`);
		} catch {
			// Gone already, or not ours to read.
		}
	}
} else {
	console.warn("not stopping processes on this platform: stop any dev server running from the worktree yourself");
}

// Remove the skills link itself, never what it points to.
const link = join(target, ".claude", "skills");
if (existsSync(link) && lstatSync(link).isSymbolicLink()) {
	if (process.platform === "win32") rmdirSync(link);
	else unlinkSync(link);
}

sh(`git worktree remove "${target}"`);
console.warn(`removed ${target}`);
