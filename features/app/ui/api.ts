// The web app's calls to this server's API, and the admin token it sends with writes. Until accounts exist the
// token is the only credential: it stays in this browser's localStorage and goes only to this origin.

export interface RepoSummary {
	owner: string;
	name: string;
	created_at: string;
	clone_url: string;
}

export interface MirrorState {
	url: string;
	status: {
		state: "idle" | "pending" | "ok" | "failed";
		attempts: number;
		last_attempt_at: string | null;
		last_success_at: string | null;
		last_error: string | null;
		next_attempt_at: string | null;
	};
}

export interface RepoDetail extends RepoSummary {
	head: string;
	refs: Record<string, string>;
	mirror: MirrorState | null;
}

export interface Entry {
	name: string;
	path: string;
	type: "file" | "dir" | "symlink" | "submodule";
	mode: string;
	oid: string;
}

export interface TreeResult {
	ref: string | null;
	commit: string;
	path: string;
	entries: Entry[];
}

export interface FileResult {
	ref: string | null;
	commit: string;
	path: string;
	mode: string;
	oid: string;
	size: number;
	encoding: "utf-8" | "base64";
	content: string;
}

export interface Person {
	name: string;
	email: string;
	time: number;
	timezone: string;
}

export interface CommitSummary {
	commit: string;
	tree: string;
	parents: string[];
	author: Person;
	committer: Person;
	message: string;
}

export interface LogResult {
	ref: string | null;
	head: string;
	commits: CommitSummary[];
	more: boolean;
}

export interface ChangedFile {
	path: string;
	status: "added" | "deleted" | "modified";
	old_mode: string | null;
	new_mode: string | null;
	binary: boolean;
	additions: number;
	deletions: number;
	patch: string | null;
}

export interface CommitDetail extends CommitSummary {
	compared_to: string | null;
	files: ChangedFile[];
	truncated: boolean;
}

export interface CommitResult {
	branch: string;
	commit: string;
	parent: string | null;
}

/** An API answer: the parsed body and the status, so screens can branch on error codes like head_mismatch. */
export type ApiAnswer<T> = { ok: true; data: T } | { ok: false; status: number; error: string; message: string; body: Record<string, unknown> };

const TOKEN_KEY = "taru:admin-token";

export function savedToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

export function saveToken(token: string | null): void {
	if (token === null) localStorage.removeItem(TOKEN_KEY);
	else localStorage.setItem(TOKEN_KEY, token);
}

function basic(token: string): string {
	return `Basic ${btoa(`app:${token}`)}`;
}

export async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<ApiAnswer<T>> {
	const headers: Record<string, string> = {};
	const token = init.token === undefined ? savedToken() : init.token;
	if (token) headers.Authorization = basic(token);
	if (init.body !== undefined) headers["Content-Type"] = "application/json";
	let response: Response;
	try {
		response = await fetch(path, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
	} catch {
		return { ok: false, status: 0, error: "network", message: "Couldn't reach the server. Check your connection and try again.", body: {} };
	}
	let body: Record<string, unknown> = {};
	try {
		body = (await response.json()) as Record<string, unknown>;
	} catch {
		// A non-JSON answer (a 401 from the repos API is plain text): the status says enough.
	}
	if (response.ok) return { ok: true, data: body as T };
	const code = typeof body.error === "string" ? body.error : String(response.status);
	const message = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : response.statusText;
	if (response.status === 401) return { ok: false, status: 401, error: "unauthorized", message: "The admin token is missing or wrong. Paste it under Admin token.", body };
	return { ok: false, status: response.status, error: code, message, body };
}

export function repoPath(owner: string, name: string): string {
	return `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export function query(params: Record<string, string | number | null | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
	const text = search.toString();
	return text ? `?${text}` : "";
}

/** Text as UTF-8 bytes in base64, for content_base64. */
export function base64ToBytes(text: string): Uint8Array {
	return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
