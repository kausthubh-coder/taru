// Repo settings: the GitHub copy. Shows where it pushes and how the last push went, and turns it on or off.

import { useEffect, useState, type FormEvent } from "react";
import { call, repoPath, type MirrorState } from "./api.ts";
import { useRepo } from "./repo-context.ts";
import type { Route } from "./routes.logic.ts";
import { useSession } from "./session.ts";
import { ErrorNotice } from "./ui.tsx";

type SettingsRoute = Extract<Route, { screen: "settings" }>;

const STATE_TEXT: Record<MirrorState["status"]["state"], string> = {
	idle: "Waiting for the first change to copy",
	pending: "Copying to GitHub…",
	ok: "Up to date with Taru",
	failed: "The last copy failed",
};

function at(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "never";
}

export function SettingsScreen({ route }: { route: SettingsRoute }) {
	const { owner, name } = route;
	const { repo, reload } = useRepo();
	const session = useSession();
	const mirror = repo.mirror;
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	// While a copy is pending, check again every few seconds so the status settles on screen.
	const pending = mirror?.status.state === "pending";
	useEffect(() => {
		if (!pending) return;
		const timer = window.setInterval(reload, 3000);
		return () => window.clearInterval(timer);
	}, [pending, reload]);

	async function save(url: string | null) {
		if (busy) return;
		setBusy(true);
		setError("");
		const answer = await call(`${repoPath(owner, name)}/mirror`, { method: "PUT", body: { url } });
		setBusy(false);
		if (answer.ok) reload();
		else setError(answer.message);
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void save(String(new FormData(event.currentTarget).get("url") ?? "").trim());
	}

	return (
		<div className="settings stack">
			<section className="stack" aria-labelledby="copy-title">
				<h2 id="copy-title">GitHub copy</h2>
				<p className="muted measure">
					About a second after every change here (a push, an agent commit, a merge), Taru pushes it to this GitHub repo, so its branches and tags match. It goes one way: changes made on GitHub are
					overwritten. The server needs a GitHub token that can push there; see <a href="/docs/github">the docs</a>.
				</p>
				{mirror ? (
					<dl className="facts">
						<div>
							<dt className="label">Copies to</dt>
							<dd>
								<a href={mirror.url.replace(/\.git$/, "")}>{mirror.url}</a>
							</dd>
						</div>
						<div>
							<dt className="label">Status</dt>
							<dd>
								<span className={`dot dot-${mirror.status.state}`} aria-hidden="true" /> {STATE_TEXT[mirror.status.state]}
							</dd>
						</div>
						<div>
							<dt className="label">Last copied</dt>
							<dd>{at(mirror.status.last_success_at)}</dd>
						</div>
						{mirror.status.last_error ? (
							<div>
								<dt className="label">Last error</dt>
								<dd className="error-text">{mirror.status.last_error}</dd>
							</div>
						) : null}
						{mirror.status.next_attempt_at ? (
							<div>
								<dt className="label">Next try</dt>
								<dd>{at(mirror.status.next_attempt_at)}</dd>
							</div>
						) : null}
					</dl>
				) : (
					<p>The GitHub copy is off for this repo.</p>
				)}
				{session.state === "admin" ? (
					<form className="stack" onSubmit={submit}>
						<label className="field">
							<span>{mirror ? "Change the GitHub repo" : "GitHub repo to copy to"}</span>
							<input
								className="input"
								name="url"
								type="url"
								inputMode="url"
								required
								defaultValue={mirror?.url ?? ""}
								autoComplete="off"
								spellCheck={false}
								placeholder="https://github.com/acme/shop.git"
							/>
						</label>
						{error ? <ErrorNotice message={error} /> : null}
						<div className="row-start">
							<button type="submit" className="button" aria-disabled={busy}>
								{busy ? "Saving…" : mirror ? "Save" : "Turn on the GitHub copy"}
							</button>
							{mirror ? (
								<button type="button" className="button button-quiet" onClick={() => void save(null)} aria-disabled={busy}>
									Turn it off
								</button>
							) : null}
						</div>
					</form>
				) : (
					<p className="muted">Changing this needs the admin token.</p>
				)}
			</section>
		</div>
	);
}
