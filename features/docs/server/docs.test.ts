// The docs from one set of Markdown files: every page reaches llms.txt with this server's URL, the full file has
// every page, and a page rendered into the real shell leaves no marker behind.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DOC_PAGES, isDocsPath, llmsFullTxt, llmsTxt, renderDocPage } from "./docs.ts";

const ORIGIN = "https://taru.example.dev";
const shell = readFileSync(join(import.meta.dirname, "../ui/shell/index.html"), "utf8");

describe("llms.txt", () => {
	test("links every page's Markdown on this server, and no page keeps the {{origin}} placeholder", () => {
		const text = llmsTxt(ORIGIN);
		expect(text.startsWith("# Taru\n\n> ")).toBe(true);
		for (const page of DOC_PAGES) expect(text).toContain(page.slug ? `${ORIGIN}/docs/${page.slug}.md` : `${ORIGIN}/docs.md`);
		expect(text).toContain(`${ORIGIN}/skills/taru/SKILL.md`);
		expect(text).not.toContain("{{origin}}");
	});

	test("llms-full.txt holds every page, with the server's URL filled in", () => {
		const text = llmsFullTxt(ORIGIN);
		for (const page of DOC_PAGES) expect(text).toContain(`# ${page.title}\n`);
		expect(text).not.toContain("{{origin}}");
		expect(text).toContain(`export TARU_URL=${ORIGIN}`);
	});
});

describe("renderDocPage", () => {
	test("fills every marker in the shell, marks the current page, and links the next one", () => {
		const quickstart = DOC_PAGES.find((p) => p.slug === "quickstart")!;
		const html = renderDocPage(shell, quickstart, ORIGIN);
		expect(html).not.toMatch(/<!--docs:/);
		expect(html).toContain("<title>Quickstart: Taru docs</title>");
		expect(html).toContain('<a href="/docs/quickstart" aria-current="page">Quickstart</a>');
		expect(html.match(/href="\/docs\/quickstart\.md"/g)).toHaveLength(2);
		expect(html).toContain('<a class="docs-next" href="/docs/git">');
		expect(html).toContain(`export TARU_URL=${ORIGIN}`);
	});

	test("every page has a title and a one-line summary", () => {
		for (const page of DOC_PAGES) {
			expect(page.title).not.toBe(page.slug);
			expect(page.summary.length).toBeGreaterThan(20);
		}
	});
});

test("isDocsPath", () => {
	expect(["/docs", "/docs/", "/docs.md", "/docs/api", "/docs/api.md", "/docs/self-host", "/llms.txt", "/llms-full.txt", "/skills/taru/SKILL.md"].every(isDocsPath)).toBe(true);
	expect(["/docsx", "/docs/a/b", "/docs/API", "/skills/other/SKILL.md"].some(isDocsPath)).toBe(false);
});
