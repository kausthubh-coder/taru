// In-app navigation without a router library: the location is an external store that pushState and the back
// button update, and screens read the parsed route from it.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { call, type ApiAnswer } from "./api.ts";
import { parseRoute, type Route } from "./routes.logic.ts";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("popstate", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("popstate", listener);
	};
}

function snapshot(): string {
	return location.pathname + location.search;
}

export function navigate(href: string, options: { replace?: boolean } = {}): void {
	if (options.replace) history.replaceState(null, "", href);
	else history.pushState(null, "", href);
	// A new screen starts at the top, like a page load.
	if (!options.replace) window.scrollTo(0, 0);
	for (const listener of listeners) listener();
}

export function useRoute(): Route {
	const current = useSyncExternalStore(subscribe, snapshot);
	const [pathname, search = ""] = current.split("?");
	return parseRoute(pathname, search ? `?${search}` : "");
}

export type Loaded<T> = { state: "loading" } | { state: "error"; status: number; error: string; message: string } | { state: "ok"; data: T };

/** GETs `path` whenever it changes; `reload` fetches it again and keeps showing the old answer until the new one
 *  arrives. A null path loads nothing. An answer for a path the screen has left is dropped, so a quick click
 *  through folders never shows the wrong one. */
export function useApi<T>(path: string | null): Loaded<T> & { reload: () => void } {
	const [version, setVersion] = useState(0);
	const [result, setResult] = useState<{ path: string | null; value: Loaded<T> }>({ path: null, value: { state: "loading" } });
	const request = path === null ? null : { path, version };
	const requestKey = request ? `${request.version}:${request.path}` : null;
	useEffect(() => {
		if (requestKey === null) return;
		const target = requestKey.slice(requestKey.indexOf(":") + 1);
		let live = true;
		void call<T>(target).then((answer: ApiAnswer<T>) => {
			if (!live) return;
			setResult({ path: target, value: answer.ok ? { state: "ok", data: answer.data } : { state: "error", status: answer.status, error: answer.error, message: answer.message } });
		});
		return () => {
			live = false;
		};
	}, [requestKey]);
	const reload = useCallback(() => setVersion((v) => v + 1), []);
	const value: Loaded<T> = result.path === path ? result.value : { state: "loading" };
	return { ...value, reload };
}
