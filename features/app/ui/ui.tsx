// Small pieces every screen uses: links that navigate in place, commit ids, times, the copy button, icons,
// loading and error states, and Markdown.

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { renderMarkdown } from "../../../shared/markdown.ts";
import { navigate, type Loaded } from "./navigation.ts";

export function Link({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string; "aria-current"?: "page" | undefined; title?: string }) {
	function onClick(event: MouseEvent<HTMLAnchorElement>) {
		// New tab, new window and download keep the browser's behavior.
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		navigate(href);
	}
	return (
		<a href={href} onClick={onClick} className={className} {...rest}>
			{children}
		</a>
	);
}

/** A commit id, short, in mono. Neutral on purpose: lime is kept for the next action. */
export function Sha({ oid, href }: { oid: string; href?: string }) {
	const text = oid.slice(0, 7);
	return href ? (
		<Link className="sha-chip" href={href} title={oid}>
			{text}
		</Link>
	) : (
		<code className="sha-chip" title={oid}>
			{text}
		</code>
	);
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 24 * 3600],
	["month", 30 * 24 * 3600],
	["week", 7 * 24 * 3600],
	["day", 24 * 3600],
	["hour", 3600],
	["minute", 60],
];

export function When({ time }: { time: number }) {
	// "Now" is read once per mount; a screen open for hours keeps its first wording.
	const [now] = useState(() => Date.now());
	const date = new Date(time * 1000);
	const seconds = time - now / 1000;
	let text = "just now";
	for (const [unit, size] of STEPS) {
		if (Math.abs(seconds) >= size) {
			text = relative.format(Math.round(seconds / size), unit);
			break;
		}
	}
	return (
		<time dateTime={date.toISOString()} title={absolute.format(date)}>
			{text}
		</time>
	);
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => setCopied(false), 1600);
		} catch {
			// Clipboard blocked (an insecure origin): the text is selectable next to the button.
		}
	}
	return (
		<button type="button" className="button-small" onClick={copy} aria-live="polite">
			{copied ? "Copied" : label}
		</button>
	);
}

export function FolderIcon() {
	return (
		<svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
			<path d="M1.75 3.5h4l1.5 1.75h7v7.25a.75.75 0 0 1-.75.75H2.5a.75.75 0 0 1-.75-.75z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
		</svg>
	);
}

export function FileIcon() {
	return (
		<svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
			<path d="M3.75 1.75h5.5l3 3v9.5h-8.5z M9.25 1.75v3h3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
		</svg>
	);
}

export function Loading({ label = "Loading" }: { label?: string }) {
	return (
		<p className="state-line" role="status">
			{label}…
		</p>
	);
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
	return (
		<div className="notice notice-error" role="alert">
			<p>{message}</p>
			{onRetry ? (
				<button type="button" className="button-small" onClick={onRetry}>
					Try again
				</button>
			) : null}
		</div>
	);
}

/** Renders `loaded` once it's ok; loading and error states otherwise. */
export function Load<T>({ loaded, children, notFound }: { loaded: Loaded<T> & { reload: () => void }; children: (data: T) => ReactNode; notFound?: ReactNode }) {
	if (loaded.state === "loading") return <Loading />;
	if (loaded.state === "error") {
		if (loaded.status === 404 && notFound) return <>{notFound}</>;
		return <ErrorNotice message={loaded.message} onRetry={loaded.reload} />;
	}
	return <>{children(loaded.data)}</>;
}

/** Markdown from a repo, through the safe renderer: raw HTML shows as text, unsafe links as plain text. */
export function Markdown({ source }: { source: string }) {
	// The renderer escapes raw HTML and drops script URLs, which is what makes this safe to inject.
	return <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
