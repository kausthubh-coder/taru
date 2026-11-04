---
name: taru
description: Read, change, review and merge code in a Taru repository through its MCP tools or REST API, with no clone. Use when a repo lives on a Taru server (a URL ending in .workers.dev or a Taru host, MCP tools named list_repos, read_tree, commit_changes), or when asked to commit, branch, review or merge on Taru.
---

# Taru

Taru is a Git server built for agents. You change code on the server: read a file, commit a set of changes, merge a branch. Every commit is a normal Git commit, so `git pull` and the GitHub copy get it with the same id. You don't need a clone.

## Pick the interface

- **MCP tools** (`list_repos`, `read_tree`, `read_file`, `read_log`, `read_commit`, `commit_changes`, `merge_branches`): use them if they're connected.
- **REST** if not: base URL in `TARU_URL`, admin token in `TARU_TOKEN`, writes with `curl -u "x:$TARU_TOKEN"`. Full reference: `$TARU_URL/docs/api.md`.

Repos are `owner/name`. A ref is a branch (`main`), tag, full ref or 40-hex commit id.

## Change code

1. `read_tree` (or `GET /api/repos/:owner/:name/tree?ref=<branch>&path=<dir>`) to find files. Every read returns `commit`: the branch's current commit id. Keep it.
2. `read_file` each file you'll change. Commits replace whole files, so send the complete new content, not a diff.
3. Work on your own branch unless told to commit to `main`. Create it with the first commit: `expected_head: null`, `start_rev: "main"`.
4. `commit_changes` with `expected_head` set to the commit id from step 1 (or from your last commit). One commit can write, add and delete many files:
   - text: `{"path": "src/a.ts", "content": "..."}`
   - bytes: `{"path": "img.png", "content_base64": "..."}`
   - delete: `{"path": "old.txt", "delete": true}`
   - executable: add `"mode": "100755"`
5. The answer's `commit` is the new head. Use it as `expected_head` for the next commit.

## When the branch moved

`head_mismatch` (HTTP 409) means someone pushed or committed since you read. Nothing was written. Read the files again at the new `head`, redo your edit on top of their change, and commit with the new `expected_head`. Never retry with the same stale content: that would undo their work.

## Review and merge

1. `read_commit` on your branch (or each commit from `read_log`) to check the diff before merging.
2. `merge_branches` with `into: "main"`, `from: "<your branch>"`. Pass `expected_head` if you read `main` earlier, and `dry_run: true` to check without writing.
3. `result` is `up_to_date`, `fast_forward` or `merged`. On `merge_conflict` nothing is written: each conflict names the path and kind, and for text includes `conflict_text` with `<<<<<<<` markers. Commit the resolved files to your branch, then merge again.

## Don't

- Don't clone to make an edit Taru can make directly. Use `git` only when you need to run code (tests, a build) locally.
- Don't commit to `main` with a guessed `expected_head`. Read it first.
- Don't put secrets in commits: every repo on a Taru server is readable by anyone who can reach it, and the GitHub copy gets everything.

## Errors

`{"error": "<code>", "message": "..."}`: `invalid_request` (400, fix the input as `message` says), `unauthorized` (401, writes need the token), `not_found` (404, repo, ref or path), `head_mismatch` and `merge_conflict` (409, above), `too_large` (413, over 16 MiB per request: split the commit).
