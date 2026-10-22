// Git smart HTTP endpoints: /<owner>/<repo>.git/info/refs, /git-upload-pack, /git-receive-pack.
// Requests are forwarded to the repo's RepoObject, which runs git-core next to its storage.

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

export async function handleGitHttp(_request: Request, _env: Env, _path: GitPath): Promise<Response> {
	return new Response("git over HTTP is not implemented yet\n", { status: 501 });
}
