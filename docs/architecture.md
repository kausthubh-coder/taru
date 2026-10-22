# Architecture

Taru is a Git server built for coding agents. It runs on Cloudflare and stays compatible with Git and GitHub.
This file records the decisions behind it, so you don't reopen them by accident. Product context is in
`docs/product.md`. Research is in `docs/research/`.

## Inspiration: Anthropic's Scion

Anthropic replaced Git internally with Scion ("Redesigning source control",
https://www.anthropic.com/engineering/redesigning-source-control). These are the ideas we take:

1. **Clients are always online, and the server does the heavy work.** The server answers history and blame
   queries, creates commits, and performs merges and rebases. Agents don't need a local clone.
2. **API first.** Every operation the CLI uses is also an API, so a job or agent can work with no checkout.
3. **Content-addressed storage.** File contents live once in blob storage, keyed by hash. That allows caching
   without coordination.
4. **No global merge queue.** Changes land, tests run after the merge, and AI resolves conflicts. A merge
   queue doesn't make sense at agent scale.
5. **Folder-level access control.** This is the basis for private folders inside a public repo.

What we skip: their scale (30,000 merges a day, a 100 GB monorepo, Spanner) and their custom client. Scion's
own advice is that "a git server doesn't have to work the same way as a git client does". So clients keep
using plain `git`, and the server is where we're different.

## Shape

```
git client / agent / browser
        │  HTTPS
        ▼
Worker (worker/index.ts)        routing only
  ├── /<owner>/<repo>.git/...   features/git-http  → forwards to the repo's Durable Object
  ├── /api/repos...             features/repo-store
  ├── /api/waitlist             features/waitlist (D1)
  └── everything else           static assets: the React app (src/, features/*/ui)

RepoObject (one Durable Object per "<owner>/<repo>")
  runs features/git-core next to its storage:
  ├── SQLite: refs, HEAD, commits, trees, small blobs
  └── R2 (BLOBS): large blobs, keyed objects/<oid>
D1 (DB): accounts, repo index, waitlist
```

- **The Git protocol runs inside the RepoObject**, not in the Worker. Negotiation and pack building call the
  store hundreds of times, and inside the object those calls are synchronous SQLite reads, not network
  round trips.
- **`features/git-core` never imports Cloudflare APIs.** It talks to storage through the `Repo` interface in
  `features/git-core/repo.ts`. Tests run it against an in-memory repo and the real `git` binary.
- **Small objects go in SQLite, large blobs in R2.** Most source files are under the threshold, so clones read
  SQLite and make few R2 requests. R2 charges per request. The exact threshold is set in repo-store.

## Import and the GitHub copy

Both run inside the RepoObject with the client half of the protocol (`features/git-core/client.ts`, protocol v0,
plain `fetch`), so GitHub is just another Git server to us.

- **Import** (`POST /api/repos/:owner/:name/import {url}`) fills an empty repo: fetch the remote's `refs/heads/*`
  and `refs/tags/*` in one pack, store the objects in chunks, set the refs, point HEAD where the remote's symref
  points. Only into an empty repo (409 otherwise). `https://` anywhere; `http://` only on localhost, for the fake
  GitHub tests use.
- **The copy** (`PUT /api/repos/:owner/:name/mirror {url}`) is one-way: Taru is the source of truth. Every
  successful `updateRefs`, whoever called it (push, import, the agent API), schedules a Durable Object alarm
  about a second later. The alarm reads the remote's refs, sends the objects it lacks, and makes its
  `refs/heads/*` and `refs/tags/*` equal ours, force-updates and deletes included; `refs/pull/*` and the rest are
  left alone. The push is not atomic: a ref GitHub refuses is reported in the status, the others still land.
  Failures retry with backoff (5 s to 1 h, six retries) and then wait for the next change. Status lives in the
  repo's `meta` table and shows on `GET /api/repos/:owner/:name`.
- **Token:** the `GITHUB_MIRROR_TOKEN` secret (a fine-grained PAT) goes out as HTTP Basic `x-access-token:<token>`,
  only to `github.com`. Unset locally, where the copy goes to `scripts/fake-github.mjs`.

## Limits we accept for now

- Git over HTTPS only. Workers can't accept SSH.
- A single push can be at most 100 MB (the Workers request limit). Bigger repos get imported from GitHub by the
  server, not pushed.
- Request bodies are buffered in memory. That's fine for normal pushes. Streaming comes when a real repo needs it.
- Import and the copy buffer one pack each, capped at 100 MB, inside a Durable Object with 128 MB of memory. A
  repository whose history doesn't fit in one such pack can't be imported or copied yet.
- The server speaks Git protocol v0/v1. Modern clients ask for v2 and fall back cleanly.
- **Auth is temporary.** Creating a repo and pushing need HTTP Basic auth with the password `TARU_ADMIN_TOKEN`.
  Public clone is open. Accounts (Better Auth with GitHub sign-in) replace this in a later step.

## Why Wrangler, not `cf`

Cloudflare's test integration (`@cloudflare/vitest-plugin`) reads only Wrangler config, and the `cf` CLI is
still in beta. When `cf` supports tests, migrating is `cf migrate`.

## Build order

1. Core: create a repo, `git push` / `git clone`, import from GitHub, automatic copy to GitHub.
2. Agent API and MCP server: read, edit, commit and merge without a clone.
3. Private folders and secrets.
4. Review web app.
5. CLI: auto-snapshots, instant agent workspaces.
