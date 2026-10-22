// JSON API for repositories: /api/repos...
//   POST /api/repos                      create (admin)
//   GET  /api/repos                      list
//   GET  /api/repos/:owner/:name         head, refs, clone_url, mirror config and status
//   POST /api/repos/:owner/:name/import  {url}: fill an empty repo from another Git server (admin)
//   PUT  /api/repos/:owner/:name/mirror  {url} or {url: null}: turn the GitHub copy on or off (admin)

import { isAdmin, unauthorized } from "./auth.ts";
import { byteLimit, readAll } from "./body.ts";
import { remoteUrlProblem } from "./mirror.logic.ts";
import { findRepo, listRepos as listRepoRows, nameProblem, repoKey, type RepoRow } from "./repos.ts";

/** A request body here is a few dozen bytes of JSON; anything near this is not one. */
const MAX_JSON_BODY = 64 * 1024;

const REPO_PATH = /^\/api\/repos\/([^/]+)\/([^/]+)(\/import|\/mirror)?$/;

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
		const owner = decodeURIComponent(m[1]);
		const name = decodeURIComponent(m[2]);
		if (m[3] === "/import") {
			if (request.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
			return importRepo(request, env, owner, name);
		}
		if (m[3] === "/mirror") {
			if (request.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
			return setMirror(request, env, owner, name);
		}
		if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
		return showRepo(env, origin, owner, name);
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
	return Response.json({ repos: (await listRepoRows(env.DB)).map((row) => describe(origin, row)) });
}

async function createRepo(request: Request, env: Env, origin: string): Promise<Response> {
	if (!(await isAdmin(request, env))) return unauthorized();

	const body = await readJson(request);
	if (!body) return Response.json({ error: "body must be JSON {owner, name}" }, { status: 400 });
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
	const [head, refs, mirror] = await Promise.all([stub.headTarget(), stub.listRefs(), stub.mirrorState()]);
	return Response.json({ ...describe(origin, repo), head, refs: Object.fromEntries(refs), mirror });
}

async function importRepo(request: Request, env: Env, owner: string, name: string): Promise<Response> {
	if (!(await isAdmin(request, env))) return unauthorized();
	const body = await readJson(request);
	if (!body) return Response.json({ error: "body must be JSON {url}" }, { status: 400 });
	const urlProblem = remoteUrlProblem(body.url);
	if (urlProblem) return Response.json({ error: `url ${urlProblem}` }, { status: 400 });
	const repo = await findRepo(env.DB, owner, name);
	if (!repo) return Response.json({ error: "not found" }, { status: 404 });

	const outcome = await env.REPO.getByName(repoKey(repo)).importFrom(body.url as string);
	if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
	return Response.json({ refs: outcome.refs, objects: outcome.objects, head: outcome.head });
}

async function setMirror(request: Request, env: Env, owner: string, name: string): Promise<Response> {
	if (!(await isAdmin(request, env))) return unauthorized();
	const body = await readJson(request);
	if (!body || !("url" in body)) return Response.json({ error: "body must be JSON {url} (null turns the mirror off)" }, { status: 400 });
	if (body.url !== null) {
		const urlProblem = remoteUrlProblem(body.url);
		if (urlProblem) return Response.json({ error: `url ${urlProblem}` }, { status: 400 });
	}
	const repo = await findRepo(env.DB, owner, name);
	if (!repo) return Response.json({ error: "not found" }, { status: 404 });

	const mirror = await env.REPO.getByName(repoKey(repo)).setMirror(body.url as string | null);
	return Response.json({ mirror });
}

/** The request body as a JSON object, or null when it isn't one (too big, not JSON, not an object). */
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const limit = { exceeded: false };
		const raw = await readAll((request.body ?? new ReadableStream()).pipeThrough(byteLimit(MAX_JSON_BODY, limit)));
		const body: unknown = JSON.parse(new TextDecoder().decode(raw));
		return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
