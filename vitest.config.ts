import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Two kinds of tests:
//   *.test.ts         run in Node: pure logic, and git-core end-to-end tests that drive the real `git` binary.
//   *.worker.test.ts  run inside workerd with real bindings (Durable Objects, R2, D1) from wrangler.jsonc.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "node",
					environment: "node",
					include: ["features/**/*.test.ts", "shared/**/*.test.ts", "scripts/**/*.test.ts"],
					exclude: ["**/*.worker.test.ts", "**/node_modules/**"],
					testTimeout: 30_000,
				},
			},
			{
				plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
				test: {
					name: "worker",
					include: ["features/**/*.worker.test.ts", "worker/**/*.worker.test.ts"],
				},
			},
		],
	},
});
