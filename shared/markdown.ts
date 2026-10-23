// Markdown to HTML for the docs pages (our files) and README previews in the app (anyone's files). Both go
// through the same safe renderer: raw HTML in the source is shown as text, and links or images with a scheme
// other than http, https or mailto render as plain text, so a README can't run script in the app.

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

const marked = new Marked({
	gfm: true,
	renderer: {
		html({ text }) {
			return escapeHtml(text);
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

export function renderMarkdown(source: string): string {
	return marked.parse(source, { async: false });
}
