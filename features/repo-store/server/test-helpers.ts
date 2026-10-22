// For *.worker.test.ts files: the D1 schema from migrations/, applied to the test database.
// Only the vitest config can wire this up automatically (readD1Migrations + setupFiles); until then each
// worker test file calls applyRepoMigrations() in beforeAll.

/// <reference types="vite/client" />

import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import repos from "../../../migrations/0001_repos.sql?raw";

export async function applyRepoMigrations(): Promise<void> {
	await applyD1Migrations(env.DB, [{ name: "0001_repos.sql", queries: splitStatements(repos) }]);
}

function splitStatements(sql: string): string[] {
	return sql
		.split(";")
		.map((statement) =>
			statement
				.split("\n")
				.filter((line) => !line.trim().startsWith("--"))
				.join("\n")
				.trim(),
		)
		.filter((statement) => statement.length > 0);
}

/** A Basic auth header whose password is the admin token from .dev.vars. */
export function adminAuth(): string {
	return `Basic ${btoa(`admin:${env.TARU_ADMIN_TOKEN}`)}`;
}
