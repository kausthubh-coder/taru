---
name: ship-taru
description: Take verified Taru work to production and leave main, the main checkout and the worktree list clean. Use only when I say ship, deploy, release, or merge and deploy.
---

# Ship Taru

"Ship" is my go for every step below, including cleanup. Don't stop to ask between steps. If a step fails
because of this change, fix it, rerun the checks and carry on; stop only when the cause is outside the change or
needs my decision. Never force-push, skip checks, or raise a warning cap.

Surfaces: one Cloudflare Worker named `taru` (API, Git endpoints, landing page assets) with its Durable Objects,
the `taru-blobs` R2 bucket and the `taru` D1 database. Nothing deploys on push; `bun run deploy` deploys.

## 1. Ready

- `git status` is clean; `git fetch origin && git rebase origin/main` (until a remote exists: up to date with local `main`).
- `bun run check` passes.
- Every changed feature was driven with `verify-taru`, with evidence.
- List what's going out: `git log origin/main..HEAD --oneline`, and which surfaces it touches.
- Rollback: note the current production version (`bunx wrangler deployments list --name taru`, first entry);
  rolling back is `bunx wrangler rollback <version-id>`. D1 migrations don't roll back, so a migration must be
  additive.

## 2. Backend first

New D1 migrations go before the code that needs them:
`bunx wrangler d1 migrations apply taru --remote`

## 3. Land (public repo: PR with CI)

```
git push -u origin HEAD
gh pr create --fill --base main
gh pr checks --watch          # wait for CI to pass
gh pr merge --squash          # don't use --delete-branch from inside a worktree
```

Before the GitHub repo exists: stop here and tell me; landing means I merge the branch into local `main`.

## 4. Deploy

From an up-to-date `main` (fetch, then deploy from the merged commit, not from the branch):
`bun run deploy` (runs the build, then `wrangler deploy`; the first deploy creates the R2 bucket and D1 database).
Secrets: `bunx wrangler secret put TARU_ADMIN_TOKEN` if it isn't set yet. Watch the deploy to the end.

## 5. Check production (read-only)

- `curl -s -o /dev/null -w "%{http_code}" https://taru.<account>.workers.dev/` is 200 and the landing page renders.
- `curl -s https://taru.<account>.workers.dev/api/nope` returns the JSON 404.
- `git ls-remote https://taru.<account>.workers.dev/<owner>/<repo>.git` lists refs for a known repo, once repos exist.
- `bunx wrangler deployments list --name taru` shows the new version first.

## 6. Update the main checkout

If `C:\Users\kaust\OneDrive\Documents\dev\taru` is clean and on `main`: `git -C <main> pull --ff-only`, then
`bun run setup` there. If it's dirty or on another branch, leave it and tell me.

## 7. Clean up

Delete the merged branch locally and on the remote: `git branch -d <branch>`, `git push origin --delete <branch>`.
A thread can't remove its own worktree: list it for removal later (`bun run remove-worktree <path>`).

## 8. Report

A few lines: what shipped, to which surfaces, the evidence (URLs and status codes, deployment id), and anything
skipped or left.
