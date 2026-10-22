import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	// PORT comes from .env.local (written by scripts/setup.mjs) so parallel worktrees don't collide.
	const port = Number(process.env.PORT || loadEnv(mode, process.cwd(), "").PORT) || 5173;
	return {
		// The Worker debugger port defaults to 9231 for every checkout, so a second dev server fails to start.
		plugins: [react(), cloudflare({ inspectorPort: port + 10000 })],
		server: { port, strictPort: true },
	};
});
