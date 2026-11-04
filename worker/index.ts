// Worker entry. Routing only: each route hands off to its feature folder.

import { handleMcp } from "../features/agent-api/server/mcp.ts";
import { handleAgentApi, matchAgentApiPath } from "../features/agent-api/server/routes.ts";
import { handleDocs, isDocsPath } from "../features/docs/server/docs.ts";
import { handleGitHttp, matchGitPath } from "../features/git-http/server/routes.ts";
import { handleReposApi } from "../features/repo-store/server/api.ts";
import { handleSession } from "../features/repo-store/server/auth.ts";
import { handleWaitlist } from "../features/waitlist/server/waitlist.ts";

export { RepoObject } from "../features/repo-store/server/RepoObject.ts";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		const gitPath = matchGitPath(url.pathname);
		if (gitPath) return handleGitHttp(request, env, gitPath);

		const agentPath = matchAgentApiPath(url.pathname);
		if (agentPath) return handleAgentApi(request, env, agentPath);

		if (url.pathname === "/mcp") return handleMcp(request, env);
		if (url.pathname === "/api/waitlist") return handleWaitlist(request, env);
		if (url.pathname === "/api/session") return handleSession(request, env);
		if (url.pathname.startsWith("/api/repos")) return handleReposApi(request, env);
		if (isDocsPath(url.pathname)) return handleDocs(request, env);
		// The web app routes in the browser: every /app path gets the same shell.
		if (url.pathname === "/app" || url.pathname.startsWith("/app/")) return env.ASSETS.fetch(new URL("/app/", url));

		return Response.json({ error: "not found" }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
