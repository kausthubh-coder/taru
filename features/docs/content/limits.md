# Limits

What doesn't work yet, why, and what comes next. Taru is early: everything here is a known gap, not a surprise.

## Access

- **No accounts.** One admin token makes every write. You can't give a teammate or an agent its own access, or take it back, without changing the token for everyone.
- **Every repo is public.** Anyone who can reach the server can list, read and clone every repo. Don't put private code on it yet.

Next: sign in with GitHub, per-repo access, and a token per agent. After that, private folders inside a repo and shared secrets.

## Size

| Limit | Value | Why |
|---|--:|---|
| One `git push` | 100 MB | The Workers request limit |
| Import and the GitHub copy | 48 MiB of Git objects | Both hold everything they move in memory, in a Durable Object with 128 MB |
| One API request | 16 MiB | Keeps a commit well inside one request to the repo's Durable Object |
| Commit list page | 100 commits | Ask again with `skip` |
| Files in one commit's diff | 300 | `truncated: true` past it |
| Diffed file size | 1 MiB | Bigger files come back `too_large`, with counts of 0 and no patch |
| Changed lines in one file's diff | 2,000 | The diff search's memory grows with the square of this. Past it, `too_large` as above |
| Patches in one commit | 2 MiB | Later files keep their counts but come back `too_large`, with no patch |

A push under 100 MB that unpacks to far more can still fail in production, for the same memory reason as import. Streaming packs remove the import, copy and push limits; they're the next big piece of engine work.

## Git

- HTTPS only. Workers can't accept SSH.
- No shallow (`--depth`) or partial (`--filter`) clones.
- Merges with more than one possible merge base use the first one found, where Git would merge the bases.
- In a merge, a file with more than 2,000 changed lines on one side counts as rewritten on that side: if the other side changed it too, the whole changed stretch is one conflict.

## Repos

- You can't delete or rename a repo yet.
- The GitHub copy goes one way, Taru to GitHub. Import is the only way in from GitHub.
