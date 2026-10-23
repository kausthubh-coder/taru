// History: the commit list of a branch (CommitsScreen) and one commit's changes with diffs (CommitScreen).

import { query, repoPath, type ChangedFile, type CommitDetail, type LogResult } from "./api.ts";
import { firstLine, messageBody, parsePatch } from "./format.logic.ts";
import { navigate, useApi } from "./navigation.ts";
import { RefPicker } from "./repo.tsx";
import { currentRef, useRepo } from "./repo-context.ts";
import { hrefFor, type Route } from "./routes.logic.ts";
import { Link, Load, Sha, When } from "./ui.tsx";

type CommitsRoute = Extract<Route, { screen: "commits" }>;
type CommitRoute = Extract<Route, { screen: "commit" }>;

const PAGE = 30;

export function CommitsScreen({ route }: { route: CommitsRoute }) {
	const { owner, name, page } = route;
	const { repo } = useRepo();
	const refName = currentRef(repo, route.ref);
	const empty = Object.keys(repo.refs).length === 0;
	const log = useApi<LogResult>(empty ? null : `${repoPath(owner, name)}/commits${query({ ref: refName, limit: PAGE, skip: (page - 1) * PAGE })}`);

	if (empty) return <p className="state-line">No commits yet. The first push or commit shows up here.</p>;
	return (
		<>
			<div className="toolbar">
				<RefPicker value={refName} onPick={(ref) => navigate(hrefFor({ ...route, ref, page: 1 }))} />
			</div>
			<Load loaded={log} notFound={<p className="state-line">No branch or tag named {refName}.</p>}>
				{(data) => (
					<>
						<ol className="rows commits">
							{data.commits.map((commit) => {
								const href = hrefFor({ screen: "commit", owner, name, rev: commit.commit });
								return (
									<li key={commit.commit} className="row commit-row">
										<div className="commit-main">
											<Link className="row-title" href={href}>
												{firstLine(commit.message)}
											</Link>
											<span className="row-meta">
												{commit.author.name} · <When time={commit.committer.time} />
												{commit.parents.length > 1 ? " · merge" : ""}
											</span>
										</div>
										<Sha oid={commit.commit} href={href} />
									</li>
								);
							})}
						</ol>
						{page > 1 || data.more ? (
							<nav className="pager" aria-label="Pages">
								{page > 1 ? (
									<Link className="button-small" href={hrefFor({ ...route, page: page - 1 })}>
										Newer
									</Link>
								) : (
									<span />
								)}
								{data.more ? (
									<Link className="button-small" href={hrefFor({ ...route, page: page + 1 })}>
										Older
									</Link>
								) : null}
							</nav>
						) : null}
					</>
				)}
			</Load>
		</>
	);
}

export function CommitScreen({ route }: { route: CommitRoute }) {
	const { owner, name, rev } = route;
	const detail = useApi<CommitDetail>(`${repoPath(owner, name)}/commits/${rev.split("/").map(encodeURIComponent).join("/")}`);
	return (
		<Load loaded={detail} notFound={<p className="state-line">No commit {rev} in this repo.</p>}>
			{(commit) => {
				const additions = commit.files.reduce((sum, f) => sum + f.additions, 0);
				const deletions = commit.files.reduce((sum, f) => sum + f.deletions, 0);
				const body = messageBody(commit.message);
				return (
					<>
						<header className="commit-head">
							<h2>{firstLine(commit.message)}</h2>
							{body ? <pre className="commit-body">{body}</pre> : null}
							<p className="row-meta">
								{commit.author.name} &lt;{commit.author.email}&gt; · <When time={commit.author.time} />
								{commit.committer.name !== commit.author.name ? ` · committed by ${commit.committer.name}` : ""}
							</p>
							<dl className="commit-ids">
								<div>
									<dt className="label">Commit</dt>
									<dd>
										<code>{commit.commit}</code>
									</dd>
								</div>
								{commit.parents.length ? (
									<div>
										<dt className="label">{commit.parents.length > 1 ? "Parents" : "Parent"}</dt>
										<dd>
											{commit.parents.map((p) => (
												<Sha key={p} oid={p} href={hrefFor({ screen: "commit", owner, name, rev: p })} />
											))}
										</dd>
									</div>
								) : null}
								<div>
									<dt className="label">Files</dt>
									<dd>
										<Link href={hrefFor({ screen: "tree", owner, name, path: "", ref: commit.commit })}>Browse at this commit</Link>
									</dd>
								</div>
							</dl>
						</header>
						<p className="diff-summary">
							{commit.files.length} {commit.files.length === 1 ? "file" : "files"} changed
							{commit.parents.length > 1 ? ", compared with the first parent" : ""}
							<span className="diff-add"> +{additions}</span>
							<span className="diff-del"> −{deletions}</span>
							{commit.truncated ? " (the list stops at 300 files)" : ""}
						</p>
						{commit.files.map((file) => (
							<FileDiff key={file.path} file={file} />
						))}
					</>
				);
			}}
		</Load>
	);
}

const STATUS_LABEL: Record<ChangedFile["status"], string> = { added: "Added", deleted: "Deleted", modified: "Changed" };

function FileDiff({ file }: { file: ChangedFile }) {
	const modeChange = file.old_mode && file.new_mode && file.old_mode !== file.new_mode ? ` · mode ${file.old_mode} → ${file.new_mode}` : "";
	return (
		<section className="box diff" aria-label={file.path}>
			<div className="box-head">
				<span className={`change change-${file.status}`}>{STATUS_LABEL[file.status]}</span>
				<code className="diff-path">{file.path}</code>
				<span className="toolbar-end muted">
					{file.binary ? "binary" : (
						<>
							<span className="diff-add">+{file.additions}</span> <span className="diff-del">−{file.deletions}</span>
						</>
					)}
					{modeChange}
				</span>
			</div>
			{file.patch ? (
				<table className="diff-lines">
					<tbody>
						{parsePatch(file.patch).map((line, i) => (
							// Diff lines never reorder.
							// oxlint-disable-next-line react/no-array-index-key
							<tr key={i} className={`line-${line.kind}`}>
								<td className="ln">{line.old ?? ""}</td>
								<td className="ln">{line.new ?? ""}</td>
								<td className="text">
									{line.kind === "add" ? "+" : line.kind === "del" ? "−" : line.kind === "context" ? " " : ""}
									{line.text}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : file.binary ? (
				<p className="state-line">Binary file. Its contents aren't shown.</p>
			) : file.patch === "" ? (
				<p className="state-line">{file.status === "modified" ? "Only the file mode changed." : "Empty file."}</p>
			) : (
				<p className="state-line">This diff is too big to show here. Use git to see it.</p>
			)}
		</section>
	);
}
