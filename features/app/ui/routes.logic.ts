// The web app's URLs, both ways: a location to the screen it shows, and a screen to its URL. Refs ride in
// ?ref= rather than the path, because branch names contain slashes ("agent/fix-cart").
//
//   /app                               every repo
//   /app/new                           create or import a repo
//   /app/:owner/:name                  the repo's files at HEAD (or ?ref=)
//   /app/:owner/:name/tree/<path>      a folder
//   /app/:owner/:name/blob/<path>      a file
//   /app/:owner/:name/edit/<path>      edit a file and commit it
//   /app/:owner/:name/new-file         add a file (?dir= prefills the folder)
//   /app/:owner/:name/commits          history (?ref=, ?page=)
//   /app/:owner/:name/commit/:rev      one commit's changes
//   /app/:owner/:name/settings         the GitHub copy

export interface RepoId {
	owner: string;
	name: string;
}

export type Route =
	| { screen: "repos" }
	| { screen: "new-repo" }
	| ({ screen: "tree"; path: string; ref: string | null } & RepoId)
	| ({ screen: "blob"; path: string; ref: string | null } & RepoId)
	| ({ screen: "edit"; path: string; ref: string | null } & RepoId)
	| ({ screen: "new-file"; dir: string; ref: string | null } & RepoId)
	| ({ screen: "commits"; ref: string | null; page: number } & RepoId)
	| ({ screen: "commit"; rev: string } & RepoId)
	| ({ screen: "settings" } & RepoId)
	| { screen: "not-found" };

const NOT_FOUND: Route = { screen: "not-found" };

export function parseRoute(pathname: string, search: string): Route {
	const query = new URLSearchParams(search);
	const ref = query.get("ref") || null;
	const parts = pathname.replace(/\/+$/, "").split("/").slice(1).map(safeDecode);
	if (parts[0] !== "app" || parts.includes(null)) return NOT_FOUND;
	const segments = parts.slice(1) as string[];
	if (segments.length === 0) return { screen: "repos" };
	if (segments.length === 1) return segments[0] === "new" ? { screen: "new-repo" } : NOT_FOUND;
	const [owner, name, view, ...rest] = segments;
	const repo = { owner, name };
	const path = rest.join("/");
	switch (view) {
		case undefined:
			return { screen: "tree", ...repo, path: "", ref };
		case "tree":
			return { screen: "tree", ...repo, path, ref };
		case "blob":
			return path ? { screen: "blob", ...repo, path, ref } : NOT_FOUND;
		case "edit":
			return path ? { screen: "edit", ...repo, path, ref } : NOT_FOUND;
		case "new-file":
			return rest.length === 0 ? { screen: "new-file", ...repo, dir: query.get("dir") ?? "", ref } : NOT_FOUND;
		case "commits": {
			const page = Number(query.get("page") ?? "1");
			return rest.length === 0 ? { screen: "commits", ...repo, ref, page: Number.isInteger(page) && page >= 1 ? page : 1 } : NOT_FOUND;
		}
		case "commit":
			return path ? { screen: "commit", ...repo, rev: path } : NOT_FOUND;
		case "settings":
			return rest.length === 0 ? { screen: "settings", ...repo } : NOT_FOUND;
		default:
			return NOT_FOUND;
	}
}

function safeDecode(segment: string): string | null {
	try {
		return decodeURIComponent(segment);
	} catch {
		return null;
	}
}

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

function withQuery(path: string, query: Record<string, string | number | null | undefined>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
	const text = params.toString();
	return text ? `${path}?${text}` : path;
}

export function hrefFor(route: Route): string {
	if (route.screen === "repos") return "/app";
	if (route.screen === "new-repo") return "/app/new";
	if (route.screen === "not-found") return "/app";
	const base = `/app/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.name)}`;
	switch (route.screen) {
		case "tree":
			return withQuery(route.path ? `${base}/tree/${encodePath(route.path)}` : base, { ref: route.ref });
		case "blob":
			return withQuery(`${base}/blob/${encodePath(route.path)}`, { ref: route.ref });
		case "edit":
			return withQuery(`${base}/edit/${encodePath(route.path)}`, { ref: route.ref });
		case "new-file":
			return withQuery(`${base}/new-file`, { dir: route.dir, ref: route.ref });
		case "commits":
			return withQuery(`${base}/commits`, { ref: route.ref, page: route.page > 1 ? route.page : null });
		case "commit":
			return `${base}/commit/${encodePath(route.rev)}`;
		case "settings":
			return `${base}/settings`;
	}
}

/** "refs/heads/agent/fix" -> "agent/fix"; tags and other refs keep their full name. */
export function shortRef(ref: string): string {
	return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : ref;
}

/** The folder a file is in: "src/lib/a.ts" -> "src/lib", "a.ts" -> "". */
export function parentPath(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash < 0 ? "" : path.slice(0, slash);
}

/** Every screen inside one repo. */
export type RepoRoute = Exclude<Route, { screen: "repos" } | { screen: "new-repo" } | { screen: "not-found" }>;
