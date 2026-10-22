# Taru verification map

The maintained source for verifying Taru's user-facing behavior. Read this, then the feature file you need.

## Baseline preconditions

- `node .agents/skills/verify-taru/verify.mjs launch` printed `ready:` and `doctor` reports healthy.
- The backend is the throwaway `.verify/state`, fresh per launch: no repos, no waitlist rows.
- The admin token is `TARU_ADMIN_TOKEN` in `.dev.vars`. Git push uses it as the HTTP Basic password (any username).
- Never drive an instance this run didn't start (`bun run dev`, someone else's port).

## Proof and skip reporting

- Capture the action and the resulting state; for mutations, a second read-only view (D1 row, `git ls-remote`, a fresh clone).
- Report an unreachable path with the command you ran and the unmet precondition. Don't report a skipped entry point as verified through another one.

## Features

| Feature | File | Entry points |
|---|---|---|
| Landing page | `landing.md` | Browser `/` |
| Waitlist | `waitlist.md` | Hero form, bottom form, no-JS form post, `POST /api/waitlist` |
| Repos API | `repos-api.md` | `POST /api/repos`, `GET /api/repos`, `GET /api/repos/:owner/:name` |
| Git push and clone | `git-push-clone.md` | Real `git` client over smart HTTP |
| Agent API | `agent-api.md` | `GET .../tree`, `GET .../file`, `POST .../commits`, `POST .../merges` under `/api/repos/:owner/:name` |
| MCP server | `mcp.md` | `POST /mcp` (Streamable HTTP), any MCP client |
