# GitHub copy (mirror)

Taru is the source of truth; GitHub gets an automatic one-way copy. After any successful ref change (a `git push`, an import, the agent API) the repo's Durable Object schedules an alarm that pushes `refs/heads/*` and `refs/tags/*` to the mirror URL, including force-updates and deletes. Other remote refs (`refs/pull/*`) are never touched.

## Sub-features

- `mirror-config`: `PUT /api/repos/:owner/:name/mirror {url}` (admin) turns the copy on and pushes right away; `{url: null}` turns it off. `GET /api/repos/:owner/:name` shows `mirror: {url, status}` or `mirror: null`.
- `mirror-push`: a push to Taru shows up on the copy within a few seconds, byte for byte.
- `mirror-force-delete`: a force-push and a branch or tag delete on Taru happen on the copy too.
- `mirror-status`: `status` has `state` (`idle`, `pending`, `ok`, `failed`), `attempts`, `last_attempt_at`, `last_success_at`, `last_error`, `next_attempt_at`, `last_pushed_refs`. Failures retry with backoff (5 s, 30 s, 2 min, 10 min, 30 min, 1 h), then `failed` until the next ref change.
- `mirror-auth`: the Worker secret `GITHUB_MIRROR_TOKEN` (a fine-grained PAT with contents read and write on the target repo) is sent as HTTP Basic `x-access-token:<token>`, only to `github.com`.

## How to get to it (user POV)

- Set: `curl -u x:$TOKEN -X PUT <url>/api/repos/<owner>/<name>/mirror -H "content-type: application/json" -d '{"url":"https://github.com/<o>/<r>.git"}'`
- Then `git push` to Taru as usual, and `curl <url>/api/repos/<owner>/<name>` to read the status.

## Driving it with verify.mjs

Preconditions: baseline; git on PATH. No GitHub token is needed: the copy goes to a local fake GitHub.

- **End to end.** `node .agents/skills/verify-taru/verify.mjs mirror`. It starts `scripts/fake-github.mjs` (real `git http-backend` over HTTP, stopped by PID at the end), creates a repo, sets its mirror URL, pushes two commits and a tag, waits for the status to say `ok` and the bare copy to hold the same refs, clones the copy and compares files, then pushes an incremental change with a new branch, then deletes the branch, checking the copy each time. A pass ends with `PASS; transcript in .../mirror.md`.
- **Status.** `curl -s <url>/api/repos/verify/<repo>` after the run shows `"state":"ok"` and `last_pushed_refs`.

## Gotchas

- A real push to real GitHub needs `GITHUB_MIRROR_TOKEN` in `.dev.vars` (never commit it) and a mirror URL on `github.com`. `verify.mjs mirror` does not do this.
- A ref GitHub refuses (a protected branch, or a race) makes the whole attempt count as failed and retried, even though the other refs landed; `last_error` names the ref and reason.
- Each push builds its whole pack in the Durable Object's memory, without deltas, so it stops at 48 MiB of objects. Over that, the status goes straight to `failed` with "over the ... byte limit" and no retries. A big repo pushed to Taru with git (which has no such cap yet) can't be copied.
