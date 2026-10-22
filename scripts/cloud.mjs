// Session start for cloud threads (Claude Code on the web, Codex Cloud). Local sessions exit immediately.
// Wired as a SessionStart hook in .claude/settings.json; Codex environment setup runs `CLOUD=1 node scripts/cloud.mjs`.
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const isCloud = process.env.CLAUDE_CODE_REMOTE === "true" || Boolean(process.env.CODEX_CI) || process.env.CLOUD === "1";
if (!isCloud) process.exit(0);

const root = resolve(import.meta.dirname, "..");
const failures = [];

try {
	// Global skills and rules for the session.
	execSync("curl -fsSL https://raw.githubusercontent.com/kausthubh-coder/skills/main/cloud/session.sh | bash", {
		cwd: root,
		stdio: ["ignore", "inherit", "inherit"],
		shell: "/bin/bash",
	});
} catch {
	failures.push("global skills");
}

try {
	// Setup output goes to stderr so it doesn't flood the session context.
	execSync("node scripts/setup.mjs", { cwd: root, stdio: ["ignore", 2, 2], env: { ...process.env, TARU_SETUP_QUIET: "1" } });
} catch {
	failures.push("setup (run `node scripts/setup.mjs` to see why)");
}

// stdout is what the session sees, so this one line goes there.
process.stdout.write(failures.length ? `taru cloud session: FAILED ${failures.join(", ")}\n` : "taru cloud session: ready\n");
