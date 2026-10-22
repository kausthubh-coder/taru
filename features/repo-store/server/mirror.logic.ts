// Pure rules for the GitHub copy and for imports: which remote URLs are allowed, which get the token,
// how retries back off, and the status record a repo keeps about its copy.

/** Largest pack we fetch or push in one go. Packs are buffered in the Durable Object, which has 128 MB. */
export const MAX_SYNC_PACK_BYTES = 100 * 1024 * 1024;

/**
 * Largest total size of the objects an import or a mirror push holds at once. Both are buffered whole, and the
 * pushed pack has no deltas and is copied a few times while it's built, so this sits well under the 128 MB a
 * Durable Object has. Bigger repos need streaming packs, which aren't built yet.
 */
export const MAX_SYNC_OBJECT_BYTES = 48 * 1024 * 1024;

/** Delay before each retry, by failures in a row. After the last one the copy waits for the next ref change. */
export const MIRROR_RETRY_DELAYS_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000];

/** Why `value` can't be a remote URL for import or mirror, or null if it can. */
export function remoteUrlProblem(value: unknown): string | null {
	if (typeof value !== "string") return "must be a string";
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return "must be an absolute URL";
	}
	if (url.username || url.password) return "must not contain credentials; the mirror token is a server secret";
	if (url.search || url.hash) return "must not have a query string or fragment";
	if (url.protocol === "https:") return null;
	// Plain http is for the fake GitHub in tests and verification, never for a real host.
	if (url.protocol === "http:" && isLoopback(url.hostname)) return null;
	return "must be https:// (http:// is allowed for localhost only)";
}

function isLoopback(hostname: string): boolean {
	return hostname === "localhost" || hostname === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}

/** The Authorization header for `url`: the GitHub token as a Basic password, only when talking to GitHub. */
export function authHeadersFor(url: string, githubToken: string | undefined): Record<string, string> {
	if (!githubToken) return {};
	const host = new URL(url).hostname.toLowerCase();
	if (host !== "github.com" && !host.endsWith(".github.com")) return {};
	return { Authorization: `Basic ${btoa(`x-access-token:${githubToken}`)}` };
}

export interface MirrorStatus {
	/** idle: nothing to push yet. pending: a push is scheduled. ok: the copy matches. failed: gave up until the next change. */
	state: "idle" | "pending" | "ok" | "failed";
	/** Failed attempts in a row for the current change. */
	attempts: number;
	last_attempt_at: string | null;
	last_success_at: string | null;
	last_error: string | null;
	next_attempt_at: string | null;
	/** Ref -> oid (null for a delete) sent in the last successful push. */
	last_pushed_refs: Record<string, string | null>;
}

export interface MirrorState {
	url: string;
	status: MirrorStatus;
}

export function freshMirrorStatus(): MirrorStatus {
	return { state: "idle", attempts: 0, last_attempt_at: null, last_success_at: null, last_error: null, next_attempt_at: null, last_pushed_refs: {} };
}
