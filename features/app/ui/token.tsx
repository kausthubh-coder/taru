// The admin token control in the header. Until accounts exist, pasting the server's admin token is what turns on
// writing in the app: new repos, commits, the GitHub copy.

import { useRef, useState, type FormEvent } from "react";
import { signIn, signOut, useSession } from "./session.ts";

export function TokenButton() {
	const session = useSession();
	const dialog = useRef<HTMLDialogElement>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const token = String(new FormData(event.currentTarget).get("token") ?? "").trim();
		if (!token) {
			setError("Paste the token first.");
			return;
		}
		setBusy(true);
		const result = await signIn(token);
		setBusy(false);
		if (result.ok) {
			setError("");
			dialog.current?.close();
		} else setError(result.message);
	}

	if (session.state === "admin") {
		return (
			<div className="token-state">
				<span className="status" data-status="today">
					Admin
				</span>
				<button type="button" className="button-small" onClick={signOut}>
					Forget token
				</button>
			</div>
		);
	}

	return (
		<>
			<button type="button" className="button-small" onClick={() => dialog.current?.showModal()} disabled={session.state === "checking"}>
				{session.state === "checking" ? "Checking token…" : "Admin token"}
			</button>
			<dialog ref={dialog} className="dialog" aria-labelledby="token-title" onClose={() => setError("")}>
				<form method="dialog" onSubmit={submit} className="stack">
					<h2 id="token-title">Paste the admin token</h2>
					<p className="muted">
						Reading needs nothing. Creating repos, committing and the GitHub copy need this server's admin token, the <code>TARU_ADMIN_TOKEN</code> secret. It stays in this
						browser and is sent only to this server.
					</p>
					<label className="field">
						<span>Admin token</span>
						<input className="input" name="token" type="password" autoComplete="current-password" spellCheck={false} aria-describedby="token-error" required />
					</label>
					<p id="token-error" className="field-error" aria-live="polite">
						{error}
					</p>
					<div className="row-end">
						<button type="button" className="button button-quiet" onClick={() => dialog.current?.close()}>
							Cancel
						</button>
						<button type="submit" className="button" aria-disabled={busy}>
							{busy ? "Checking…" : "Use this token"}
						</button>
					</div>
				</form>
			</dialog>
		</>
	);
}
