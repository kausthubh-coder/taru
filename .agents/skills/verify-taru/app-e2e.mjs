// The web app end to end in Chromium, against the running verify instance:
//   node .agents/skills/verify-taru/app-e2e.mjs
// A README full of XSS payloads renders safely and its relative image loads; a wrong admin token is refused and
// the right one turns on writing; an edit and a new file become real commits that `git clone` sees; a branch that
// moves under the editor writes nothing; the commit view shows the diff; a tag that shares a branch's name opens
// the tag, read-only; a rewrite too big to diff says so in REST, MCP and the app. Screenshots go to the run's evidence.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../../..");
const instance = JSON.parse(readFileSync(join(root, ".verify/instance.json"), "utf8"));
const base = instance.url;
const token = /^TARU_ADMIN_TOKEN=(.+)$/m.exec(readFileSync(join(root, ".dev.vars"), "utf8"))[1].trim();
const out = join(root, ".verify/evidence", instance.run);
const auth = { Authorization: `Basic ${Buffer.from(`x:${token}`).toString("base64")}`, "Content-Type": "application/json" };
const name = `app-${Date.now()}`;
const api = `${base}/api/repos/e2e/${name}`;
const results = [];
const check = (label, ok, detail = "") => {
	results.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
	console.warn(results.at(-1));
};

async function json(path, init) {
	const res = await fetch(path, init);
	return { status: res.status, body: await res.json() };
}

const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#c4f252"/><script>parent.taruSvgXss=1</script></svg>';
const readme = `<h1 align="center"><img width="120" src="media/logo.svg" alt="Logo"></h1>

<p align="center">Plain <b>HTML</b> in a README</p>

<script>window.taruXss = 1</script>
<img src="x" onerror="window.taruXss = 2">
<a href="javascript:window.taruXss=3">bad link</a>
<iframe src="https://example.com"></iframe>
<div id="root">clobber</div>

[relative link](docs/guide.md) and [anchor](#usage)

## Usage

Some \`code\`.
`;
check("create repo", (await json(`${base}/api/repos`, { method: "POST", headers: auth, body: JSON.stringify({ owner: "e2e", name }) })).status === 201);
const first = await json(`${api}/commits`, {
	method: "POST",
	headers: auth,
	body: JSON.stringify({
		branch: "main",
		expected_head: null,
		message: "Seed",
		changes: [
			{ path: "README.md", content: readme },
			{ path: "media/logo.svg", content: logo },
			{ path: "docs/guide.md", content: "# Guide\n" },
			{ path: "src/app.ts", content: "export const total = () => 0;\n" },
		],
	}),
});
check("seed commit", first.status === 201);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${base}/app/e2e/${name}`, { waitUntil: "networkidle" });
await page.waitForSelector(".readme .prose");
const readmeState = await page.evaluate(() => {
	const prose = document.querySelector(".readme .prose");
	const img = prose.querySelector("img[alt=Logo]");
	return {
		xss: window.taruXss ?? null,
		svgxss: window.taruSvgXss ?? null,
		handlers: prose.querySelectorAll("[onerror],[onclick],[onload]").length,
		scripts: prose.querySelectorAll("script,iframe").length,
		jsLinks: [...prose.querySelectorAll("a")].filter((a) => a.getAttribute("href")?.startsWith("javascript")).length,
		imgSrc: img?.getAttribute("src"),
		imgLoaded: img ? img.complete && img.naturalWidth > 0 : false,
		bold: prose.querySelector("p[align=center] b")?.textContent,
		relHref: [...prose.querySelectorAll("a")].find((a) => a.textContent === "relative link")?.getAttribute("href"),
		anchor: [...prose.querySelectorAll("a")].find((a) => a.textContent === "anchor")?.getAttribute("href"),
		usageId: prose.querySelector("h2")?.id,
		rootCount: document.querySelectorAll("#root").length,
	};
});
check("README: no script ran", readmeState.xss === null && readmeState.svgxss === null, JSON.stringify({ xss: readmeState.xss, svg: readmeState.svgxss }));
check("README: handlers, scripts, iframes, javascript: links removed", readmeState.handlers === 0 && readmeState.scripts === 0 && readmeState.jsLinks === 0);
check("README: HTML kept", readmeState.bold === "HTML");
check("README: relative image loads from the repo", readmeState.imgLoaded && readmeState.imgSrc.includes("/raw?"), readmeState.imgSrc);
check("README: relative link goes to the file in the app", readmeState.relHref === `/app/e2e/${name}/blob/docs/guide.md?ref=main`, readmeState.relHref);
check("README: ids prefixed, anchors follow", readmeState.usageId === "user-content-usage" && readmeState.anchor === "#user-content-usage" && readmeState.rootCount === 1);
await page.screenshot({ path: `${out}/e2e-readme.png` });

// The raw SVG opened on its own can't run script (CSP sandbox).
const rawPage = await browser.newPage();
await rawPage.goto(`${base}/api/repos/e2e/${name}/raw?path=media/logo.svg`);
check("raw SVG opened directly runs no script", (await rawPage.evaluate(() => window.taruSvgXss ?? null).catch(() => null)) === null);
await rawPage.close();

// Token: a wrong one is refused, the right one turns on writing.
await page.getByRole("button", { name: "Admin token" }).click();
await page.getByRole("textbox", { name: "Admin token" }).fill("wrong-token");
await page.getByRole("button", { name: "Use this token" }).click();
await page.getByText("That isn't this server's admin token.").waitFor();
check("wrong token refused", true);
await page.getByRole("textbox", { name: "Admin token" }).fill(token);
await page.getByRole("button", { name: "Use this token" }).click();
await page.getByText("Admin", { exact: true }).waitFor();
check("right token accepted", (await page.evaluate(() => localStorage.getItem("taru:admin-token"))) === token);

// Edit a file and commit it.
await page.goto(`${base}/app/e2e/${name}/blob/src/app.ts`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "Edit" }).click();
await page.locator("textarea").fill("export const total = (items: number[]) => items.reduce((a, b) => a + b, 0);\n");
await page.getByLabel("Commit message").fill("Fix total() in the browser");
await page.screenshot({ path: `${out}/e2e-edit.png` });
await page.getByRole("button", { name: "Commit to main" }).click();
await page.waitForURL(`**/blob/src/app.ts`);
await page.getByText("items.reduce").waitFor();
const log = await json(`${api}/commits?limit=1`);
check("browser commit is the branch head", log.body.commits[0].message === "Fix total() in the browser\n" && log.body.commits[0].author.name === "Taru web app");

const clone = join(mkdtempSync(join(tmpdir(), "taru-e2e-")), "c");
execFileSync("git", ["clone", "-q", `${base}/e2e/${name}.git`, clone]);
check("git clone sees the browser commit", readFileSync(join(clone, "src/app.ts"), "utf8").includes("items.reduce") && execFileSync("git", ["-C", clone, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim() === "Fix total() in the browser");

// Add a file.
await page.goto(`${base}/app/e2e/${name}/new-file?dir=docs`, { waitUntil: "networkidle" });
await page.getByLabel("New file").fill("docs/notes.md");
await page.locator("textarea").fill("# Notes\n");
await page.getByRole("button", { name: "Commit to main" }).click();
await page.waitForURL(`**/blob/docs/notes.md`);
check("new file committed", (await json(`${api}/file?path=docs/notes.md`)).body.content === "# Notes\n");

// The branch moves while the editor is open: nothing is overwritten.
await page.goto(`${base}/app/e2e/${name}/edit/README.md`, { waitUntil: "networkidle" });
const head = (await json(`${api}/tree`)).body.commit;
await json(`${api}/commits`, { method: "POST", headers: auth, body: JSON.stringify({ branch: "main", expected_head: head, message: "Someone else", changes: [{ path: "other.txt", content: "x\n" }] }) });
await page.locator("textarea").fill("# Mine\n");
await page.getByRole("button", { name: "Commit to main" }).click();
await page.getByText("Nothing was saved").waitFor();
check("moved branch: notice shown, README untouched", (await json(`${api}/file?path=README.md`)).body.content === readme);
await page.screenshot({ path: `${out}/e2e-conflict.png` });

// History and the commit view show the browser commit.
await page.goto(`${base}/app/e2e/${name}/commits`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "Fix total() in the browser" }).click();
await page.locator(".diff-lines").first().waitFor();
check("commit view shows the diff", (await page.locator(".line-add .text").first().textContent()).includes("items.reduce"));
await page.screenshot({ path: `${out}/e2e-commit.png` });

// A tag and a branch with the same name: picking the tag shows the tag's files, read-only.
const pushUrl = `${base.replace("://", `://x:${encodeURIComponent(token)}@`)}/e2e/${name}.git`;
execFileSync("git", ["-C", clone, "push", "-q", pushUrl, "HEAD~1:refs/tags/release", "HEAD:refs/heads/release"]);
await page.goto(`${base}/app/e2e/${name}/blob/src/app.ts?ref=release`, { waitUntil: "networkidle" });
await page.getByText("items.reduce").waitFor();
check("same-name branch: branch content, editable", (await page.getByRole("link", { name: "Edit" }).count()) === 1);
await page.locator(".ref-picker select").selectOption("refs/tags/release");
await page.waitForURL(/ref=refs%2Ftags%2Frelease/);
await page.getByText("() => 0").waitFor();
const picked = await page.locator(".ref-picker select").evaluate((select) => ({ value: select.value, group: select.selectedOptions[0].parentElement.label }));
check("same-name tag: tag content, picker on the tag, no Edit", picked.value === "refs/tags/release" && picked.group === "Tags" && (await page.getByRole("link", { name: "Edit" }).count()) === 0, JSON.stringify(picked));
await page.screenshot({ path: `${out}/e2e-tag.png` });

// A rewrite too big to diff: REST, MCP and the app all say so instead of failing.
const lines = (word) => Array.from({ length: 3000 }, (_, i) => `${word} line ${i}\n`).join("");
let tip = (await json(`${api}/tree`)).body.commit;
tip = (await json(`${api}/commits`, { method: "POST", headers: auth, body: JSON.stringify({ branch: "main", expected_head: tip, message: "Big file", changes: [{ path: "big.txt", content: lines("old") }] }) })).body.commit;
const rewrite = await json(`${api}/commits`, { method: "POST", headers: auth, body: JSON.stringify({ branch: "main", expected_head: tip, message: "Rewrite big file", changes: [{ path: "big.txt", content: lines("new") }] }) });
const shown = await json(`${api}/commits/${rewrite.body.commit}`);
const bigFile = shown.body.files?.find((f) => f.path === "big.txt");
check("REST: rewrite comes back too_large", shown.status === 200 && bigFile?.too_large === true && bigFile.patch === null, JSON.stringify({ status: shown.status, too_large: bigFile?.too_large }));
const mcp = await json(`${base}/mcp`, {
	method: "POST",
	headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
	body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_commit", arguments: { repo: `e2e/${name}`, rev: rewrite.body.commit } } }),
});
const mcpFile = mcp.body.result?.structuredContent?.files?.find((f) => f.path === "big.txt");
check("MCP read_commit: rewrite comes back too_large", mcpFile?.too_large === true && mcpFile.patch === null, JSON.stringify(mcpFile ?? mcp.body));
await page.goto(`${base}/app/e2e/${name}/commit/${rewrite.body.commit}`, { waitUntil: "networkidle" });
await page.getByText("This diff is too large to show here").waitFor();
check("app: rewrite says the diff is too large", (await page.locator("section[aria-label='big.txt']").textContent()).includes("too large to diff"));
await page.screenshot({ path: `${out}/e2e-too-large.png` });

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
const passed = results.every((r) => r.startsWith("PASS"));
console.warn(passed ? `PASS; screenshots in .verify/evidence/${instance.run}/e2e-*.png` : "FAIL");
process.exit(passed ? 0 : 1);
