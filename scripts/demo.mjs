#!/usr/bin/env node
// The 60-second demo: an agent fixes a bug through Taru's MCP server with no clone, `git pull` on the
// developer's machine shows the fix, and the GitHub copy has the same commit. Each step prints a banner, so the
// terminal can be filmed as it runs. It also checks every claim and exits 1 if one is false.
//
// Usage (from the repo root, with a Taru running: `bun run dev`, a verify instance, or a deployed URL):
//   node scripts/demo.mjs [--taru <url>] [--repo <owner/name>] [--github <git url>] [--agent script|wait] [--pause <s>]
//     --taru    Taru's base URL. Default: http://localhost:<PORT from .env.local> (`bun run dev`)
//     --repo    repo to create. Default: acme/shop-<time>. It must not exist yet.
//     --github  where the GitHub copy goes, e.g. https://github.com/<you>/shop.git (an empty repo; the deployed
//               Worker needs GITHUB_MIRROR_TOKEN). Default: a local fake GitHub (scripts/fake-github.mjs),
//               started here and stopped at the end.
//     --agent   script: a scripted agent makes the fix through the official MCP client (default).
//               wait: prints the `claude mcp add` command, then waits up to 10 minutes for any agent to commit.
//     --pause   seconds to wait between steps, for filming. Default 0.
// The admin token comes from TARU_ADMIN_TOKEN, else .dev.vars. The workspace is a temp folder, printed and kept.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : fallback;
};
const devPort = existsSync(join(root, ".env.local")) ? /^PORT=(\d+)/m.exec(readFileSync(join(root, ".env.local"), "utf8"))?.[1] : null;
const taru = option("--taru", `http://localhost:${devPort ?? 5173}`).replace(/\/$/, "");
const repo = option("--repo", `acme/shop-${Date.now()}`);
const agentMode = option("--agent", "script");
const pauseMs = Number(option("--pause", "0")) * 1000;
const token = process.env.TARU_ADMIN_TOKEN ?? /^TARU_ADMIN_TOKEN=(.+)$/m.exec(readFileSync(join(root, ".dev.vars"), "utf8"))?.[1]?.trim();
if (!token) throw new Error("no admin token: set TARU_ADMIN_TOKEN or run `bun run setup`");
const auth = `Basic ${btoa(`demo:${token}`)}`;
const [owner, name] = repo.split("/");

// stdout, because the terminal is what gets filmed.
const say = (text) => process.stdout.write(`${text}\n`);
const failures = [];
const check = (ok, what) => {
	say(`  ${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures.push(what);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function banner(text) {
	if (pauseMs) await sleep(pauseMs);
	say(`\n\x1b[1m\x1b[32m▌\x1b[0m\x1b[1m ${text}\x1b[0m`);
}
const show = (text) => say(text.replace(/^/gm, "  "));
const git = (cwd, ...gitArgs) =>
	execFileSync("git", ["-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", "-c", "color.ui=always", ...gitArgs], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Dev", GIT_AUTHOR_EMAIL: "dev@acme.invalid", GIT_COMMITTER_NAME: "Dev", GIT_COMMITTER_EMAIL: "dev@acme.invalid" },
	}).trim();

async function api(method, path, body) {
	const init = body
		? { method, headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }
		: { method, headers: { authorization: auth } };
	const res = await fetch(`${taru}${path}`, init);
	return { status: res.status, body: await res.json().catch(() => null) };
}

const work = mkdtempSync(join(tmpdir(), "taru-demo-"));
let fakeGithub = null;

// The GitHub copy: a real GitHub URL, or a fake one (real `git http-backend`) for rehearsals.
let githubUrl = option("--github", null);
if (!githubUrl) {
	const githubRoot = join(work, "github");
	mkdirSync(join(githubRoot, owner), { recursive: true });
	execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(githubRoot, owner, `${name}.git`)]);
	fakeGithub = spawn(process.execPath, [join(root, "scripts", "fake-github.mjs"), githubRoot], { stdio: ["ignore", "pipe", "inherit"], detached: true });
	const port = await new Promise((done, reject) => {
		fakeGithub.stdout.on("data", (chunk) => {
			const m = /listening (\d+)/.exec(String(chunk));
			if (m) done(m[1]);
		});
		fakeGithub.on("exit", (code) => reject(new Error(`fake GitHub exited with ${code}`)));
	});
	githubUrl = `http://127.0.0.1:${port}/${owner}/${name}.git`;
}

try {
	await banner(`A repo on Taru (${taru}) with an automatic GitHub copy`);
	const created = await api("POST", "/api/repos", { owner, name });
	if (created.status !== 201) throw new Error(`could not create ${repo}: ${created.status} ${JSON.stringify(created.body)}`);
	const mirror = await api("PUT", `/api/repos/${owner}/${name}/mirror`, { url: githubUrl });
	if (mirror.status !== 200) throw new Error(`could not set the GitHub copy: ${mirror.status} ${JSON.stringify(mirror.body)}`);
	show(`${created.body.clone_url}\n  copied to ${githubUrl}${fakeGithub ? " (a local fake GitHub)" : ""}`);

	// The developer's project, pushed with plain git. The bug: the total ignores quantities.
	const seed = join(work, "seed");
	mkdirSync(join(seed, "src"), { recursive: true });
	writeFileSync(join(seed, "README.md"), "# shop\n\nA tiny cart.\n");
	writeFileSync(
		join(seed, "src", "cart.ts"),
		"export interface Item {\n\tname: string;\n\tprice: number;\n\tquantity: number;\n}\n\nexport function total(items: Item[]): number {\n\treturn items.reduce((sum, item) => sum + item.price, 0);\n}\n",
	);
	git(work, "init", "-q", seed);
	git(seed, "add", "-A");
	git(seed, "commit", "-qm", "Cart total");
	const pushUrl = created.body.clone_url.replace("://", `://demo:${token}@`);
	git(seed, "push", "-q", pushUrl, "main");
	const laptop = join(work, "laptop");
	git(work, "clone", "-q", created.body.clone_url, laptop);

	await banner("The developer has a clone. The agent doesn't need one.");
	show(git(laptop, "log", "--oneline"));

	await banner(agentMode === "wait" ? "Waiting for your agent to fix src/cart.ts through MCP" : "The agent fixes the bug through MCP: read_file, then commit_changes");
	const before = git(laptop, "rev-parse", "HEAD");
	let agentCommit;
	if (agentMode === "wait") {
		show(`claude mcp add --transport http taru ${taru}/mcp --header "Authorization: Basic <base64 of demo:TARU_ADMIN_TOKEN>"`);
		show(`Then ask: "In ${repo} on Taru, total() in src/cart.ts ignores quantity. Fix it and commit to main."`);
		const deadline = Date.now() + 10 * 60_000;
		for (;;) {
			// oxlint-disable-next-line no-await-in-loop
			const head = (await api("GET", `/api/repos/${owner}/${name}`)).body?.refs?.["refs/heads/main"];
			if (head && head !== before) {
				agentCommit = head;
				break;
			}
			if (Date.now() > deadline) throw new Error("no commit on main within 10 minutes");
			// oxlint-disable-next-line no-await-in-loop
			await sleep(1000);
		}
	} else {
		const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
		const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
		const client = new Client({ name: "demo-agent", version: "0" });
		await client.connect(new StreamableHTTPClientTransport(new URL(`${taru}/mcp`), { requestInit: { headers: { authorization: auth } } }));
		const read = await client.callTool({ name: "read_file", arguments: { repo, path: "src/cart.ts" } });
		show(`read_file src/cart.ts at ${read.structuredContent.commit.slice(0, 7)}`);
		const fixed = read.structuredContent.content.replace("sum + item.price,", "sum + item.price * item.quantity,");
		const commit = await client.callTool({
			name: "commit_changes",
			arguments: {
				repo,
				branch: "main",
				expected_head: read.structuredContent.commit,
				message: "Count quantities in the cart total",
				author: { name: "Agent", email: "agent@acme.invalid" },
				changes: [{ path: "src/cart.ts", content: fixed }],
			},
		});
		await client.close();
		if (commit.isError) throw new Error(`commit_changes failed: ${JSON.stringify(commit.structuredContent)}`);
		agentCommit = commit.structuredContent.commit;
		show(`commit_changes -> ${agentCommit.slice(0, 7)}, parent ${commit.structuredContent.parent.slice(0, 7)}`);
	}

	await banner("git pull on the developer's machine");
	show(git(laptop, "pull", "--ff-only"));
	show(git(laptop, "log", "-1", "-p", "--format=%h %an: %s"));
	check(git(laptop, "rev-parse", "HEAD") === agentCommit, "the pulled commit is the agent's commit");
	check(git(laptop, "fsck", "--full") === "", "git fsck --full is clean");

	await banner("And it's on GitHub");
	const deadline = Date.now() + 60_000;
	let status;
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop
		status = (await api("GET", `/api/repos/${owner}/${name}`)).body?.mirror?.status;
		if (status?.state === "ok" && status.last_pushed_refs?.["refs/heads/main"] === agentCommit) break;
		if (status?.state === "failed" || Date.now() > deadline) break;
		// oxlint-disable-next-line no-await-in-loop
		await sleep(500);
	}
	const githubMain = git(work, "ls-remote", githubUrl, "refs/heads/main").split("\t")[0];
	show(`git ls-remote ${githubUrl} main\n  ${githubMain}`);
	const githubPage = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(\.git)?$/.exec(githubUrl)?.[1];
	if (githubPage) show(`https://github.com/${githubPage}/commit/${agentCommit}`);
	check(githubMain === agentCommit, `the GitHub copy's main is the agent's commit (mirror ${status?.state ?? "unknown"}${status?.last_error ? `: ${status.last_error}` : ""})`);
} finally {
	if (fakeGithub) process.kill(-fakeGithub.pid, "SIGTERM");
	say(`\nworkspace kept in ${work}`);
}
if (failures.length) {
	console.error(`FAIL: ${failures.join("; ")}`);
	process.exit(1);
}
say("PASS");
