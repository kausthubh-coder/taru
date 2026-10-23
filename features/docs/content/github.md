# GitHub import and copy

Bring a repo in from GitHub once, and keep a GitHub repo up to date with Taru from then on, so stars, contributors and CI stay where they are.

## Import

Import fills an empty Taru repo from any Git server over HTTPS: every branch and tag, and `HEAD`.

```sh
curl -u "x:$TARU_TOKEN" -H 'content-type: application/json' -d '{"owner":"acme","name":"shop"}' {{origin}}/api/repos
curl -u "x:$TARU_TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://github.com/acme/shop.git"}' {{origin}}/api/repos/acme/shop/import
```

Or in the web app: **New repo**, then fill **Import from**. Public repos import with no setup. Private GitHub repos import when the server has a GitHub token (below) that can read them.

Import stops with `413` past 48 MiB of Git objects. That fits most small and medium projects; [Limits](/docs/limits) explains why and what's next.

## The GitHub copy

Taru is the source of truth, and the GitHub repo follows it. About a second after any change on Taru (a `git push`, an agent commit, a merge), Taru pushes the change to GitHub. Branches and tags on GitHub end up equal to Taru's, force updates and deletes included. Pull request refs and anything else on GitHub are left alone.

1. Create an empty repo on GitHub, or use an existing one Taru should overwrite.
2. The server needs a GitHub token that can push to it: a fine-grained personal access token with **Contents: read and write** on that repo. The person who deployed Taru sets it once with `wrangler secret put GITHUB_MIRROR_TOKEN`. It is only ever sent to `github.com`.
3. Point the repo at it:

```sh
curl -u "x:$TARU_TOKEN" -X PUT -H 'content-type: application/json' \
  -d '{"url":"https://github.com/acme/shop.git"}' {{origin}}/api/repos/acme/shop/mirror
```

Or in the web app, on the repo's **Settings** tab.

The copy runs once right away, then after every change. Check it with `GET /api/repos/acme/shop`: `mirror.status.state` is `ok` when GitHub matches, `pending` while a push is waiting, and `failed` with `last_error` when GitHub refused. Failures retry after 5 seconds, 30 seconds, 2, 10 and 30 minutes and an hour, then wait for the next change.

Turn it off with `{"url": null}`.

## What the copy is not

- It is one way. Commits made on GitHub don't come back to Taru, and the next change on Taru overwrites them. Make changes on Taru.
- The push isn't atomic: if GitHub refuses one branch (a protected branch, say), the others still land, and the status names the refused one.
