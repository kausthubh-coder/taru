// The web app's frame: header, the admin token control, and the screen for the current URL.

import { useEffect } from "react";
import { CommitScreen, CommitsScreen } from "./history.tsx";
import { useRoute } from "./navigation.ts";
import { EditScreen } from "./editor.tsx";
import { BlobScreen, RepoLayout, TreeScreen } from "./repo.tsx";
import { NewRepoScreen, ReposScreen } from "./repos.tsx";
import { hrefFor, type Route } from "./routes.logic.ts";
import { checkSavedToken } from "./session.ts";
import { SettingsScreen } from "./settings.tsx";
import { TokenButton } from "./token.tsx";
import { Link } from "./ui.tsx";

function titleFor(route: Route): string {
	switch (route.screen) {
		case "repos":
			return "Repositories";
		case "new-repo":
			return "New repo";
		case "not-found":
			return "Not found";
		case "tree":
			return route.path ? `${route.path} · ${route.owner}/${route.name}` : `${route.owner}/${route.name}`;
		case "blob":
		case "edit":
			return `${route.path} · ${route.owner}/${route.name}`;
		case "new-file":
			return `New file · ${route.owner}/${route.name}`;
		case "commits":
			return `Commits · ${route.owner}/${route.name}`;
		case "commit":
			return `${route.rev.slice(0, 7)} · ${route.owner}/${route.name}`;
		case "settings":
			return `Settings · ${route.owner}/${route.name}`;
	}
}

function Screen({ route }: { route: Route }) {
	switch (route.screen) {
		case "repos":
			return <ReposScreen />;
		case "new-repo":
			return <NewRepoScreen />;
		case "not-found":
			return (
				<div className="empty">
					<h1>Nothing here</h1>
					<p>This address isn't a page in the app.</p>
					<Link className="button" href={hrefFor({ screen: "repos" })}>
						See every repo
					</Link>
				</div>
			);
		default:
			return (
				<RepoLayout route={route}>
					{route.screen === "tree" ? <TreeScreen route={route} /> : null}
					{route.screen === "blob" ? <BlobScreen route={route} /> : null}
					{route.screen === "edit" || route.screen === "new-file" ? <EditScreen route={route} /> : null}
					{route.screen === "commits" ? <CommitsScreen route={route} /> : null}
					{route.screen === "commit" ? <CommitScreen route={route} /> : null}
					{route.screen === "settings" ? <SettingsScreen route={route} /> : null}
				</RepoLayout>
			);
	}
}

export function App() {
	const route = useRoute();
	useEffect(() => {
		document.title = `${titleFor(route)} · Taru`;
	}, [route]);
	useEffect(() => {
		void checkSavedToken();
	}, []);
	return (
		<>
			<a className="skip-link" href="#main">
				Skip to content
			</a>
			<header className="app-header">
				<div className="wrap app-header-row">
					<a className="logo" href="/" aria-label="Taru, home">
						<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
							<g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
								<path d="M11 3.5V21a6 6 0 0 0 6 6h5" />
								<path d="M5 12h6c6 0 9-2 10.5-6" />
							</g>
							<circle className="logo-node" cx="23.5" cy="6" r="4.25" />
						</svg>
					</a>
					<nav className="app-nav" aria-label="App">
						<Link href="/app" aria-current={route.screen === "repos" ? "page" : undefined}>
							Repositories
						</Link>
						<a href="/docs">Docs</a>
					</nav>
					<TokenButton />
				</div>
			</header>
			<main id="main" className="wrap app-main">
				<Screen route={route} />
			</main>
		</>
	);
}
