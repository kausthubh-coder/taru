import { describe, expect, test } from "vitest";
import { isSafeUrl, renderMarkdown, slugify } from "./markdown.ts";

describe("renderMarkdown", () => {
	test("renders headings with anchors, code and tables", () => {
		const html = renderMarkdown("## Clone, then push\n\nRun `git push`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
		expect(html).toContain('<h2 id="clone-then-push">Clone, then push</h2>');
		expect(html).toContain("<code>git push</code>");
		expect(html).toContain("<td>1</td>");
	});

	test("shows raw HTML as text and drops unsafe links and images", () => {
		const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://example.com) ![i](data:image/svg+xml,<svg>)\n\n<img src=x onerror=alert(1)>');
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<img src=x");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("data:image");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">ok</a>');
	});
});

test("isSafeUrl allows relative, http(s) and mailto only", () => {
	expect(["docs/a.md", "#top", "/x", "https://a.b", "mailto:a@b.c", "a:b/c?x"].map(isSafeUrl)).toEqual([true, true, true, true, true, false]);
	expect(isSafeUrl(" JavaScript:alert(1)")).toBe(false);
});

test("slugify", () => {
	expect(slugify("The GitHub copy (mirror)")).toBe("the-github-copy-mirror");
});
