import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	// PORT comes from .env.local (written by scripts/setup.mjs) so parallel worktrees don't collide.
	const port = Number(process.env.PORT || loadEnv(mode, process.cwd(), "").PORT) || 5173;
	return {
		plugins: [react(), cloudflare()],
		server: { port, strictPort: true },
	};
});
