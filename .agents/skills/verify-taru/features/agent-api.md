# Agent API

Read, commit and merge through JSON over HTTP, with no clone. What matters: a change made here shows up in `git pull` byte for byte.

## Sub-features

- `agent-read`: `GET /api/repos/:owner/:name/tree?ref=&path=` lists a folder; `GET .../file?ref=&path=` returns one file (`encoding` is `utf-8` or `base64`). Public. `ref` is a branch, tag, full ref or commit oid; default is HEAD's branch.
- `agent-commit`: `POST .../commits {branch, expected_head, message, author?, changes}` makes one commit. `expected_head` is the branch's current oid (compare-and-swap) or `null` to create the branch (from `start_rev`, or orphan). A change is `{path, content}`, `{path, content_base64}` or `{path, delete: true}`, with optional `mode` `100644`/`100755`/`120000`. Admin token required. 201 with `{branch, commit, tree, parent}`; 409 `head_mismatch` with the current `head`.
- `agent-merge`: `POST .../merges {into, from, message?, expected_head?, dry_run?}`. 200 with `result` `up_to_date`, `fast_forward` or `merged`; 409 `merge_conflict` with `conflicts: [{path, kind, base, ours, theirs, conflict_text?}]` and nothing written.
- `agent-errors`: 400 `invalid_request` names the field (bad path, missing `expected_head`, two ways to give content); 401 `unauthorized` with `WWW-Authenticate: Basic`; 404 `not_found` for repo, ref or path; 413 `too_large` over 16 MiB.

## How to get to it (user POV)

- HTTP from an agent or curl: `curl -s <url>/api/repos/<owner>/<repo>/file?path=README.md`
- `curl -s -u x:$TOKEN -X POST <url>/api/repos/<owner>/<repo>/commits -H 'content-type: application/json' -d '{"branch":"main","expected_head":"<oid>","message":"edit","changes":[{"path":"README.md","content":"# hi\n"}]}'`

## Driving it with verify.mjs

Preconditions: baseline; git on PATH.

- **Full flow.** `node .agents/skills/verify-taru/verify.mjs agent-api`. Creates `verify/agent-<time>`, pushes two commits with git, clones, reads a tree and a file, commits through the API (nested edit, binary add, delete, new folder, executable), pulls in the clone and checks HEAD and every changed path's bytes and mode, runs `fsck`, checks the CAS 409, creates a branch via the API, does a three-way merge (pull shows two parents), a conflicting merge (409 report, `ls-remote` unchanged), then a `git push` on top of the API commits and an API commit on top of that push. A pass ends with `PASS; transcript in .../agent-api.md`.
- **Evidence.** `agent-api.md` is the transcript; `agent-api-commit.json` is the commit request and response.

## Gotchas

- `expected_head` is required on every commit; read the tree or file first to get the commit oid. Without it the answer is 400, not a commit on a guessed head.
- Branch names are short (`main`, `feature/x`) or full (`refs/heads/main`); tags can't be committed to.
- Deleting a path that is a folder removes the whole folder.
- An HTML `fetch failed` page instead of JSON on a POST means a route answered before reading the request body (workerd then drops the connection and the dev proxy's next pooled request fails). The write routes read the bounded body before the auth check for this reason; keep it that way.
