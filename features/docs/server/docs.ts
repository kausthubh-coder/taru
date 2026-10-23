/// <reference types="vite/client" />
// The docs, for people and for agents, from one set of Markdown files in features/docs/content:
//   /docs, /docs/<page>          HTML: the page rendered into the docs shell (features/docs/ui/shell/index.html)
//   /docs.md, /docs/<page>.md    the same page as Markdown
//   /llms.txt, /llms-full.txt    the llms.txt index of the pages, and every page in one file
//   /skills/taru/SKILL.md        the agent skill (skills/taru/SKILL.md, which `npx skills add` also finds)
// "{{origin}}" in the Markdown becomes the URL the reader reached this server on, so every example is
// copy-paste ready for this server.

import { escapeHtml, renderMarkdown } from "../../../shared/markdown.ts";
import skill from "../../../skills/taru/SKILL.md?raw";
import agents from "../content/agents.md?raw";
import api from "../content/api.md?raw";
import git from "../content/git.md?raw";
import github from "../content/github.md?raw";
import index from "../content/index.md?raw";
import limits from "../content/limits.md?raw";
import quickstart from "../content/quickstart.md?raw";
import selfHost from "../content/self-host.md?raw";

export interface DocPage {
	/** "" for the docs home. */
	slug: string;
	title: string;
	/** The first paragraph: the page's one-line summary in llms.txt and its meta description. */
	summary: string;
	source: string;
}

function page(slug: string, source: string): DocPage {
	const title = /^# (.+)$/m.exec(source)?.[1] ?? slug;
	const summary = source.split("\n\n")[1]?.replaceAll("\n", " ").trim() ?? "";
	return { slug, title, summary, source };
}

/** In reading order. The sidebar, llms.txt and llms-full.txt all follow it. */
export const DOC_PAGES: DocPage[] = [
	page("", index),
	page("quickstart", quickstart),
	page("git", git),
	page("agents", agents),
	page("api", api),
	page("github", github),
	page("self-host", selfHost),
	page("limits", limits),
];

export const SHELL_PATH = "/features/docs/ui/shell/";
const DOCS_PATH = /^\/docs(?:\/([a-z-]*?))?(\.md)?\/?$/;

export function isDocsPath(pathname: string): boolean {
	return DOCS_PATH.test(pathname) || pathname === "/llms.txt" || pathname === "/llms-full.txt" || pathname === "/skills/taru/SKILL.md";
}

function withOrigin(source: string, origin: string): string {
	return source.replaceAll("{{origin}}", origin);
}

function markdown(text: string): Response {
	return new Response(text, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

function plain(text: string): Response {
	return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

function pageUrl(origin: string, slug: string, ext = ""): string {
	return slug ? `${origin}/docs/${slug}${ext}` : `${origin}/docs${ext}`;
}

export function llmsTxt(origin: string): string {
	const [home, ...rest] = DOC_PAGES;
	const lines = [
		"# Taru",
		"",
		`> ${withOrigin(home.summary, origin)}`,
		"",
		`This server is ${origin}. Every link below is plain Markdown. Reads are public; writes need the admin token as HTTP Basic auth. MCP endpoint: ${origin}/mcp.`,
		"",
		"## Docs",
		"",
		`- [Overview](${pageUrl(origin, "", ".md")}): what works today and what doesn't`,
		...rest.map((p) => `- [${p.title}](${pageUrl(origin, p.slug, ".md")}): ${withOrigin(p.summary, origin)}`),
		"",
		"## Optional",
		"",
		`- [All docs in one file](${origin}/llms-full.txt)`,
		`- [Agent skill](${origin}/skills/taru/SKILL.md): the read, commit, review and merge workflow, as a SKILL.md`,
		"- [Source code](https://github.com/kausthubh-coder/taru): AGPL-3.0",
		"",
	];
	return lines.join("\n");
}

export function llmsFullTxt(origin: string): string {
	return DOC_PAGES.map((p) => `<!-- ${pageUrl(origin, p.slug)} -->\n\n${withOrigin(p.source, origin).trim()}\n`).join("\n\n");
}

function sidebar(current: DocPage): string {
	return DOC_PAGES.map((p) => {
		const label = p.slug ? p.title : "Overview";
		const href = p.slug ? `/docs/${p.slug}` : "/docs";
		return `<li><a href="${href}"${p === current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a></li>`;
	}).join("");
}

/** The page rendered into the docs shell: the shell's markers are replaced, nothing else changes. */
export function renderDocPage(shell: string, current: DocPage, origin: string): string {
	const position = DOC_PAGES.indexOf(current);
	const next = DOC_PAGES[position + 1];
	const pager = next ? `<a class="docs-next" href="/docs/${next.slug}"><span class="label">Next</span>${escapeHtml(next.title)}</a>` : "";
	const title = current.slug ? `${current.title}: Taru docs` : "Taru docs";
	// Replacer functions, so a "$&" or "$'" in the content is inserted as written.
	return shell
		.replace("<!--docs:title-->", () => escapeHtml(title))
		.replace("<!--docs:description-->", () => escapeHtml(withOrigin(current.summary, origin).replaceAll("`", "")))
		.replace("<!--docs:nav-->", () => sidebar(current))
		.replace("<!--docs:content-->", () => renderMarkdown(withOrigin(current.source, origin)))
		.replace("<!--docs:markdown-->", () => pageUrl("", current.slug, ".md"))
		.replace("<!--docs:next-->", () => pager);
}

export async function handleDocs(request: Request, env: Env): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed\n", { status: 405, headers: { Allow: "GET, HEAD" } });
	const url = new URL(request.url);
	const origin = url.origin;
	if (url.pathname === "/llms.txt") return plain(llmsTxt(origin));
	if (url.pathname === "/llms-full.txt") return plain(llmsFullTxt(origin));
	if (url.pathname === "/skills/taru/SKILL.md") return markdown(skill);

	const m = DOCS_PATH.exec(url.pathname)!;
	const slug = m[1] === "index" ? "" : (m[1] ?? "");
	const current = DOC_PAGES.find((p) => p.slug === slug);
	if (!current) return new Response("no such docs page\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
	if (m[2]) return markdown(withOrigin(current.source, origin));

	const shell = await env.ASSETS.fetch(new URL(SHELL_PATH, origin));
	if (!shell.ok) return new Response("docs shell missing\n", { status: 500 });
	return new Response(renderDocPage(await shell.text(), current, origin), {
		headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
	});
}
