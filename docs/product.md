# Product

## Pitch

Source control built for coding agents. Agents read, write and merge code through an API without cloning.
`git clone` and `git push` still work, and every push is copied to GitHub automatically, with private folders
left out. Private folders and secrets are built in. It runs on Cloudflare: free to self-host on your own
account, or about $5/month once it's in real use.

The one thing it must do well: an agent changes code through the API, and the change shows up correctly in Git
and on GitHub.

## Who it's for

- First: tech leads at small startups (2–20 engineers) that run many coding agents.
- Also: open-core companies that mix public and private code.
- Design partners: open-source maintainers swamped by AI pull requests.

## Problems and how Taru answers them

| Problem (source) | Taru |
|---|---|
| Private folders inside a public repo (Theo) | The server decides who sees which folders, and the GitHub copy leaves private folders out |
| Hiding in-flight PRs and unreleased security fixes (Theo) | Private until published |
| `.env` leaks and sharing secrets (Theo) | Encrypted secrets, never in history, handed only to the right people, agents and CI; pushes containing secrets are blocked |
| Agents need a full OS and a checkout to touch code (Theo) | Agent API and MCP: read, write and merge with no clone |
| Worktree pain for parallel agents (Theo) | No worktrees needed through the API; the CLI makes instant local workspaces |
| Commits and branches are busywork (Theo) | Automatic snapshots (CLI), organize history later |
| Review overload and AI junk PRs | Triage, plus reviewing the intent of a change |
| Merge queue bugs and slowness | No merge queue: test after merge, AI resolves conflicts (Scion) |
| Slow PR pages, notifications | Our own fast UI |
| Copilot pushed on you, training on your data | Your rules |
| Large files (LFS) | R2, with no download fees |
| Slow, flaky CI | The GitHub copy keeps Actions working; Depot and Buildkite integrate directly; failures go straight back to the agent |
| Outages | Not dependent on GitHub, but our uptime is our job |
| Getting people to leave GitHub | They don't have to: the automatic GitHub copy means contributors, stars and CI stay |

## Deadlines

- YC W27, Nov 2, 2026: landing page, build steps 1–2 working, and a 60-second demo video (an agent edits code
  with no clone, `git pull` shows it, and it appears on GitHub).
- NLnet NGI Zero, Nov 3, 2026: the open, self-hostable forge angle.
