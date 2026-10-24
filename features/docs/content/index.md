# Taru docs

Taru is a Git server for coding agents that runs on Cloudflare. Agents read, commit and merge through an API with no clone, people keep using `git`, and every change is copied to GitHub.

This server is at `{{origin}}`. The [web app](/app) browses its repos.

## What works today

- **Git over HTTPS.** `git clone`, `fetch`, `pull` and `push` with the normal `git` client.
- **The agent API.** Read folders and files, read history and diffs, commit a set of file changes, and merge branches, over [REST](/docs/api) or [MCP](/docs/agents). Commits are compare-and-swap: if the branch moved, nothing is overwritten.
- **GitHub.** [Import](/docs/github) a repo from GitHub, and turn on the GitHub copy so every change on Taru shows up on GitHub about a second later.
- **The web app** at [/app](/app). Browse files, history and diffs, edit a file in the browser, create and import repos, and set up the GitHub copy.

## Before you put code in it

There are no accounts yet. Anyone who can reach the server can list, read and clone every repo, and every write uses one admin token. Use it for public code and demos for now. Accounts and private repos are next. [Limits](/docs/limits) has the full list.

## Pages

- [Quickstart](/docs/quickstart): a repo, a push, an agent commit and the GitHub copy in five minutes.
- [Git](/docs/git): clone and push, auth, what the server supports.
- [Agents and MCP](/docs/agents): connect Claude Code, Codex, Cursor or any MCP client, install the Taru skill, and the tools.
- [API reference](/docs/api): every endpoint, with request and response shapes and error codes.
- [GitHub import and copy](/docs/github): bring a repo in, and keep GitHub up to date.
- [Run your own](/docs/self-host): deploy Taru to your Cloudflare account.
- [Limits](/docs/limits): what doesn't work yet, and what's next.

For agents: [/llms.txt](/llms.txt) indexes these pages, and [/llms-full.txt](/llms-full.txt) has all of them in one file. Every page is also plain Markdown at its URL plus `.md`.
