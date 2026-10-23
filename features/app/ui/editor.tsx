// Edit a file or add one, then commit it, through the same commit API agents use. The commit names the branch
// head the file was read at, so if anyone moved the branch meanwhile nothing is overwritten.

import { useState, type FormEvent } from "react";
import { call, query, repoPath, type CommitResult, type FileResult, type TreeResult } from "./api.ts";
import { navigate, useApi } from "./navigation.ts";
import { currentRef, isBranch, useRepo } from "./repo-context.ts";
import { hrefFor, type Route } from "./routes.logic.ts";
import { useSession } from "./session.ts";
import { ErrorNotice, Link, Load } from "./ui.tsx";

type EditRoute = Extract<Route, { screen: "edit" | "new-file" }>;

export function EditScreen({ route }: { route: EditRoute }) {
	const { owner, name } = route;
	const { repo, reload } = useRepo();
	const session = useSession();
	const refName = currentRef(repo, route.ref);
	const empty = !(`refs/heads/${refName}` in repo.refs);
	// Editing reads the file; adding reads the folder, for the head commit to build on.
	const source = route.screen === "edit" ? `${repoPath(owner, name)}/file${query({ ref: refName, path: route.path })}` : empty ? null : `${repoPath(owner, name)}/tree${query({ ref: refName })}`;
	const loaded = useApi<FileResult | TreeResult>(source);

	if (session.state !== "admin") {
		return <ErrorNotice message="Editing needs this server's admin token. Paste it with the Admin token button at the top." />;
	}
	if (!isBranch(repo, refName)) {
		return <ErrorNotice message={`${refName} isn't a branch. Pick a branch to commit to.`} />;
	}
	if (route.screen === "new-file" && empty) {
		return <Editor route={route} refName={refName} head={null} initial="" onDone={reload} />;
	}
	return (
		<Load loaded={loaded} notFound={<p className="state-line">Nothing at {route.screen === "edit" ? route.path : "this folder"} on {refName}.</p>}>
			{(data) => {
				if ("encoding" in data && data.encoding !== "utf-8") return <ErrorNotice message="This is a binary file. Change it with git or the API." />;
				return <Editor key={data.commit} route={route} refName={refName} head={data.commit} initial={"content" in data ? data.content : ""} onDone={reload} />;
			}}
		</Load>
	);
}

function Editor({ route, refName, head, initial, onDone }: { route: EditRoute; refName: string; head: string | null; initial: string; onDone: () => void }) {
	const { owner, name } = route;
	const [content, setContent] = useState(initial);
	const [path, setPath] = useState(route.screen === "edit" ? route.path : route.dir ? `${route.dir}/` : "");
	const [message, setMessage] = useState("");
	const [error, setError] = useState<{ text: string; moved: boolean } | null>(null);
	const [busy, setBusy] = useState(false);
	const editing = route.screen === "edit";
	const unchanged = editing && content === initial;

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (busy) return;
		if (unchanged) {
			setError({ text: "Nothing changed yet, so there's nothing to commit.", moved: false });
			return;
		}
		const target = path.trim().replace(/^\/+/, "");
		if (!target || target.endsWith("/")) {
			setError({ text: "Give the file a name, like src/notes.md.", moved: false });
			return;
		}
		setBusy(true);
		setError(null);
		const answer = await call<CommitResult>(`${repoPath(owner, name)}/commits`, {
			method: "POST",
			body: {
				branch: refName,
				expected_head: head,
				message: message.trim() || `${editing ? "Update" : "Add"} ${target}`,
				author: { name: "Taru web app", email: "app@taru.invalid" },
				changes: [{ path: target, content }],
			},
		});
		setBusy(false);
		if (answer.ok) {
			onDone();
			navigate(hrefFor({ screen: "blob", owner, name, path: target, ref: route.ref }));
			return;
		}
		if (answer.error === "head_mismatch") {
			setError({ text: `Someone changed ${refName} after you opened this. Nothing was saved. Copy your text, reload to get their version, and make your edit again.`, moved: true });
		} else setError({ text: answer.message, moved: false });
	}

	return (
		<form className="editor stack" onSubmit={submit}>
			<label className="field">
				<span>{editing ? "File" : "New file"}</span>
				<input className="input input-mono" value={path} onChange={(e) => setPath(e.target.value)} readOnly={editing} required autoComplete="off" spellCheck={false} placeholder="src/notes.md" />
			</label>
			<label className="field">
				<span className="sr-only">Content</span>
				<textarea className="input editor-text" value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={24} />
			</label>
			<label className="field">
				<span>Commit message</span>
				<input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`${editing ? "Update" : "Add"} ${path || "the file"}`} autoComplete="off" />
			</label>
			{error ? (
				<div className="notice notice-error" role="alert">
					<p>{error.text}</p>
					{error.moved ? (
						<button type="button" className="button-small" onClick={() => location.reload()}>
							Reload
						</button>
					) : null}
				</div>
			) : null}
			<div className="row-end">
				<Link className="button button-quiet" href={editing ? hrefFor({ screen: "blob", owner, name, path: route.path, ref: route.ref }) : hrefFor({ screen: "tree", owner, name, path: route.screen === "new-file" ? route.dir : "", ref: route.ref })}>
					Cancel
				</Link>
				<button type="submit" className="button" aria-disabled={busy || unchanged}>
					{busy ? "Committing…" : `Commit to ${refName}`}
				</button>
			</div>
		</form>
	);
}
