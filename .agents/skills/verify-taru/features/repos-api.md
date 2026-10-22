# Repos API

Create and inspect repositories. Creating needs the admin token until accounts exist.

## Sub-features

- `repos-create`: `POST /api/repos {owner, name}` returns 201. Duplicate is 409, bad name 400, no auth 401 with `WWW-Authenticate: Basic`.
- `repos-list`: `GET /api/repos` lists repos.
- `repos-show`: `GET /api/repos/:owner/:name` returns head, refs and clone_url.

## How to get to it (user POV)

- HTTP, from an agent or curl.

## Driving it with verify.mjs

Preconditions: baseline; `TOKEN` is `TARU_ADMIN_TOKEN` from `.dev.vars`.

- **Create.** `curl -s -i -u x:$TOKEN -X POST <url>/api/repos -H "content-type: application/json" -d '{"owner":"acme","name":"api"}'` returns 201 with owner, name and clone_url.
- **Unauthorized.** The same call without `-u` returns 401.
- **Read back.** `node .agents/skills/verify-taru/verify.mjs repos` lists `acme/api`. `curl -s <url>/api/repos/acme/api` shows `"head":"refs/heads/main"` and `"refs":{}`.

## Gotchas

- `clone_url` is built from the `TARU_PUBLIC_URL` var (`http://localhost:5173` in `wrangler.jsonc`), not from the request, so on a verify instance it shows the wrong port. Use `<url>/<owner>/<name>.git`.
- Owner and name are case-insensitive (`Acme/API` is `acme/api`).
