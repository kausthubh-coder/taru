---
name: verify-taru
description: Launch an isolated Taru instance (Worker + landing page + Git smart HTTP on a throwaway local backend), drive it like a user (browser, real git client, HTTP API) and save evidence. Use before saying a Taru change works, and to check git push/clone, the waitlist, the repos API or the landing page.
---

# Verify Taru

One helper drives everything. Run it from the repo root (the checkout or worktree you're verifying):

```
node .agents/skills/verify-taru/verify.mjs <command>
```

| Command | What it does |
|---|---|
| `launch` | Runs setup, creates a fresh throwaway backend in `.verify/state` (D1 migrations applied), starts Vite + the Worker on dev port + 1000, waits until the landing page and API answer. Prints `ready: <url> (pid …)` |
| `doctor` | Read-only: our PID is alive, the URL serves Taru's landing page and the JSON API, the throwaway backend exists, the admin token is readable. Run it first when anything looks off |
| `shot <name> [--phone] [--dark]` | Full-page screenshot + ARIA snapshot of `/` (1440×900 or 390×844); warns on horizontal overflow |
| `waitlist <email>` | Fills the hero form in Chromium, submits, reads the status line, and checks D1 has exactly one row for that email |
| `repos` | Prints `GET /api/repos` |
| `git-roundtrip` | Creates a repo through the API, pushes a real-shaped repo with the real `git` client (nested dirs, empty file, binary, >1 MB file), clones it, compares HEAD and every file's bytes, runs `git fsck`, pushes an incremental change and pulls it |
| `import <git-url>` | Creates a repo, imports it from a real Git server (a public GitHub URL), then compares GitHub and Taru: every branch and tag (`ls-remote`), HEAD, the default branch's history and every file's bytes, and `git fsck` of a `--mirror` clone from Taru |
| `mirror` | Starts a fake GitHub (`scripts/fake-github.mjs`, real `git http-backend`, stopped by PID at the end), creates a repo with its mirror URL set, pushes with real `git`, waits for the copy's status to say `ok`, and compares the bare copy with Taru's refs and a clone; then an incremental push with a new branch, then a branch delete |
| `stop` | Kills the process tree we started (by recorded PID), deletes `.verify/state`, keeps the evidence |

## Launch

- `launch` refuses if `.verify/instance.json` exists: one verify instance per checkout. Run `stop` first.
- Ready means `ready: http://localhost:<port>` was printed: the page contains "Source control built for coding agents" and `/api/nope` answers 404.
- The instance never shares state with `bun run dev` (that uses `.wrangler/state` on the dev port). Two checkouts can verify at once: ports come from each checkout's own dev port.
- Logs: `.verify/dev.log`.

## Evidence

Everything goes to `.verify/evidence/<run>/` (printed by `launch`). It's gitignored, and it survives `stop`.
- UI: a screenshot plus an ARIA snapshot with the page identity visible.
- Mutations: the user action (form submit, `git push`) plus a second, read-only view of the stored result (D1 row, `git ls-remote`, a fresh clone).
- Git: `git-roundtrip.md`, `import.md` and `mirror.md` are the transcripts, with the admin token redacted.
- Proof standards: drive the real user path (browser form, real `git` binary, public HTTP), not internal functions. No mocks: the backend is real workerd with real Durable Objects, R2 and D1, only local and throwaway.

## Cleanup

`stop`. It kills only the PID it recorded (plus children), and never kills by name or port. If `stop` says it couldn't remove `.verify/state`, the next `launch` replaces it.

## Feature map

`features/README.md` indexes the user-facing features with a recipe each. A change to a feature isn't verified until its recipe passes. After big feature changes, run `/maintain-verification-skill`.
