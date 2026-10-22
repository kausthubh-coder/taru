import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	// PORT comes from .env.local (written by scripts/setup.mjs) so parallel worktrees don't collide.
	const port = Number(process.env.PORT || loadEnv(mode, process.cwd(), "").PORT) || 5173;
	return {
		// The Worker debugger port defaults to 9231 for every checkout, so a second dev server fails to start.
		// TARU_STATE_DIR lets the verify skill run against a throwaway local backend instead of .wrangler/state.
		plugins: [
			react(),
			cloudflare({
				inspectorPort: port + 10000,
				persistState: process.env.TARU_STATE_DIR ? { path: process.env.TARU_STATE_DIR } : true,
			}),
		],
		server: { port, strictPort: true },
	};
});
