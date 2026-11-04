// README HTML for the app: Markdown rendered with its raw HTML kept, then cut down to an allowlist in a detached
// document, the way GitHub shows READMEs. Anything not listed (script, style, iframe, form, every on* handler,
// style attributes) is dropped, and URLs must be http(s), mailto or relative. Relative image and link paths
// are resolved against the README's folder, so `media/logo.svg` loads from the repo.

import { isSafeUrl, renderMarkdown } from "../../../shared/markdown.ts";

const TAGS = new Set([
	"a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt", "em", "h1", "h2", "h3",
	"h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd", "li", "ol", "p", "picture", "pre", "q", "s", "samp",
	"section", "small", "source", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot",
	"th", "thead", "tr", "tt", "u", "ul", "var",
]);

/** Elements whose content goes too, not just the tag. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "textarea", "select", "button", "form", "svg", "math"]);

const ATTRIBUTES = new Set(["href", "src", "srcset", "alt", "title", "width", "height", "align", "id", "colspan", "rowspan", "open", "media", "type", "checked", "disabled", "start", "loading", "rel"]);

export interface LinkTarget {
	/** The repo-relative folder the README is in: "" for the root. */
	dir: string;
	/** A repo file path for an <img src>: the raw URL. */
	raw: (path: string) => string;
	/** A repo path for an <a href>: the app URL. */
	page: (path: string) => string;
}

/** "docs/../media/./a.png" from folder "x" -> "media/a.png"; null when it climbs out of the repo. */
export function resolveRepoPath(dir: string, relative: string): string | null {
	const parts = relative.startsWith("/") ? [] : dir.split("/").filter(Boolean);
	for (const segment of relative.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (parts.length === 0) return null;
			parts.pop();
		} else parts.push(segment);
	}
	return parts.join("/");
}

function isRelative(url: string): boolean {
	return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//") && !url.startsWith("#");
}

const ID_PREFIX = "user-content-";

function rewrite(url: string, target: LinkTarget, kind: "raw" | "page"): string | null {
	const trimmed = url.trim();
	if (!isSafeUrl(trimmed)) return null;
	if (trimmed.startsWith("#")) return `#${ID_PREFIX}${trimmed.slice(1)}`;
	if (!isRelative(trimmed)) return trimmed;
	const [path] = trimmed.split(/[?#]/, 1);
	let decoded: string;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		return null;
	}
	const resolved = resolveRepoPath(target.dir, decoded);
	if (resolved === null) return null;
	return kind === "raw" ? target.raw(resolved) : target.page(resolved);
}

function clean(node: Element, target: LinkTarget): void {
	// A copy: the loop removes and replaces children of this live collection.
	for (const child of Array.from(node.children)) {
		const tag = child.tagName.toLowerCase();
		if (DROP_WITH_CONTENT.has(tag)) {
			child.remove();
			continue;
		}
		clean(child, target);
		if (!TAGS.has(tag)) {
			child.replaceWith(...child.childNodes);
			continue;
		}
		for (const attribute of Array.from(child.attributes)) {
			const name = attribute.name.toLowerCase();
			if (!ATTRIBUTES.has(name)) child.removeAttribute(attribute.name);
		}
		if (tag === "input" && child.getAttribute("type") !== "checkbox") child.remove();
		if (tag === "input") child.setAttribute("disabled", "");
		if (child.hasAttribute("srcset")) child.removeAttribute("srcset");
		// Prefixed like GitHub's, so an id in a README can't shadow one of the app's own elements or globals.
		if (child.id) child.id = `${ID_PREFIX}${child.id}`;
		if (tag === "a" && child.hasAttribute("href")) {
			const href = rewrite(child.getAttribute("href")!, target, "page");
			if (href === null) child.removeAttribute("href");
			else {
				child.setAttribute("href", href);
				if (/^https?:/i.test(href)) child.setAttribute("rel", "noopener noreferrer");
			}
		}
		if ((tag === "img" || tag === "source") && child.hasAttribute("src")) {
			const src = rewrite(child.getAttribute("src")!, target, "raw");
			if (src === null) child.removeAttribute("src");
			else child.setAttribute("src", src);
			if (tag === "img") child.setAttribute("loading", "lazy");
		}
		// A <source> picks the dark or light logo by media query; with no srcset it would do nothing, so drop it.
		if (tag === "source") child.remove();
	}
}

/** Safe HTML for a README or Markdown file at `target.dir`. */
export function readmeHtml(source: string, target: LinkTarget): string {
	const doc = new DOMParser().parseFromString(`<body>${renderMarkdown(source, "passthrough")}</body>`, "text/html");
	clean(doc.body, target);
	return doc.body.innerHTML;
}
