import { join } from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Two kinds of tests:
//   *.test.ts         run in Node: pure logic, and git-core end-to-end tests that drive the real `git` binary.
//   *.worker.test.ts  run inside workerd with real bindings (Durable Objects, R2, D1) from wrangler.jsonc.
//                     worker/vitest.setup.ts applies the D1 migrations first, from the TEST_MIGRATIONS binding.
export default defineConfig(async () => {
	const migrations = await readD1Migrations(join(import.meta.dirname, "migrations"));
	return {
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
					plugins: [
						cloudflareTest({
							wrangler: { configPath: "./wrangler.jsonc" },
							miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
						}),
					],
					test: {
						name: "worker",
						include: ["features/**/*.worker.test.ts", "worker/**/*.worker.test.ts"],
						setupFiles: ["./worker/vitest.setup.ts"],
					},
				},
			],
		},
	};
});
