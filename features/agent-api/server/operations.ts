// The agent operations as the REST routes and the MCP tools both see them: look the repo up, run the
// operation inside its RepoObject, and turn the result into a status and a JSON body.

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
