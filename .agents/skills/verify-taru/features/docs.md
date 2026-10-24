# Docs, llms.txt and the agent skill

One set of Markdown files (`features/docs/content/*.md`) feeds every docs surface, rendered by `features/docs/server/docs.ts`. `{{origin}}` in them becomes the URL the reader used, so examples are copy-paste ready for that server.

## Sub-features

- `docs-html`: `/docs` and `/docs/<page>`: the page rendered into the docs shell (`features/docs/ui/shell/index.html`), sidebar, "View as Markdown", next-page link. Unknown page: 404 text.
- `docs-markdown`: `/docs.md` and `/docs/<page>.md`: the same page as `text/markdown`.
- `llms-txt`: `/llms.txt` (index of the pages, linking the `.md` URLs) and `/llms-full.txt` (every page in one file).
- `agent-skill`: `/skills/taru/SKILL.md` serves `skills/taru/SKILL.md`, which `npx skills add kausthubh-coder/taru` also installs.

## How to get to it (user POV)

Browser: `<url>/docs`, the Docs link on the landing page and in the app. Agents: `curl <url>/llms.txt`.

## Driving it

- `curl -s <url>/llms.txt` lists every page with this server's URL; each linked `.md` answers 200 `text/markdown`.
- `shot docs --path docs` and `--path docs/api`, with `--phone` and `--dark`.
- Every command in the quickstart works when pasted against the verify instance (with `TARU_TOKEN` from `.dev.vars`).

## Gotchas

- The page list and order live in `DOC_PAGES` in `docs.ts`. A new Markdown file shows up nowhere until it's added there.
- Docs paths must stay in `run_worker_first` in `wrangler.jsonc`, or the SPA fallback serves the landing page.
