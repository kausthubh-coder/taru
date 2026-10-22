// The repo index in D1 and the rules for naming repos. Shared by the repos API and the git HTTP endpoints.

export interface RepoRow {
	owner: string;
	name: string;
	created_at: string;
}

// Letters, digits, "_", "." and "-", like GitHub. 64 is plenty for a demo and keeps URLs and DO names short.
const NAME = /^[A-Za-z0-9_.-]{1,64}$/;

/** Why `value` can't be an owner or repo name, or null if it can. */
export function nameProblem(value: unknown): string | null {
	if (typeof value !== "string") return "must be a string";
	if (!NAME.test(value)) return "must be 1-64 characters of letters, digits, '_', '.' or '-'";
	if (value === "." || value === "..") return "must not be '.' or '..'";
	if (value.toLowerCase().endsWith(".git")) return "must not end with .git";
	return null;
}

/** The Durable Object name for a repo. Always built from the row so the spelling stored at creation wins. */
export function repoKey(repo: Pick<RepoRow, "owner" | "name">): string {
	return `${repo.owner}/${repo.name}`;
}

export async function findRepo(db: D1Database, owner: string, name: string): Promise<RepoRow | null> {
	return db
		.prepare("SELECT owner, name, created_at FROM repos WHERE owner = ? AND name = ?")
		.bind(owner, name)
		.first<RepoRow>();
}
