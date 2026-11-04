# API reference

Every endpoint, with its request and response. All bodies are JSON. Reads are public; writes need the admin token as HTTP Basic auth (`curl -u "x:$TARU_TOKEN"`).

Base URL: `{{origin}}`. In paths below, `:owner/:name` is a repo like `acme/shop`.

## Repos

### `GET /api/repos`

Every repo, newest first.

```json
{ "repos": [{ "owner": "acme", "name": "shop", "created_at": "2026-10-23 18:02:11", "clone_url": "{{origin}}/acme/shop.git" }] }
```

### `POST /api/repos` (token)

Creates an empty repo. Body: `{"owner": "acme", "name": "shop"}`. Names are 1 to 64 letters, digits, `_`, `.` or `-`, and can't end in `.git`. Answers `201` with the repo, or `409` if it exists.

### `GET /api/repos/:owner/:name`

The repo, its refs, where `HEAD` points, and the GitHub copy's settings and status.

```json
{
  "owner": "acme", "name": "shop", "created_at": "...", "clone_url": "{{origin}}/acme/shop.git",
  "head": "refs/heads/main",
  "refs": { "refs/heads/main": "7f3c2a1e...", "refs/tags/v1.0": "..." },
  "mirror": { "url": "https://github.com/acme/shop.git", "status": { "state": "ok", "attempts": 0, "last_success_at": "...", "last_error": null } }
}
```

`mirror` is `null` when the copy is off. `status.state` is `idle`, `pending`, `ok` or `failed`.

### `POST /api/repos/:owner/:name/import` (token)

Fills an empty repo from another Git server: every branch and tag, and `HEAD`. Body: `{"url": "https://github.com/acme/shop.git"}`. Answers `{"refs": {"refs/heads/main": "7f3c2a1e...", ...}, "objects": 3400, "head": "refs/heads/main"}`. `409` if the repo isn't empty, `413` past 48 MiB of objects.

### `PUT /api/repos/:owner/:name/mirror` (token)

Turns the GitHub copy on (`{"url": "https://github.com/acme/shop-copy.git"}`) or off (`{"url": null}`). The copy pushes about a second after every change. See [GitHub import and copy](/docs/github).

Errors from these four endpoints are `{"error": "<what went wrong>"}` with a matching status.

## Reading code

### `GET /api/repos/:owner/:name/tree?ref=main&path=src`

A folder's entries. `ref` defaults to the branch `HEAD` points at; `path` defaults to the root.

```json
{
  "ref": "refs/heads/main", "commit": "7f3c2a1e...", "tree": "...", "path": "src",
  "entries": [{ "name": "app.ts", "path": "src/app.ts", "type": "file", "mode": "100644", "oid": "..." }]
}
```

`type` is `file`, `dir`, `symlink` or `submodule`. Keep `commit`: it's the `expected_head` for your next commit.

### `GET /api/repos/:owner/:name/file?ref=main&path=src/app.ts`

One file. `encoding` is `utf-8` for text, or `base64` when the bytes aren't valid UTF-8 or contain a NUL.

```json
{ "ref": "refs/heads/main", "commit": "7f3c2a1e...", "path": "src/app.ts", "type": "file", "mode": "100644", "oid": "...", "size": 1234, "encoding": "utf-8", "content": "..." }
```

### `GET /api/repos/:owner/:name/raw?ref=main&path=media/logo.png`

The file's bytes, for images and downloads. Images come back with their image type, other files as `text/plain` or `application/octet-stream`. The response is sandboxed so a file can never run as a page.

## History

### `GET /api/repos/:owner/:name/commits?ref=main&limit=30&skip=0`

Commits newest first, in `git log` order. `limit` is 1 to 100 (default 30). When `more` is true, ask again with `skip` increased by the number you got.

```json
{
  "ref": "refs/heads/main", "head": "7f3c2a1e...", "more": true,
  "commits": [{
    "commit": "7f3c2a1e...", "tree": "...", "parents": ["..."],
    "author": { "name": "Agent", "email": "agent@acme.dev", "time": 1792000000, "timezone": "+0000" },
    "committer": { "name": "Agent", "email": "agent@acme.dev", "time": 1792000000, "timezone": "+0000" },
    "message": "Fix total()\n"
  }]
}
```

### `GET /api/repos/:owner/:name/commits/:rev`

One commit (by id, branch or tag) and what it changed against its first parent, like `git show`.

```json
{
  "commit": "7f3c2a1e...", "parents": ["..."], "author": { ... }, "committer": { ... }, "message": "...",
  "compared_to": "...", "truncated": false,
  "files": [{
    "path": "src/cart.ts", "status": "modified", "old_oid": "...", "new_oid": "...", "old_mode": "100644", "new_mode": "100644",
    "binary": false, "too_large": false, "additions": 1, "deletions": 1,
    "patch": "@@ -3,7 +3,7 @@\n ...\n-  return 0\n+  return items.reduce(...)\n ..."
  }]
}
```

`status` is `added`, `deleted` or `modified`. `patch` is the unified diff from the first `@@` line, or `null` for binary files and diffs too large to show. `too_large: true` means the diff wasn't shown: a file over 1 MiB, more than 2,000 changed lines, or past 2 MiB of patches in one commit. The first two come with counts of 0. The list stops at 300 files (`truncated: true`).

## Writing

### `POST /api/repos/:owner/:name/commits` (token)

One commit from a set of file changes.

```json
{
  "branch": "main",
  "expected_head": "7f3c2a1e...",
  "message": "Fix total()",
  "author": { "name": "Agent", "email": "agent@acme.dev" },
  "changes": [
    { "path": "src/cart.ts", "content": "export function total() { ... }\n" },
    { "path": "assets/logo.png", "content_base64": "iVBORw0..." },
    { "path": "scripts/run.sh", "content": "#!/bin/sh\n", "mode": "100755" },
    { "path": "old.txt", "delete": true }
  ]
}
```

- `expected_head` is the commit the branch must be at now. If it moved, the answer is `409 head_mismatch` with the current `head`, and nothing is written.
- To create a branch: `"expected_head": null`, and `"start_rev": "main"` to start it from another branch (leave it out for a first commit with no parent).
- `mode` is `100644` (default), `100755` (executable) or `120000` (symlink; `content` is the target).
- `author` defaults to `Taru <agent@taru.invalid>`.

Answers `201`:

```json
{ "branch": "refs/heads/main", "commit": "9e1b04c...", "tree": "...", "parent": "7f3c2a1e..." }
```

### `POST /api/repos/:owner/:name/merges` (token)

Merges `from` into the branch `into`.

```json
{ "into": "main", "from": "agent/fix-cart", "message": "Merge the cart fix", "expected_head": "...", "dry_run": false }
```

Only `into` and `from` are required. `result` is `up_to_date`, `fast_forward` (no new commit) or `merged` (a commit with two parents). `dry_run: true` reports the result without writing.

On a conflict nothing is written, and the answer is `409`:

```json
{
  "error": "merge_conflict", "message": "1 conflict(s) merging ...", "base": "...", "ours": "...", "theirs": "...",
  "conflicts": [{ "path": "README.md", "kind": "content", "base": "...", "ours": "...", "theirs": "...", "conflict_text": "<<<<<<< refs/heads/main\n..." }]
}
```

`kind` is `content`, `binary`, `symlink`, `add/add`, `modify/delete`, `mode` or `file/directory`. Fix the files on either branch with a normal commit, then merge again.

## Errors

Reading, history and writing endpoints answer errors as `{"error": "<code>", "message": "..."}`, so an agent can branch on the code:

| `error` | Status | Meaning |
|---|--:|---|
| `invalid_request` | 400 | The body or query is wrong; `message` names what |
| `unauthorized` | 401 | A write without the admin token |
| `not_found` | 404 | No such repo, revision or path |
| `head_mismatch` | 409 | The branch isn't at `expected_head`; `head` is where it is |
| `merge_conflict` | 409 | See above |
| `no_merge_base` | 409 | The two branches share no history |
| `too_large` | 413 | The body is over 16 MiB |
