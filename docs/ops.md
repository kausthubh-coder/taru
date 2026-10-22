# Production operations

Nothing here runs without my explicit go.

- Deploy: `bun run deploy` (builds, then `wrangler deploy`). Wrangler creates the R2 bucket and D1 database on first deploy if they don't exist.
- Apply D1 migrations to production: `bunx wrangler d1 migrations apply taru --remote`
- Set the admin token: `bunx wrangler secret put TARU_ADMIN_TOKEN`
- Set the GitHub copy token: `bunx wrangler secret put GITHUB_MIRROR_TOKEN`. A fine-grained PAT with "Contents: read and write" on the repos Taru copies to. It is only ever sent to github.com.
- Live logs: `bunx wrangler tail taru`
