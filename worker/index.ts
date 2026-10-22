// Worker entry. Routing only: each route hands off to its feature folder.

import { handleGitHttp, matchGitPath } from "../features/git-http/server/routes.ts";
import { handleReposApi } from "../features/repo-store/server/api.ts";
import { handleWaitlist } from "../features/waitlist/server/waitlist.ts";

export { RepoObject } from "../features/repo-store/server/RepoObject.ts";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		const gitPath = matchGitPath(url.pathname);
		if (gitPath) return handleGitHttp(request, env, gitPath);

		if (url.pathname === "/api/waitlist") return handleWaitlist(request, env);
		if (url.pathname.startsWith("/api/repos")) return handleReposApi(request, env);

		return Response.json({ error: "not found" }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
