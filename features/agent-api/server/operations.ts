// The agent operations as the REST routes and the MCP tools both see them: look the repo up, run the
// operation inside its RepoObject, and turn the result into a status and a JSON body.

import type { ReadLogInput } from "../../git-core/history.ts";
import type { CommitChangesInput, MergeInput, OperationError, ReadTreeInput } from "../../git-core/operations.ts";
import { findRepo, repoKey } from "../../repo-store/server/repos.ts";

export interface ApiResult {
	status: number;
	body: Record<string, unknown>;
}

const ERROR_STATUS: Record<OperationError["error"], number> = {
	not_found: 404,
	invalid_request: 400,
	head_mismatch: 409,
	merge_conflict: 409,
	no_merge_base: 409,
};

function finish(result: { ok: true } | OperationError): ApiResult {
	if (result.ok) {
		const { ok: _ok, ...body } = result;
		return { status: 200, body };
	}
	const { ok: _ok, ...body } = result;
	return { status: ERROR_STATUS[result.error], body };
}

export function invalid(message: string): ApiResult {
	return { status: 400, body: { error: "invalid_request", message } };
}

async function stubFor(env: Env, owner: string, name: string) {
	const repo = await findRepo(env.DB, owner, name);
	return repo ? env.REPO.getByName(repoKey(repo)) : null;
}

const noRepo = (owner: string, name: string): ApiResult => ({ status: 404, body: { error: "not_found", message: `repo ${owner}/${name} not found` } });

export async function readTree(env: Env, owner: string, name: string, input: ReadTreeInput): Promise<ApiResult> {
	const stub = await stubFor(env, owner, name);
	return stub ? finish(await stub.agentReadTree(input)) : noRepo(owner, name);
}

export async function readFile(env: Env, owner: string, name: string, input: ReadTreeInput): Promise<ApiResult> {
	const stub = await stubFor(env, owner, name);
	return stub ? finish(await stub.agentReadFile(input)) : noRepo(owner, name);
}

export async function commit(env: Env, owner: string, name: string, input: CommitChangesInput): Promise<ApiResult> {
	const stub = await stubFor(env, owner, name);
	if (!stub) return noRepo(owner, name);
	const result = finish(await stub.agentCommit(input));
	return result.status === 200 ? { ...result, status: 201 } : result;
}

export async function merge(env: Env, owner: string, name: string, input: MergeInput): Promise<ApiResult> {
	const stub = await stubFor(env, owner, name);
	return stub ? finish(await stub.agentMerge(input)) : noRepo(owner, name);
}

export async function readLog(env: Env, owner: string, name: string, input: ReadLogInput): Promise<ApiResult> {
	const stub = await stubFor(env, owner, name);
	return stub ? finish(await stub.agentReadLog(input)) : noRepo(owner, name);
}

export async function readCommit(env: Env, owner: string, name: string, rev: string): Promise<ApiResult> {
	const stub = await stubFor(env, owner, name);
	return stub ? finish(await stub.agentReadCommit(rev)) : noRepo(owner, name);
}

const RAW_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	ico: "image/x-icon",
	svg: "image/svg+xml",
};

/**
 * A file's bytes, for README images and downloads. Repo files are untrusted and served from this origin, where the
 * app keeps the admin token, so the response can never run as a page: images get their image type, everything
 * else is text/plain or octet-stream, nosniff stops the browser guessing, and the CSP sandbox blocks script even in
 * an SVG opened on its own.
 */
export async function readRaw(env: Env, owner: string, name: string, input: ReadTreeInput): Promise<Response> {
	const stub = await stubFor(env, owner, name);
	if (!stub) return Response.json(noRepo(owner, name).body, { status: 404 });
	const blob = await stub.agentReadBlob(input);
	if (!blob.ok) {
		const result = finish(blob);
		return Response.json(result.body, { status: result.status });
	}
	const ext = input.path.slice(input.path.lastIndexOf(".") + 1).toLowerCase();
	const type = RAW_TYPES[ext] ?? (blob.data.includes(0) ? "application/octet-stream" : "text/plain; charset=utf-8");
	return new Response(blob.data, {
		headers: {
			"Content-Type": type,
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
			// A commit id never changes what it points at; a branch does.
			"Cache-Control": input.rev && /^[0-9a-f]{40}$/.test(input.rev) ? "public, max-age=31536000, immutable" : "public, max-age=60",
			ETag: `"${blob.oid}"`,
		},
	});
}
