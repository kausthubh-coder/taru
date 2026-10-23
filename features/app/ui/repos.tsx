// The repo list (/app) and the new repo form (/app/new), which can also import from GitHub.

import { useState, type FormEvent } from "react";
import { call, repoPath, type RepoSummary } from "./api.ts";
import { navigate, useApi } from "./navigation.ts";
import { hrefFor } from "./routes.logic.ts";
import { useSession } from "./session.ts";
import { ErrorNotice, Link, Load } from "./ui.tsx";

export function ReposScreen() {
	const repos = useApi<{ repos: RepoSummary[] }>("/api/repos");
	const session = useSession();
	return (
		<>
			<div className="page-head">
				<h1>Repositories</h1>
				{session.state === "admin" ? (
					<Link className="button" href={hrefFor({ screen: "new-repo" })}>
						New repo
					</Link>
				) : null}
			</div>
			<Load loaded={repos}>
				{({ repos: list }) =>
					list.length === 0 ? (
						<div className="empty">
							<h2>No repos yet</h2>
							<p>
								Create one here, push one with <code>git</code>, or import one from GitHub.
								{session.state === "admin" ? "" : " Creating needs the admin token."}
							</p>
							{session.state === "admin" ? (
								<Link className="button" href={hrefFor({ screen: "new-repo" })}>
									New repo
								</Link>
							) : (
								<a className="button button-quiet" href="/docs/quickstart">
									Read the quickstart
								</a>
							)}
						</div>
					) : (
						<ul className="rows">
							{list.map((repo) => (
								<li key={`${repo.owner}/${repo.name}`} className="row repo-row">
									<Link className="row-title" href={hrefFor({ screen: "tree", owner: repo.owner, name: repo.name, path: "", ref: null })}>
										<span className="muted">{repo.owner} /</span> {repo.name}
									</Link>
									<code className="row-meta">{repo.clone_url}</code>
								</li>
							))}
						</ul>
					)
				}
			</Load>
		</>
	);
}

export function NewRepoScreen() {
	const session = useSession();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState<"" | "creating" | "importing">("");

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (busy) return;
		const form = new FormData(event.currentTarget);
		const owner = String(form.get("owner") ?? "").trim();
		const name = String(form.get("name") ?? "").trim();
		const importUrl = String(form.get("import") ?? "").trim();
		setError("");
		setBusy("creating");
		const created = await call<RepoSummary>("/api/repos", { method: "POST", body: { owner, name } });
		if (!created.ok) {
			setBusy("");
			setError(created.message);
			return;
		}
		if (importUrl) {
			setBusy("importing");
			const imported = await call(`${repoPath(owner, name)}/import`, { method: "POST", body: { url: importUrl } });
			if (!imported.ok) {
				setBusy("");
				setError(`${owner}/${name} was created, but the import failed: ${imported.message}`);
				return;
			}
		}
		navigate(hrefFor({ screen: "tree", owner, name, path: "", ref: null }));
	}

	if (session.state !== "admin") {
		return (
			<div className="empty">
				<h1>New repo</h1>
				<p>Creating a repo needs this server's admin token. Paste it with the Admin token button at the top.</p>
			</div>
		);
	}

	return (
		<form className="form-page stack" onSubmit={submit}>
			<h1>New repo</h1>
			<div className="field-row">
				<label className="field">
					<span>Owner</span>
					<input className="input" name="owner" required pattern="[A-Za-z0-9_.\-]{1,64}" autoComplete="off" spellCheck={false} placeholder="acme" />
				</label>
				<span className="field-slash" aria-hidden="true">
					/
				</span>
				<label className="field">
					<span>Name</span>
					<input className="input" name="name" required pattern="[A-Za-z0-9_.\-]{1,64}" autoComplete="off" spellCheck={false} placeholder="shop" />
				</label>
			</div>
			<p className="hint">Letters, digits, dots, dashes and underscores, up to 64 each.</p>
			<label className="field">
				<span>
					Import from <span className="muted">(optional)</span>
				</span>
				<input className="input" name="import" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://github.com/acme/shop.git" />
			</label>
			<p className="hint">Copies every branch and tag from any Git server over HTTPS, up to 48 MiB of Git objects. Leave it empty for an empty repo.</p>
			{error ? <ErrorNotice message={error} /> : null}
			<div className="row-end">
				<button type="submit" className="button" aria-disabled={busy !== ""}>
					{busy === "creating" ? "Creating…" : busy === "importing" ? "Importing…" : "Create repo"}
				</button>
			</div>
		</form>
	);
}
