# Git

Taru speaks Git's smart HTTP protocol, so the normal `git` client clones, fetches and pushes with no plugins.

## URLs

A repo `acme/shop` lives at:

```
{{origin}}/acme/shop.git
```

The same repo in the web app is [/app/acme/shop](/app/acme/shop).

## Reading and writing

- **Clone, fetch and pull** need no credentials. Every repo on a server is readable by anyone who can reach it.
- **Push** needs HTTP Basic auth with the admin token as the password. Put it in the remote URL, or let Git's credential helper ask for it once:

```sh
git remote add taru https://x:$TARU_TOKEN@your-taru.workers.dev/acme/shop.git
git push taru main
```

Pushes are atomic when you ask for it (`git push --atomic`), and branch and tag deletes work (`git push taru :old-branch`).

## What the server supports

- Protocol v0 and v1 over HTTPS. Modern clients ask for v2 and fall back on their own; you don't need to set anything.
- Branches, tags (annotated and light), force pushes, deletes, binary files, executables and symlinks.
- `HEAD` points at `refs/heads/main` by default; an import points it where the source repo's `HEAD` points.

Not yet: SSH, shallow clones (`--depth`), partial clones (`--filter`), and pushes over 100 MB. See [Limits](/docs/limits).

## Git and the API see the same repo

A commit an agent makes through the API is an ordinary Git commit on the branch: `git pull` gets it, with the same id. A `git push` moves the branch the API reads. If both write the same branch at once, one wins and the other is refused: Git reports a non-fast-forward, and the API answers `409 head_mismatch` with the new head.
