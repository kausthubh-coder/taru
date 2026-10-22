// Git smart HTTP endpoints: /<owner>/<repo>.git/info/refs, /git-upload-pack, /git-receive-pack.
// Requests are forwarded to the repo's RepoObject, which runs git-core next to its storage.

import type { GitService } from "../../git-core/protocol.ts";
import { isAdmin, unauthorized } from "../../repo-store/server/auth.ts";
import { byteLimit } from "../../repo-store/server/body.ts";
import { findRepo, repoKey, type RepoRow } from "../../repo-store/server/repos.ts";

export interface GitPath {
	owner: string;
	repo: string;
	/** What follows "<repo>.git", e.g. "/info/refs" or "/git-upload-pack". */
	rest: string;
}

const GIT_PATH = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\.git(\/.*)?$/;

export function matchGitPath(pathname: string): GitPath | null {
	const m = GIT_PATH.exec(pathname);
	if (!m) return null;
	return { owner: m[1], repo: m[2], rest: m[3] ?? "" };
}

/** The Workers request body limit. A push bigger than this is imported from GitHub by the server instead. */
export const MAX_BODY_BYTES = 100 * 1024 * 1024;

function isGitService(value: string | null): value is GitService {
	return value === "git-upload-pack" || value === "git-receive-pack";
}

function text(status: number, message: string): Response {
	return new Response(`${message}\n`, { status, headers: { "Content-Type": "text/plain", "Cache-Control": "no-cache" } });
}

export async function handleGitHttp(request: Request, env: Env, path: GitPath): Promise<Response> {
	const repo = await findRepo(env.DB, path.owner, path.repo);
	if (!repo) return text(404, "repository not found");
	const stub = env.REPO.getByName(repoKey(repo));

	if (path.rest === "/info/refs") {
		if (request.method !== "GET") return text(405, "method not allowed");
		const service = new URL(request.url).searchParams.get("service");
		if (!isGitService(service)) return text(400, "unsupported service: this server speaks smart HTTP only");
		if (service === "git-receive-pack" && !(await isAdmin(request, env))) return unauthorized();
		try {
			const advertisement = await stub.gitInfoRefs(service);
			return new Response(advertisement as BodyInit, {
				headers: { "Content-Type": `application/x-${service}-advertisement`, "Cache-Control": "no-cache" },
			});
		} catch (error) {
			return failed(`${service} advertisement`, repo, error);
		}
	}

	if (path.rest === "/git-upload-pack" || path.rest === "/git-receive-pack") {
		if (request.method !== "POST") return text(405, "method not allowed");
		const service: GitService = path.rest === "/git-upload-pack" ? "git-upload-pack" : "git-receive-pack";
		if (service === "git-receive-pack" && !(await isAdmin(request, env))) return unauthorized();

		const declared = Number(request.headers.get("Content-Length"));
		if (declared > MAX_BODY_BYTES) return text(413, `request body exceeds ${MAX_BODY_BYTES} bytes`);

		const limit = { exceeded: false };
		const body = decodedBody(request, MAX_BODY_BYTES, limit);
		try {
			const result = service === "git-upload-pack" ? await stub.gitUploadPack(body) : await stub.gitReceivePack(body);
			return new Response(result, {
				headers: { "Content-Type": `application/x-${service}-result`, "Cache-Control": "no-cache" },
			});
		} catch (error) {
			if (limit.exceeded) return text(413, `request body exceeds ${MAX_BODY_BYTES} bytes`);
			return failed(service, repo, error);
		}
	}

	return text(404, "not found");
}

function failed(what: string, repo: Pick<RepoRow, "owner" | "name">, error: unknown): Response {
	const message = error instanceof Error ? error.message : String(error);
	console.error(JSON.stringify({ message: `${what} failed`, repo: repoKey(repo), error: message }));
	return text(500, `${what} failed: ${message}`);
}

/**
 * The request body as git-core will see it: gunzipped when git sent it gzipped (it does for large pushes),
 * and cut off past `maxBytes`, which flips `limit.exceeded` so the caller can answer 413.
 */
export function decodedBody(request: Request, maxBytes: number, limit: { exceeded: boolean }): ReadableStream<Uint8Array> {
	let body: ReadableStream<Uint8Array> = request.body ?? new ReadableStream();
	if (request.headers.get("Content-Encoding") === "gzip") {
		body = body.pipeThrough(new DecompressionStream("gzip"));
	}
	return body.pipeThrough(byteLimit(maxBytes, limit));
}
