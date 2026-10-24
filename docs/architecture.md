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

## Agent API and MCP

Scion's second idea, applied: an agent edits a repo through the server, with no clone. Both surfaces run
the same four operations (`features/git-core/operations.ts`) inside the RepoObject, so the storage calls
stay local and ref writes go through `updateRefs` like a push does (which is also where the GitHub copy
hooks in).

- **REST** (`features/agent-api/server/routes.ts`): `GET /api/repos/:owner/:name/tree?ref&path`,
  `GET .../file?ref&path`, `POST .../commits`, `POST .../merges`. Reads are public like clone; writes need
  the admin token like push. Errors are `{error: <code>, message}` so an agent can branch on the code.
- **MCP** (`features/agent-api/server/mcp.ts`): `POST /mcp`, Streamable HTTP, stateless JSON responses, no
  sessions or SSE. Hand-rolled JSON-RPC (initialize, ping, tools/list, tools/call, notifications) instead of
  the SDK's transport, which is built around sessions and streams. Tools: `list_repos`, `read_tree`,
  `read_file`, `read_log`, `read_commit`, `commit_changes`, `merge_branches`.
- **History** (`features/git-core/history.ts`): `GET .../commits` walks parents newest committer date first, like
  `git log` (equal dates keep the order reached), paged with `limit`/`skip`. `GET .../commits/<rev>` diffs a commit
  against its first parent, like GitHub: a recursive tree diff in git's tree order, then a Myers line diff per text
  file as unified hunks with three lines of context. Binary files (a NUL in the first 8000 bytes) and files over
  1 MiB get no patch; the list stops at 300 files and patches at 2 MiB per commit. The Node tests check order,
  files, `--numstat` counts and that `git apply` of the patches rebuilds the commit's tree. On a big rewrite the
  counts can differ from git's by a line or two: git's xdiff skips very common lines (`};`, blank lines) when
  matching, ours finds the longest match. Both patches apply and rebuild the same file (checked on chalk/chalk).

## Web app, docs and llms.txt

- **The app** (`features/app/ui/`) is a React SPA over the same public API agents use; the Worker serves its shell
  for every `/app` path (`run_worker_first`), and it routes in the browser with `pushState`. Refs go in `?ref=`
  because branch names have slashes. Writes use the admin token pasted into the browser (localStorage, checked
  with `GET /api/session`) until accounts exist.
- **Docs** are Markdown in `features/docs/content/`, rendered on request by the Worker into an HTML shell built by
  Vite (fetched through the `ASSETS` binding, so its hashed CSS link is right in dev and production). The same
  files are served as `.md`, indexed in `/llms.txt` and joined in `/llms-full.txt`, so the human and agent docs
  can't drift. `{{origin}}` becomes the URL the reader reached the server on.
- **One Markdown renderer** (`shared/markdown.ts`, marked) for docs and READMEs: raw HTML is escaped and only
  http(s), mailto and relative URLs survive, because a README in the app is untrusted input.
- **Commits are compare-and-swap.** Every commit carries `expected_head`, the branch's current commit (or
  `null` to create the branch). A stale head is a 409 with the current one: the agent reads again and retries.
  No "last write wins", no lock. The server builds the blobs, trees and commit itself; a 100755 or symlink
  entry is a `mode` on the change.
- **Merge semantics.** `from` already in `into`: `up_to_date`. `into` an ancestor of `from`: fast-forward,
  no new commit. Otherwise a three-way merge: the merge base is the common ancestor no other common ancestor
  descends from (criss-cross histories take the first one found; git would merge the bases recursively),
  trees merge entry by entry, and a text file changed on both sides goes through diff3 (Myers diffs against
  the base, chunks taken from whichever side changed them, touching changes conflict, as in git). A clean
  merge is a commit with two parents. Any conflict means nothing is written and the answer is a 409 report:
  per path, the kind (`content`, `binary`, `symlink`, `add/add`, `modify/delete`, `mode`, `file/directory`),
  the base/ours/theirs blob ids, and for text the file with `<<<<<<<` markers. Resolution is a normal commit
  on one of the branches, then merge again. Clean merges match `git merge-tree --write-tree`; the Node tests
  check that against the real binary.

## Limits we accept for now

- Git over HTTPS only. Workers can't accept SSH.
- A single push can be at most 100 MB (the Workers request limit). Bigger repos get imported from GitHub by the
  server, not pushed.
- Request bodies are buffered in memory. That's fine for normal pushes. Streaming comes when a real repo needs it.
- Import and the copy hold all the objects they move in memory, inside a Durable Object with 128 MB. The pack is
  not the limit: GitHub's 11 MB pack of expressjs/express unpacks to 165 MB of objects, and the pack we push has no
  deltas and is copied a few times while it's built. So both stop at 48 MiB of objects (`MAX_SYNC_OBJECT_BYTES`)
  with a 413, and the copy marks itself failed instead of retrying. Measured in Node: mirroring express needed a
  52 MB request and peaked at 660 MB. Bigger repos need streaming packs with deltas, which aren't built yet.
- `git push` (receive-pack) has no such cap yet: a 100 MB push can unpack to far more than 128 MB. Locally it works
  (workerd doesn't enforce the limit); in production it would fail. Same fix: streaming.
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
4. Review web app. A first version is at `/app`: browse, history, diffs, edit and commit, the GitHub copy.
   Still to come: comments, review requests, side-by-side diffs.
5. CLI: auto-snapshots, instant agent workspaces.
