// Text the app shows, worked out from API data: message lines, sizes, file kinds, and diff lines with numbers.

export function firstLine(message: string): string {
	return message.split("\n", 1)[0];
}

/** The message after its first line, trimmed; "" when there's only one line. */
export function messageBody(message: string): string {
	const newline = message.indexOf("\n");
	return newline < 0 ? "" : message.slice(newline + 1).trim();
}

export function formatBytes(size: number): string {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", svg: "image/svg+xml" };

/** The image MIME type for a path the browser can show in an <img>, or null. */
export function imageType(path: string): string | null {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return IMAGE_TYPES[ext] ?? null;
}

export function isMarkdown(path: string): boolean {
	return /\.(md|markdown|mdx)$/i.test(path);
}

/** Folders first, then files, each by name the way people sort (a2 before a10). */
export function sortEntries<T extends { name: string; type: string }>(entries: T[]): T[] {
	const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
	return entries.toSorted((a, b) => Number(b.type === "dir") - Number(a.type === "dir") || collator.compare(a.name, b.name));
}

export interface DiffLine {
	kind: "hunk" | "add" | "del" | "context" | "note";
	text: string;
	/** Line number in the old file, for context and deleted lines. */
	old: number | null;
	/** Line number in the new file, for context and added lines. */
	new: number | null;
}

/** A unified diff's lines, numbered from its "@@ -a,b +c,d @@" headers. */
export function parsePatch(patch: string): DiffLine[] {
	const lines: DiffLine[] = [];
	let oldLine = 0;
	let newLine = 0;
	const rows = patch.split("\n");
	if (rows[rows.length - 1] === "") rows.pop();
	for (const row of rows) {
		const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
		if (header) {
			oldLine = Number(header[1]);
			newLine = Number(header[2]);
			// An empty range's start is the line before it.
			if (/^@@ -\d+,0 /.test(row)) oldLine++;
			if (/\+\d+,0 @@/.test(row)) newLine++;
			lines.push({ kind: "hunk", text: row, old: null, new: null });
		} else if (row.startsWith("+")) lines.push({ kind: "add", text: row.slice(1), old: null, new: newLine++ });
		else if (row.startsWith("-")) lines.push({ kind: "del", text: row.slice(1), old: oldLine++, new: null });
		else if (row.startsWith("\\")) lines.push({ kind: "note", text: row.slice(2), old: null, new: null });
		else lines.push({ kind: "context", text: row.slice(1), old: oldLine++, new: newLine++ });
	}
	return lines;
}
