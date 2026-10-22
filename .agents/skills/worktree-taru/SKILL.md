---
name: worktree-taru
description: Make a Taru checkout work, isolated, in one command. Use at the start of every task in a new worktree, whenever install, env, port or the local backend look wrong, and before giving a helper agent its own checkout.
---

# Worktree setup for Taru

The main checkout is `C:\Users\kaust\OneDrive\Documents\dev\taru`. Never edit it; work in a worktree.

## Commands

```
bun run setup                      # install if needed, .dev.vars, skills link, claim a port, local D1 schema, doctor
bun run doctor                     # read-only health check; prints the fix for each failure
bun run dev                        # Vite + Worker on the port in .env.local; ready at "Local: http://localhost:<port>/"
bun run remove-worktree <path>     # stop that worktree's processes, remove the skills junction, remove the worktree
```

A healthy setup ends with `healthy` and `setup done: <path> on port <port>, local backend in .wrangler/state`.
A rerun with nothing missing takes about a second.

## What is isolated per checkout

- **Port:** derived from a hash of the checkout path, skipping ports any other worktree has claimed in its
  `.env.local` (running or not), and checked free on 127.0.0.1 and ::1.
- **Backend:** Wrangler keeps local Durable Objects, R2 and D1 in `./.wrangler/state`, which belongs to this
  checkout. Dev never talks to Cloudflare production, and there is no shared dev backend to protect.
- **Secrets:** `.dev.vars` is copied from the main checkout (setup refuses anything that mentions production).

## Helpers

Give each helper agent its own worktree and backend; never two agents in one checkout:

```
git -C C:\Users\kaust\OneDrive\Documents\dev\taru fetch origin
git -C C:\Users\kaust\OneDrive\Documents\dev\taru worktree add -b <branch> C:\src\taru-wt\<name> origin/main
cd C:\src\taru-wt\<name>; bun run setup
```

Use `main` instead of `origin/main` until the GitHub remote exists.

## Cleanup

- Stop only processes you started, by PID and with their children (`taskkill /T /PID <pid>`). Never by name or port.
- Remove a worktree only when its work is merged or I say so, and never one a live T3 thread is using (check
  `t3_thread_list`). Use `bun run remove-worktree <path>`; plain `git worktree remove` leaves the junction behind.
