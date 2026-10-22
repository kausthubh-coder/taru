// REST for agents: /api/repos/<owner>/<name>/{tree,file,commits,merges}. Reads are public, like clone;
// writes need the admin token, like push. Every error body is {error: <code>, message, ...details}.

import { isAdmin } from "../../repo-store/server/auth.ts";
import { byteLimit, readAll } from "../../repo-store/server/body.ts";
import { commit, invalid, merge, readFile, readTree, type ApiResult } from "./operations.ts";
import { parseCommitRequest, parseMergeRequest, parseReadRequest } from "./requests.logic.ts";

export interface AgentApiPath {
	owner: string;
	name: string;
	op: "tree" | "file" | "commits" | "merges";
}

const AGENT_PATH = /^\/api\/repos\/([^/]+)\/([^/]+)\/(tree|file|commits|merges)$/;

export function matchAgentApiPath(pathname: string): AgentApiPath | null {
	const m = AGENT_PATH.exec(pathname);
	if (!m) return null;
	return { owner: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]), op: m[3] as AgentApiPath["op"] };
}

/** Well under the 32 MiB RPC message cap, with room for base64 to shrink by a quarter when decoded. */
export const MAX_AGENT_BODY = 16 * 1024 * 1024;

function respond(result: ApiResult): Response {
	return Response.json(result.body, { status: result.status });
}

export async function handleAgentApi(request: Request, env: Env, path: AgentApiPath): Promise<Response> {
	const url = new URL(request.url);
	const { owner, name } = path;

	if (path.op === "tree" || path.op === "file") {
		if (request.method !== "GET") return respond({ status: 405, body: { error: "method_not_allowed", message: "use GET" } });
		const parsed = parseReadRequest(url.searchParams.get("ref"), url.searchParams.get("path"), { requirePath: path.op === "file" });
		if (!parsed.ok) return respond(invalid(parsed.message));
		return respond(path.op === "tree" ? await readTree(env, owner, name, parsed.input) : await readFile(env, owner, name, parsed.input));
	}

	if (request.method !== "POST") return respond({ status: 405, body: { error: "method_not_allowed", message: "use POST" } });
	const declared = Number(request.headers.get("Content-Length"));
	if (declared > MAX_AGENT_BODY) return respond({ status: 413, body: { error: "too_large", message: `body exceeds ${MAX_AGENT_BODY} bytes` } });
	// The (bounded) body is read before the auth check. Answering 401 with the body unread makes workerd
	// close the connection, and the next request on the dev proxy's pooled connection fails.
	let body: unknown;
	const limit = { exceeded: false };
	try {
		const raw = await readAll((request.body ?? new ReadableStream()).pipeThrough(byteLimit(MAX_AGENT_BODY, limit)));
		body = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		if (limit.exceeded) return respond({ status: 413, body: { error: "too_large", message: `body exceeds ${MAX_AGENT_BODY} bytes` } });
		return respond(invalid("body must be JSON"));
	}
	if (!(await isAdmin(request, env))) {
		return Response.json(
			{ error: "unauthorized", message: "writes need HTTP Basic auth with the admin token as the password" },
			{ status: 401, headers: { "WWW-Authenticate": 'Basic realm="taru"' } },
		);
	}

	if (path.op === "commits") {
		const parsed = parseCommitRequest(body);
		if (!parsed.ok) return respond(invalid(parsed.message));
		return respond(await commit(env, owner, name, parsed.input));
	}
	const parsed = parseMergeRequest(body);
	if (!parsed.ok) return respond(invalid(parsed.message));
	return respond(await merge(env, owner, name, parsed.input));
}
