// Turns the JSON an agent sends into the typed inputs git-core's operations take, with a message naming
// the first thing wrong. Shared by the REST routes and the MCP tools, so both accept the same shapes.

import type { Ident } from "../../git-core/commit.ts";
import { MAX_LOG_LIMIT, type ReadLogInput } from "../../git-core/history.ts";
import type { CommitChangesInput, MergeInput } from "../../git-core/operations.ts";
import { isFileMode, pathProblem, type FileChange } from "../../git-core/tree.ts";

export type Parsed<T> = { ok: true; input: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOid(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function parseIdent(value: unknown): Parsed<Ident | undefined> {
	if (value === undefined) return { ok: true, input: undefined };
	if (!isRecord(value) || typeof value.name !== "string" || typeof value.email !== "string" || !value.name || !value.email) {
		return { ok: false, message: "author must be {name, email} with both non-empty" };
	}
	return { ok: true, input: { name: value.name, email: value.email } };
}

export function decodeBase64(text: string): Uint8Array {
	const binary = atob(text);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

const encoder = new TextEncoder();

/** One change: {path, content} for text, {path, content_base64} for bytes, or {path, delete: true}. */
export function parseChange(value: unknown, index: number): Parsed<FileChange> {
	const at = `changes[${index}]`;
	if (!isRecord(value)) return { ok: false, message: `${at} must be an object` };
	const problem = pathProblem(value.path);
	if (problem) return { ok: false, message: `${at}.path ${problem}` };
	const path = value.path as string;
	const ways = ["content", "content_base64", "delete"].filter((key) => value[key] !== undefined);
	if (ways.length !== 1) return { ok: false, message: `${at} needs exactly one of content, content_base64 or delete` };
	if (value.delete !== undefined) {
		if (value.delete !== true) return { ok: false, message: `${at}.delete must be true` };
		if (value.mode !== undefined) return { ok: false, message: `${at}.mode makes no sense with delete` };
		return { ok: true, input: { path, delete: true } };
	}
	if (value.mode !== undefined && !isFileMode(value.mode)) {
		return { ok: false, message: `${at}.mode must be "100644", "100755" or "120000"` };
	}
	const mode = isFileMode(value.mode) ? value.mode : undefined;
	if (value.content !== undefined) {
		if (typeof value.content !== "string") return { ok: false, message: `${at}.content must be a string (use content_base64 for bytes)` };
		return { ok: true, input: { path, content: encoder.encode(value.content), mode } };
	}
	if (typeof value.content_base64 !== "string") return { ok: false, message: `${at}.content_base64 must be a base64 string` };
	try {
		return { ok: true, input: { path, content: decodeBase64(value.content_base64), mode } };
	} catch {
		return { ok: false, message: `${at}.content_base64 is not valid base64` };
	}
}

export function parseCommitRequest(body: unknown): Parsed<CommitChangesInput> {
	if (!isRecord(body)) return { ok: false, message: "body must be a JSON object" };
	if (typeof body.branch !== "string" || !body.branch) return { ok: false, message: "branch must be a non-empty string" };
	if (!("expected_head" in body)) return { ok: false, message: "expected_head is required: the branch's current commit oid, or null to create the branch" };
	if (body.expected_head !== null && !isOid(body.expected_head)) return { ok: false, message: "expected_head must be a 40-hex commit oid or null" };
	if (body.start_rev !== undefined && body.start_rev !== null && (typeof body.start_rev !== "string" || !body.start_rev)) {
		return { ok: false, message: "start_rev must be a non-empty string" };
	}
	if (body.start_rev && body.expected_head !== null) return { ok: false, message: "start_rev only applies with expected_head null (creating the branch)" };
	if (typeof body.message !== "string" || !body.message.trim()) return { ok: false, message: "message must be a non-empty string" };
	const author = parseIdent(body.author);
	if (!author.ok) return author;
	if (!Array.isArray(body.changes) || body.changes.length === 0) return { ok: false, message: "changes must be a non-empty array" };
	const changes: FileChange[] = [];
	for (const [index, value] of body.changes.entries()) {
		const change = parseChange(value, index);
		if (!change.ok) return change;
		changes.push(change.input);
	}
	return {
		ok: true,
		input: {
			branch: body.branch,
			expected_head: body.expected_head,
			start_rev: typeof body.start_rev === "string" ? body.start_rev : null,
			message: body.message,
			author: author.input,
			changes,
		},
	};
}

export function parseMergeRequest(body: unknown): Parsed<MergeInput> {
	if (!isRecord(body)) return { ok: false, message: "body must be a JSON object" };
	if (typeof body.into !== "string" || !body.into) return { ok: false, message: "into must be a non-empty branch name" };
	if (typeof body.from !== "string" || !body.from) return { ok: false, message: "from must be a non-empty branch, tag or commit oid" };
	if (body.message !== undefined && (typeof body.message !== "string" || !body.message.trim())) return { ok: false, message: "message must be a non-empty string" };
	if (body.expected_head !== undefined && !isOid(body.expected_head)) return { ok: false, message: "expected_head must be a 40-hex commit oid" };
	if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") return { ok: false, message: "dry_run must be a boolean" };
	const author = parseIdent(body.author);
	if (!author.ok) return author;
	return {
		ok: true,
		input: {
			into: body.into,
			from: body.from,
			message: body.message,
			author: author.input,
			expected_head: body.expected_head,
			dry_run: body.dry_run,
		},
	};
}

/** Read requests take rev and path as strings; path "" or missing means the root. */
export function parseReadRequest(rev: unknown, path: unknown, options: { requirePath: boolean }): Parsed<{ rev: string | null; path: string }> {
	if (rev !== undefined && rev !== null && (typeof rev !== "string" || !rev)) return { ok: false, message: "ref must be a non-empty string" };
	if (path === undefined || path === null || path === "") {
		if (options.requirePath) return { ok: false, message: "path is required" };
		return { ok: true, input: { rev: typeof rev === "string" ? rev : null, path: "" } };
	}
	const problem = pathProblem(path);
	if (problem) return { ok: false, message: `path ${problem}` };
	return { ok: true, input: { rev: typeof rev === "string" ? rev : null, path: path as string } };
}

/** Log requests: ref like reads, limit 1 to MAX_LOG_LIMIT (default 30), skip 0 or more. Strings from a query or numbers from MCP. */
export function parseLogRequest(rev: unknown, limit: unknown, skip: unknown): Parsed<ReadLogInput> {
	if (rev !== undefined && rev !== null && (typeof rev !== "string" || !rev)) return { ok: false, message: "ref must be a non-empty string" };
	const count = limit === undefined || limit === null || limit === "" ? 30 : Number(limit);
	if (!Number.isInteger(count) || count < 1 || count > MAX_LOG_LIMIT) return { ok: false, message: `limit must be a whole number from 1 to ${MAX_LOG_LIMIT}` };
	const offset = skip === undefined || skip === null || skip === "" ? 0 : Number(skip);
	if (!Number.isInteger(offset) || offset < 0) return { ok: false, message: "skip must be a whole number, 0 or more" };
	return { ok: true, input: { rev: typeof rev === "string" ? rev : null, limit: count, skip: offset } };
}
