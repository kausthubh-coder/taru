# Import from GitHub

Fill an empty Taru repo from another Git server: every branch and tag, every object, and HEAD. Big repos come in this way instead of a 100 MB push.

## Sub-features

- `import-fill`: `POST /api/repos/:owner/:name/import {url}` (admin) answers 200 with `{refs, objects, head}`; the repo then clones from Taru exactly like from the source.
- `import-empty-only`: a repo that already has refs answers 409.
- `import-url-rules`: `https://` anywhere, `http://` only on localhost, no credentials in the URL; otherwise 400. An unreachable remote answers 502 with the reason.
- `import-limit`: a pack over 100 MB answers 413.

## How to get to it (user POV)

- `curl -u x:$TOKEN -X POST <url>/api/repos/<owner>/<name>/import -H "content-type: application/json" -d '{"url":"https://github.com/<o>/<r>.git"}'`

## Driving it with verify.mjs

Preconditions: baseline; git on PATH; internet access for a real GitHub URL.

- **Real GitHub.** `node .agents/skills/verify-taru/verify.mjs import https://github.com/<owner>/<repo>.git`. Pick a public repo under ~30 MB with tags and branches. A pass prints `refs match`, `HEAD matches`, `history matches`, `every file's bytes match`, `fsck ... clean`, then `PASS; transcript in .../import.md`.
- **Validation.** `curl -s -i -u x:$TOKEN -X POST <url>/api/repos/<owner>/<name>/import -H "content-type: application/json" -d '{"url":"http://example.com/x.git"}'` answers 400; without `-u`, 401; on a repo with refs, 409.

## Gotchas

- The import runs inside the repo's Durable Object and the whole pack is buffered: a few hundred MB of history will not fit. The limit is 100 MB per pack.
- Only `refs/heads/*` and `refs/tags/*` come over. GitHub's `refs/pull/*` are left behind on purpose.
- With `GITHUB_MIRROR_TOKEN` set, the token is sent to `github.com` only, so private repos the token can read import too.
