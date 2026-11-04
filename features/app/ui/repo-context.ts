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

/** Only a short branch name is a branch here: the ref picker hands out tags as "refs/tags/<name>". */
export function isBranch(repo: RepoDetail, ref: string): boolean {
	if (ref.startsWith("refs/")) return false;
	return `refs/heads/${ref}` in repo.refs || ref === repo.head.replace(/^refs\/heads\//, "");
}

export interface RefOption {
	value: string;
	label: string;
}

/**
 * What the branch and tag picker lists, and which option shows `ref` (a screen's current ref). Branches are
 * short names and tags are full "refs/tags/<name>", so a tag that shares a branch's name still picks the tag.
 * A short name that is only a tag selects that tag, and anything else (a commit id) gets an option of its own.
 */
export function refOptions(repo: RepoDetail, ref: string): { selected: string; other: RefOption | null; branches: RefOption[]; tags: RefOption[] } {
	const branches = branchesOf(repo).map((name) => ({ value: name, label: name }));
	const tags = tagsOf(repo).map((name) => ({ value: `refs/tags/${name}`, label: name }));
	const short = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
	const selected = branches.some((b) => b.value === short) ? short : tags.some((t) => t.value === `refs/tags/${ref}`) ? `refs/tags/${ref}` : ref;
	const known = branches.some((b) => b.value === selected) || tags.some((t) => t.value === selected);
	return { selected, other: known ? null : { value: ref, label: ref.length === 40 ? ref.slice(0, 7) : ref }, branches, tags };
}
