// One repo: its header and tabs (RepoLayout), the file browser (TreeScreen) and the file view (BlobScreen).

import { useMemo, useState, type ReactNode } from "react";
import { query, repoPath, type FileResult, type LogResult, type RepoDetail, type TreeResult } from "./api.ts";
import { formatBytes, imageType, isMarkdown, sortEntries, firstLine } from "./format.logic.ts";
import { navigate, useApi } from "./navigation.ts";
import { branchesOf, currentRef, isBranch, RepoContext, tagsOf, useRepo } from "./repo-context.ts";
import { hrefFor, parentPath, type RepoRoute, type Route } from "./routes.logic.ts";
import { useSession } from "./session.ts";
import { CopyButton, FileIcon, FolderIcon, Link, Load, Markdown, Sha, When } from "./ui.tsx";

type TreeRoute = Extract<Route, { screen: "tree" }>;
type BlobRoute = Extract<Route, { screen: "blob" }>;

export function RepoLayout({ route, children }: { route: RepoRoute; children: ReactNode }) {
	const { owner, name } = route;
	const repo = useApi<RepoDetail>(repoPath(owner, name));
	const loadedRepo = repo.state === "ok" ? repo.data : null;
	const context = useMemo(() => (loadedRepo ? { repo: loadedRepo, reload: repo.reload } : null), [loadedRepo, repo.reload]);
	const tab = route.screen === "commits" || route.screen === "commit" ? "commits" : route.screen === "settings" ? "settings" : "code";
	return (
		<Load
			loaded={repo}
			notFound={
				<div className="empty">
					<h1>
						No repo named {owner}/{name}
					</h1>
					<p>It may have a different name. Every repo on this server is on the list.</p>
					<Link className="button" href={hrefFor({ screen: "repos" })}>
						See every repo
					</Link>
				</div>
			}
		>
			{(detail) => (
				<RepoContext.Provider value={context}>
					<div className="repo-head">
						<h1 className="repo-title">
							<Link href={hrefFor({ screen: "repos" })} className="muted">
								{owner}
							</Link>
							<span className="muted"> / </span>
							<Link href={hrefFor({ screen: "tree", owner, name, path: "", ref: null })}>{name}</Link>
						</h1>
						<div className="clone">
							<span className="label">Clone</span>
							<code>{detail.clone_url}</code>
							<CopyButton text={`git clone ${detail.clone_url}`} label="Copy command" />
						</div>
					</div>
					<nav className="tabs" aria-label="Repo">
						<Link href={hrefFor({ screen: "tree", owner, name, path: "", ref: null })} aria-current={tab === "code" ? "page" : undefined}>
							Code
						</Link>
						<Link href={hrefFor({ screen: "commits", owner, name, ref: null, page: 1 })} aria-current={tab === "commits" ? "page" : undefined}>
							Commits
						</Link>
						<Link href={hrefFor({ screen: "settings", owner, name })} aria-current={tab === "settings" ? "page" : undefined}>
							Settings
							{detail.mirror ? <span className={`dot dot-${detail.mirror.status.state}`} aria-label={`GitHub copy ${detail.mirror.status.state}`} /> : null}
						</Link>
					</nav>
					{children}
				</RepoContext.Provider>
			)}
		</Load>
	);
}

/** Branch and tag picker: switching keeps the screen and the path. */
export function RefPicker({ value, onPick }: { value: string; onPick: (ref: string) => void }) {
	const { repo } = useRepo();
	const branches = branchesOf(repo);
	const tags = tagsOf(repo);
	const known = branches.includes(value) || tags.includes(value);
	return (
		<label className="ref-picker">
			<span className="sr-only">Branch or tag</span>
			<select value={value} onChange={(event) => onPick(event.target.value)}>
				{known ? null : <option value={value}>{value.length === 40 ? value.slice(0, 7) : value}</option>}
				<optgroup label="Branches">
					{branches.map((branch) => (
						<option key={branch} value={branch}>
							{branch}
						</option>
					))}
				</optgroup>
				{tags.length ? (
					<optgroup label="Tags">
						{tags.map((tag) => (
							<option key={tag} value={tag}>
								{tag}
							</option>
						))}
					</optgroup>
				) : null}
			</select>
		</label>
	);
}

/** repo / src / lib, each part a link to that folder. */
function Breadcrumb({ owner, name, path, refName, leaf }: { owner: string; name: string; path: string; refName: string | null; leaf?: boolean }) {
	const parts = path ? path.split("/") : [];
	return (
		<nav className="breadcrumb" aria-label="Path">
			<Link href={hrefFor({ screen: "tree", owner, name, path: "", ref: refName })}>{name}</Link>
			{parts.map((part, i) => {
				const to = parts.slice(0, i + 1).join("/");
				const last = i === parts.length - 1;
				return (
					<span key={to}>
						<span className="muted"> / </span>
						{last && leaf !== false ? <span aria-current="page">{part}</span> : <Link href={hrefFor({ screen: "tree", owner, name, path: to, ref: refName })}>{part}</Link>}
					</span>
				);
			})}
		</nav>
	);
}

function LatestCommit({ owner, name, refName }: { owner: string; name: string; refName: string }) {
	const log = useApi<LogResult>(`${repoPath(owner, name)}/commits${query({ ref: refName, limit: 1 })}`);
	if (log.state !== "ok" || log.data.commits.length === 0) return <div className="latest" aria-hidden="true" />;
	const [commit] = log.data.commits;
	return (
		<div className="latest">
			<span className="latest-author">{commit.author.name}</span>
			<Link className="latest-message" href={hrefFor({ screen: "commit", owner, name, rev: commit.commit })}>
				{firstLine(commit.message)}
			</Link>
			<span className="latest-meta">
				<Sha oid={commit.commit} href={hrefFor({ screen: "commit", owner, name, rev: commit.commit })} />
				<When time={commit.committer.time} />
			</span>
		</div>
	);
}

function EmptyRepo({ owner, name }: { owner: string; name: string }) {
	const { repo } = useRepo();
	const session = useSession();
	const remote = repo.clone_url.replace("://", "://x:$TARU_TOKEN@");
	return (
		<div className="empty empty-repo">
			<h2>This repo is empty</h2>
			<p>Push a repo you have, add a first file here, or let an agent commit through MCP.</p>
			<pre className="code-block">{`git remote add taru ${remote}\ngit push taru main`}</pre>
			<div className="row-start">
				{session.state === "admin" ? (
					<Link className="button" href={hrefFor({ screen: "new-file", owner, name, dir: "", ref: null })}>
						Add a file
					</Link>
				) : null}
				<a className="button button-quiet" href="/docs/agents">
					Connect an agent
				</a>
			</div>
		</div>
	);
}

export function TreeScreen({ route }: { route: TreeRoute }) {
	const { owner, name, path } = route;
	const { repo } = useRepo();
	const session = useSession();
	const refName = currentRef(repo, route.ref);
	const empty = Object.keys(repo.refs).length === 0;
	const tree = useApi<TreeResult>(empty ? null : `${repoPath(owner, name)}/tree${query({ ref: refName, path })}`);
	const readme = tree.state === "ok" ? tree.data.entries.find((e) => e.type === "file" && /^readme(\.md|\.markdown|\.txt)?$/i.test(e.name)) : undefined;

	if (empty) return <EmptyRepo owner={owner} name={name} />;
	return (
		<>
			<div className="toolbar">
				<RefPicker value={refName} onPick={(ref) => navigate(hrefFor({ ...route, ref }))} />
				<Breadcrumb owner={owner} name={name} path={path} refName={route.ref} />
				<span className="toolbar-end">
					{session.state === "admin" && isBranch(repo, refName) ? (
						<Link className="button-small" href={hrefFor({ screen: "new-file", owner, name, dir: path, ref: route.ref })}>
							Add file
						</Link>
					) : null}
				</span>
			</div>
			<div className="box">
				<LatestCommit owner={owner} name={name} refName={refName} />
				<Load
					loaded={tree}
					notFound={<p className="state-line">No folder {path ? `"${path}"` : ""} on {refName}.</p>}
				>
					{(data) => (
						<ul className="files">
							{path ? (
								<li>
									<Link className="file-row" href={hrefFor({ ...route, path: parentPath(path) })}>
										<span className="file-name muted">..</span>
									</Link>
								</li>
							) : null}
							{sortEntries(data.entries).map((entry) => (
								<li key={entry.path}>
									<Link
										className="file-row"
										href={hrefFor(entry.type === "dir" ? { ...route, path: entry.path } : { screen: "blob", owner, name, path: entry.path, ref: route.ref })}
									>
										{entry.type === "dir" ? <FolderIcon /> : <FileIcon />}
										<span className="file-name">{entry.name}</span>
										{entry.type === "symlink" ? <span className="muted">symlink</span> : entry.type === "submodule" ? <span className="muted">submodule</span> : null}
									</Link>
								</li>
							))}
						</ul>
					)}
				</Load>
			</div>
			{readme ? <Readme owner={owner} name={name} refName={refName} path={readme.path} /> : null}
		</>
	);
}

function Readme({ owner, name, refName, path }: { owner: string; name: string; refName: string; path: string }) {
	const file = useApi<FileResult>(`${repoPath(owner, name)}/file${query({ ref: refName, path })}`);
	if (file.state !== "ok" || file.data.encoding !== "utf-8") return null;
	return (
		<section className="box readme" aria-label={path}>
			<div className="box-head">
				<span className="label">{path.split("/").pop()}</span>
			</div>
			<div className="readme-body">{isMarkdown(path) ? <Markdown source={file.data.content} /> : <pre className="plain-text">{file.data.content}</pre>}</div>
		</section>
	);
}

export function BlobScreen({ route }: { route: BlobRoute }) {
	const { owner, name, path } = route;
	const { repo } = useRepo();
	const session = useSession();
	const refName = currentRef(repo, route.ref);
	const file = useApi<FileResult>(`${repoPath(owner, name)}/file${query({ ref: refName, path })}`);
	const [view, setView] = useState<"preview" | "code">("preview");
	const markdown = isMarkdown(path);

	return (
		<>
			<div className="toolbar">
				<RefPicker value={refName} onPick={(ref) => navigate(hrefFor({ ...route, ref }))} />
				<Breadcrumb owner={owner} name={name} path={path} refName={route.ref} />
			</div>
			<Load loaded={file} notFound={<p className="state-line">No file at {path} on {refName}.</p>}>
				{(data) => (
					<div className="box">
						<div className="box-head">
							<span className="muted">
								{formatBytes(data.size)}
								{data.encoding === "utf-8" ? ` · ${countLines(data.content)} lines` : ""}
								{data.mode === "100755" ? " · executable" : ""}
							</span>
							<span className="toolbar-end">
								{markdown && data.encoding === "utf-8" ? (
									<span className="segmented" role="group" aria-label="View">
										<button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>
											Preview
										</button>
										<button type="button" aria-pressed={view === "code"} onClick={() => setView("code")}>
											Code
										</button>
									</span>
								) : null}
								{session.state === "admin" && data.encoding === "utf-8" && isBranch(repo, refName) ? (
									<Link className="button-small" href={hrefFor({ screen: "edit", owner, name, path, ref: route.ref })}>
										Edit
									</Link>
								) : null}
							</span>
						</div>
						<FileBody path={path} file={data} view={markdown ? view : "code"} />
					</div>
				)}
			</Load>
		</>
	);
}

function countLines(text: string): number {
	if (!text) return 0;
	return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function FileBody({ path, file, view }: { path: string; file: FileResult; view: "preview" | "code" }) {
	if (file.encoding === "base64") {
		const type = imageType(path);
		if (type) return <div className="image-view"><img src={`data:${type};base64,${file.content}`} alt={path} /></div>;
		return <p className="state-line">Binary file, {formatBytes(file.size)}. Clone the repo to open it.</p>;
	}
	if (view === "preview") return <div className="readme-body"><Markdown source={file.content} /></div>;
	if (!file.content) return <p className="state-line">Empty file.</p>;
	const lines = file.content.endsWith("\n") ? file.content.slice(0, -1).split("\n") : file.content.split("\n");
	return (
		<pre className="code-view">
			<code>
				{lines.map((line, i) => (
					// Lines never reorder, so the index is a stable key.
					// oxlint-disable-next-line react/no-array-index-key
					<span key={i} className="code-line">
						{line}
						{"\n"}
					</span>
				))}
			</code>
		</pre>
	);
}
