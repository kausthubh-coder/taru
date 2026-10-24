// Markdown to HTML for the docs pages (our files) and README previews in the app (anyone's files). Links and
// images with a scheme other than http, https or mailto render as plain text. Raw HTML in the source is shown as
// text by default; the app asks to keep it ("passthrough") only because it then runs the result through its DOM
// allowlist (features/app/ui/sanitize.ts) before it touches the page.

import { Marked, type Tokens } from "marked";

export function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Relative URLs, fragments, and http(s)/mailto. Anything else with a scheme (javascript:, data:) is refused. */
export function isSafeUrl(href: string): boolean {
	const scheme = /^\s*([a-z][a-z0-9+.-]*):/i.exec(href);
	return !scheme || ["http", "https", "mailto"].includes(scheme[1].toLowerCase());
}

/** "Clone, then push" -> "clone-then-push", for heading anchors. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replaceAll(/<[^>]*>/g, "")
		.replaceAll(/&[a-z]+;|&#\d+;/g, "")
		.replaceAll(/[^a-z0-9 _-]/g, "")
		.trim()
		.replaceAll(/[\s_]+/g, "-");
}

function plainText(tokens: Tokens.Generic[] | undefined, fallback: string): string {
	return tokens ? tokens.map((t) => ("text" in t && typeof t.text === "string" ? t.text : "")).join("") : fallback;
}

function makeRenderer(rawHtml: "escape" | "passthrough") {
	return new Marked({
		gfm: true,
		renderer: {
			html({ text }) {
				return rawHtml === "escape" ? escapeHtml(text) : text;
			},
			link({ href, title, tokens }) {
				const inner = this.parser.parseInline(tokens);
				if (!isSafeUrl(href)) return inner;
				const external = /^https?:/i.test(href);
				return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}${external ? ' rel="noopener noreferrer"' : ""}>${inner}</a>`;
			},
			image({ href, title, text }) {
				if (!isSafeUrl(href)) return escapeHtml(text);
				return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy">`;
			},
			heading({ tokens, depth, text }) {
				const id = slugify(plainText(tokens, text));
				return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
			},
		},
	});
}

const escaping = makeRenderer("escape");
const passthrough = makeRenderer("passthrough");

/** HTML for `source`. "passthrough" keeps raw HTML: only for callers that sanitize the result themselves. */
export function renderMarkdown(source: string, rawHtml: "escape" | "passthrough" = "escape"): string {
	return (rawHtml === "escape" ? escaping : passthrough).parse(source, { async: false });
}
