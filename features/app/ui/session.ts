// Whether this browser holds a working admin token. Writes (new repo, commit, the GitHub copy) show only when it
// does. A saved token is checked once on load, so a token changed on the server shows as signed out.

import { useSyncExternalStore } from "react";
import { call, saveToken, savedToken } from "./api.ts";

export type Session = { state: "checking" } | { state: "admin" } | { state: "reader" };

let session: Session = savedToken() ? { state: "checking" } : { state: "reader" };
const listeners = new Set<() => void>();

function set(next: Session): void {
	session = next;
	for (const listener of listeners) listener();
}

export function useSession(): Session {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => session,
	);
}

/** Checks `token` with the server and keeps it only if it's the admin token. */
export async function signIn(token: string): Promise<{ ok: true } | { ok: false; message: string }> {
	const answer = await call<{ admin: boolean }>("/api/session", { token });
	if (!answer.ok) return { ok: false, message: answer.message };
	if (!answer.data.admin) return { ok: false, message: "That isn't this server's admin token." };
	saveToken(token);
	set({ state: "admin" });
	return { ok: true };
}

export function signOut(): void {
	saveToken(null);
	set({ state: "reader" });
}

export async function checkSavedToken(): Promise<void> {
	const token = savedToken();
	if (!token) return;
	const answer = await call<{ admin: boolean }>("/api/session", { token });
	if (answer.ok && answer.data.admin) set({ state: "admin" });
	else if (answer.ok) signOut();
	// A network error keeps the token: it may work once the connection is back.
	else set({ state: "reader" });
}
