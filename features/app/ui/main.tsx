// The web app at /app: browse, edit and review the repos on this server. The Worker serves app/index.html for
// every /app path; App renders the screen for the current URL.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
