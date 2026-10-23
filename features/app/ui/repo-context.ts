// The repo every screen under /app/:owner/:name works in: its refs, HEAD and GitHub copy, loaded once by
// RepoLayout and reloaded after a write.

import { createContext, useContext } from "react";
import type { RepoDetail } from "./api.ts";

export interface RepoContextValue {
	repo: RepoDetail;
	reload: () => void;
}

export const RepoContext = createContext<RepoContextValue | null>(null);

export function useRepo(): RepoContextValue {
	const value = useContext(RepoContext);
	if (!value) throw new Error("useRepo outside RepoLayout");
	return value;
}

/** The branches, default first, then by name. */
export function branchesOf(repo: RepoDetail): string[] {
	const names = Object.keys(repo.refs)
		.filter((ref) => ref.startsWith("refs/heads/"))
		.map((ref) => ref.slice("refs/heads/".length));
	const head = repo.head.replace(/^refs\/heads\//, "");
	return names.toSorted((a, b) => Number(b === head) - Number(a === head) || a.localeCompare(b));
}

export function tagsOf(repo: RepoDetail): string[] {
	return Object.keys(repo.refs)
		.filter((ref) => ref.startsWith("refs/tags/"))
		.map((ref) => ref.slice("refs/tags/".length))
		.toSorted((a, b) => b.localeCompare(a, "en", { numeric: true }));
}

/** The branch a screen shows: ?ref= when given, otherwise the one HEAD points at. */
export function currentRef(repo: RepoDetail, ref: string | null): string {
	return ref ?? repo.head.replace(/^refs\/heads\//, "");
}

export function isBranch(repo: RepoDetail, ref: string): boolean {
	return `refs/heads/${ref}` in repo.refs || ref === repo.head.replace(/^refs\/heads\//, "");
}
