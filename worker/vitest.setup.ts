// Runs before each worker test file, inside workerd: applies the D1 migrations from migrations/ to the DB binding,
// the same files `wrangler d1 migrations apply` uses. vitest.config.ts reads them with readD1Migrations() and
// passes them in as the TEST_MIGRATIONS binding, which exists only in tests.
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] };
await applyD1Migrations(env.DB, TEST_MIGRATIONS);
