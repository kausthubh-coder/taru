# Git push and clone

Taru is a Git server: the real `git` client pushes to it, and clones, fetches and pulls from it over smart HTTP, byte for byte.

## Sub-features

- `git-push-initial`: push a real-shaped history to an empty repo.
- `git-clone`: a fresh clone matches the source (HEAD, every file's bytes, `git fsck` clean).
- `git-push-incremental`: a follow-up push (a thin pack with deltas) and a pull from the existing clone.
- `git-auth`: a push without the admin token is refused with 401, so git prompts; clone is public.
- `git-branches-tags`: extra branches, annotated tags and branch deletion. Covered by git-core's end-to-end tests, not yet by `git-roundtrip`.

## How to get to it (user POV)

- `git push http://x:<token>@<host>/<owner>/<repo>.git main`
- `git clone http://<host>/<owner>/<repo>.git`

## Driving it with verify.mjs

Preconditions: baseline; git on PATH.

- **Round trip.** Run `node .agents/skills/verify-taru/verify.mjs git-roundtrip`. It creates `verify/roundtrip-<time>`, pushes two commits (nested folder, empty file, 4 KB binary, 1.2 MB file), runs `ls-remote`, clones, compares, runs `fsck`, then pushes a third commit and pulls it. A pass ends with `PASS; transcript in .../git-roundtrip.md`.
- **Auth.** `git push <url>/verify/<repo>.git main` with no credentials and `GIT_TERMINAL_PROMPT=0` fails with an authentication error.

## Gotchas

- Until git-core's protocol functions land, push fails with `remote: git-receive-pack advertisement failed: not implemented`. That's the expected failure, not a harness bug.
- Use `-c core.autocrlf=false` on Windows (the helper does), or line endings change the bytes and the comparison fails for the wrong reason.
- Pushes over 100 MB are refused (413) by design. Big repos get imported from GitHub instead (not built yet).
