# Web app

The React app at `/app` (`features/app/ui/`, shell `app/index.html`). The Worker serves the shell for every `/app` path; the app routes in the browser. What matters: what it shows matches the repo (`git` agrees), and a commit made in it is a real commit.

## Sub-features

- `app-repos`: `/app` lists repos (newest first) with clone URLs; empty state when there are none.
- `app-new-repo`: `/app/new` (admin token) creates a repo, optionally importing from a URL.
- `app-browse`: `/app/:owner/:name` and `/tree/<path>` list a folder (folders first) with the latest commit; README rendered below; branch and tag picker keeps the path. `?ref=` carries the ref: a branch's short name, or `refs/tags/<name>` for a tag.
- `app-file`: `/blob/<path>`: text with line numbers, Markdown with Preview/Code, images shown, other binary as a size line.
- `app-edit`: `/edit/<path>` and `/new-file?dir=` (admin token) commit through `POST .../commits` with `expected_head`; a moved branch shows the head_mismatch notice and writes nothing.
- `app-history`: `/commits` (pages of 30, `?page=`), `/commit/<rev>` with per-file diffs and line numbers; a file the server won't diff (`too_large`) says so instead.
- `app-settings`: `/settings` shows the GitHub copy's URL and status and turns it on or off (admin token).
- `app-token`: the Admin token button checks a pasted token with `GET /api/session` (`{"admin": true|false}`) and keeps it in localStorage only if it's right.

## How to get to it (user POV)

Browser: `<url>/app`, or the App link on the landing page.

## Driving it

Preconditions: baseline, and repos with history: run `agent-api` (a merged, real-shaped repo) and `import https://github.com/chalk/chalk.git` first.

- Screens: `shot app-repos --path app`, `shot app-repo --path app/<owner>/<name>`, and the same for `/commits`, `/commit/<oid>`, `/blob/<file>`, `/settings`, with `--phone` and `--dark`.
- **Full flow.** `node .agents/skills/verify-taru/app-e2e.mjs` (needs a launched instance). In Chromium: a README with script tags, `onerror`, `javascript:` links, an iframe and an `id="root"` renders with all of them gone and its HTML kept; its relative SVG loads through `/raw` and can't run script opened on its own; a wrong admin token is refused and the right one turns on writing; an edit and a new file become commits that `git clone` sees; a branch moved under the editor shows the notice and writes nothing; the commit view shows the diff; with a tag and a branch both named `release`, picking the tag shows the tag's file with no Edit link; a 3,000-line rewrite comes back `too_large` from REST and MCP `read_commit` and the commit view says the diff is too large. A pass ends with `PASS; screenshots in ...`.

## Gotchas

- Deep links only work through the Worker (`run_worker_first` has `/app` and `/app/*`). A 200 with the landing page instead of the app means that rule is missing.
- Branch names with slashes go in `?ref=`, never in the path.
- A short name in `?ref=` resolves to the branch first, then the tag, as the server does. Only short branch names can be edited; `refs/...` refs are read-only.
- README HTML: `shared/markdown.ts` renders it with raw HTML kept, then `features/app/ui/sanitize.ts` cuts it to an allowlist in a detached document (no handlers, no script/iframe/style, http(s)/mailto/relative URLs only, ids prefixed `user-content-`). Node tests can't run DOMParser, so `app-e2e.mjs` is the proof. The docs pages escape raw HTML instead.
- `/api/repos/:owner/:name/raw` serves untrusted bytes from the app's origin: it must keep `nosniff`, the CSP `sandbox`, and image types only for image extensions.
