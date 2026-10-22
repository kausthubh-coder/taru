// JSON API for repositories: /api/repos...

import { isAdmin, unauthorized } from "./auth.ts";
import { byteLimit, readAll } from "./body.ts";
import { findRepo, nameProblem, repoKey, type RepoRow } from "./repos.ts";

/** A create request is a few dozen bytes of JSON; anything near this is not one. */
const MAX_JSON_BODY = 64 * 1024;

const REPO_PATH = /^\/api\/repos\/([^/]+)\/([^/]+)$/;

export async function handleReposApi(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);

	// Clone URLs use the host the caller reached us on, so they're right on any port or domain.
	const origin = url.origin;

	if (url.pathname === "/api/repos") {
		if (request.method === "GET") return listRepos(env, origin);
		if (request.method === "POST") return createRepo(request, env, origin);
		return Response.json({ error: "method not allowed" }, { status: 405 });
	}

	const m = REPO_PATH.exec(url.pathname);
	if (m) {
		if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
		return showRepo(env, origin, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
	}

	return Response.json({ error: "not found" }, { status: 404 });
}

function describe(origin: string, repo: RepoRow) {
	return {
		owner: repo.owner,
		name: repo.name,
		created_at: repo.created_at,
		clone_url: `${origin}/${repo.owner}/${repo.name}.git`,
	};
}

async function listRepos(env: Env, origin: string): Promise<Response> {
	const { results } = await env.DB.prepare("SELECT owner, name, created_at FROM repos ORDER BY created_at DESC, id DESC").all<RepoRow>();
	return Response.json({ repos: results.map((row) => describe(origin, row)) });
}

async function createRepo(request: Request, env: Env, origin: string): Promise<Response> {
	if (!(await isAdmin(request, env))) return unauthorized();

	let body: { owner?: unknown; name?: unknown };
	try {
		const limit = { exceeded: false };
		const raw = await readAll((request.body ?? new ReadableStream()).pipeThrough(byteLimit(MAX_JSON_BODY, limit)));
		body = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		return Response.json({ error: "body must be JSON {owner, name}" }, { status: 400 });
	}
	if (typeof body !== "object" || body === null) {
		return Response.json({ error: "body must be JSON {owner, name}" }, { status: 400 });
	}
	const ownerProblem = nameProblem(body.owner);
	if (ownerProblem) return Response.json({ error: `owner ${ownerProblem}` }, { status: 400 });
	const nameProblemText = nameProblem(body.name);
	if (nameProblemText) return Response.json({ error: `name ${nameProblemText}` }, { status: 400 });
	const owner = body.owner as string;
	const name = body.name as string;

	// INSERT OR IGNORE plus the UNIQUE index makes "already exists" a row count, not an error message to parse.
	const inserted = await env.DB.prepare("INSERT OR IGNORE INTO repos (owner, name) VALUES (?, ?)").bind(owner, name).run();
	if (inserted.meta.changes === 0) {
		return Response.json({ error: `${owner}/${name} already exists` }, { status: 409 });
	}
	const repo = await findRepo(env.DB, owner, name);
	if (!repo) return Response.json({ error: "repo vanished after insert" }, { status: 500 });

	await env.REPO.getByName(repoKey(repo)).init();
	return Response.json(describe(origin, repo), { status: 201 });
}

async function showRepo(env: Env, origin: string, owner: string, name: string): Promise<Response> {
	const repo = await findRepo(env.DB, owner, name);
	if (!repo) return Response.json({ error: "not found" }, { status: 404 });
	const stub = env.REPO.getByName(repoKey(repo));
	const [head, refs] = await Promise.all([stub.headTarget(), stub.listRefs()]);
	return Response.json({ ...describe(origin, repo), head, refs: Object.fromEntries(refs) });
}
