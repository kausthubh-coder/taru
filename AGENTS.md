# Taru

Taru is source control built for coding agents: a Git-compatible server on Cloudflare. Agents read, write and
merge code through an API without cloning, `git clone`/`git push` keep working, and every push is copied to
GitHub. Users are small, agent-heavy teams. What they care about most is that a change made through Taru shows
up correctly in Git and on GitHub. Stack: Bun, TypeScript, Cloudflare Workers + Durable Objects + R2 + D1,
React with Vite, Vitest. Open source under AGPL-3.0.

## Words we use

- **you**: the agent reading this file.
- **me**: the developer you are working for.
- **user**: a person or agent using Taru. Not me.
- **object / oid**: a Git object (commit, tree, blob, tag) and its 40-hex SHA-1 id.
- **ref**: a named pointer like `refs/heads/main`.
- **pack**: Git's bundle of compressed objects that clients send and receive.
- **upload-pack / receive-pack**: the server side of clone/fetch, and of push.
- **RepoObject**: the Durable Object that owns one repository's storage and runs the Git protocol.
- **GitHub copy (mirror)**: the GitHub repo Taru pushes to automatically.

## Map

| Where | What lives there |
|---|---|
| `worker/index.ts` | Worker entry: routing only |
| `features/git-core/` | The Git engine: objects, packs, smart HTTP protocol. No Cloudflare imports; storage through `repo.ts` |
| `features/repo-store/server/` | `RepoObject` (SQLite + R2 storage implementing `Repo`) and `/api/repos` |
| `features/git-http/server/` | `/<owner>/<repo>.git/...` endpoints, forwarded to the RepoObject |
| `features/waitlist/server/` | `/api/waitlist`, stored in D1 |
| `features/landing/ui/` | The landing page |
| `src/` | React entry, thin: renders features |
| `migrations/` | D1 migrations |
| `scripts/` | `setup.mjs`, `doctor.mjs`, `remove-worktree.mjs`, `cloud.mjs` |
| `wrangler.jsonc` | Bindings: `REPO`, `BLOBS`, `DB`. Run `bun run cf-typegen` after changing it |

Each feature lives in one folder. Server code goes in `features/<name>/server/`, browser code in
`features/<name>/ui/`, pure logic in `*.logic.ts`. Shared code goes in `shared/` only when two features really
use it. No barrel `index.ts` files.

Deeper docs: `docs/architecture.md` (decisions, limits, Scion ideas), `docs/product.md` (pitch, problems,
deadlines), `docs/research/`.

## Commands

- Install: `bun install`
- Setup a fresh worktree: `bun run setup` (installs deps, copies `.dev.vars` from the main checkout, claims a port into `.env.local`, links skills, applies local D1 migrations, runs the doctor)
- Doctor: `bun run doctor` (is this checkout healthy? run it first when anything looks off)
- Remove a worktree: `bun run remove-worktree <path>` (stops its processes, removes the skills junction, then the worktree)
- Dev: `bun run dev` (port from `.env.local`; ready when Vite prints `Local: http://localhost:<port>/`)
- Test one file: `bunx vitest run <path>`
- Typecheck and lint: `bun run typecheck` and `bun run lint`
- Full check (CI runs this; run it only when asked): `bun run check`

Tests: `*.test.ts` run in Node (pure logic, and git-core end-to-end tests that drive the real `git` binary).
`*.worker.test.ts` run inside workerd with real bindings.

## Start and ship

- Every task in a new worktree starts with the `worktree-taru` skill. It runs setup and the doctor.
- Helpers get their own worktree. Never two agents in one checkout, and never edit the main checkout.
- Ship only with the `ship-taru` skill, and only when I say ship, deploy or release.

## Proving a change works

- Done means you saw it work, not that it compiles. For Git features, that means the real `git` binary cloned,
  pushed or fetched against the code and the result matched byte for byte.
- Use the `verify-taru` skill to launch, drive and capture evidence. If it doesn't exist yet, run `/create-verification-skill`.
- Test with real-shaped repos: several commits, nested folders, binary files, an incremental push. One file in an empty repo is a bad test.
- A test calls the code the way its users do and asserts the exact result.
- Never edit or delete a test to make it pass. If the test is wrong, say so and explain why.
- A skipped check is not a pass. Report what you ran, what you saw, and what you didn't check.

## Working with me

- A question gets an answer, not an action.
- When I ask for a plan, plan. Don't start building until I say go.
- Extend what exists. Propose a rewrite only in a plan, and wait.
- Edit files with your edit tool, not shell one-liners (Windows quoting breaks them).

## How we write code

- Boring and explicit over clever. No hidden wiring or magic strings.
- One way to do each thing. Finish migrations and delete the old way in the same change.
- A wrapper with one caller is just another file to open. Inline it.
- Names you can grep. Comments say why, never what.
- Smallest change that solves the real problem.
- Workers: stream or cap request bodies, never buffer unbounded data; `crypto.getRandomValues` for tokens; no module-level request state; read bindings from `env`/`this.env`, typed from `worker-configuration.d.ts`.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| Strict TypeScript, no `any` | `tsconfig.*.json` `strict`, oxlint `no-explicit-any` |
| git-core has no Cloudflare imports | `features/git-core` is typechecked without DOM; review (nothing automatic yet) |
| No import cycles | oxlint `import/no-cycle` |
| Lint warnings fail | `oxlint --deny-warnings` |
| LF line endings | `.gitattributes` |

When I correct you for the same thing twice, add the rule here and make something enforce it (`/correct`).

## Safety

- Production needs my explicit go: deploys, `--remote` D1 commands, secrets, releases. Prod commands live in `docs/ops.md`.
- Local dev uses Wrangler's local Durable Objects, R2 and D1 under `.wrangler/`, never production.
- Stop only processes you started, by the PID you captured. Never kill by name or port.
- No secrets in code, logs, screenshots or commits. Local secrets live in `.dev.vars` (gitignored).
- Git: open a PR and wait for CI and my review. Before the GitHub repo exists, commit on a branch and I merge.

## Cloud sessions

Cloud threads (Claude Code on the web, Codex Cloud) run `scripts/cloud.mjs` at session start (`.claude/settings.json`
hook; Codex: `CLOUD=1 node scripts/cloud.mjs`). It loads my global skills, installs bun if missing, and runs setup.
- Works there: setup, `bun run check` (including git-core end-to-end tests), `bun run dev` with local bindings.
- Only on my machine: deploys and anything needing my Cloudflare login.
- Env vars the cloud environment needs: none yet.
