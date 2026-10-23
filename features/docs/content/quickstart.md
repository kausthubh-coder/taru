# Quickstart

Create a repo, push to it, let an agent commit to it, and copy it to GitHub. About five minutes.

You need `git`, `curl`, and the server's admin token: the person who deployed Taru set it with `wrangler secret put TARU_ADMIN_TOKEN`.

## 1. Set two variables

Every command below uses them.

```sh
export TARU_URL={{origin}}
export TARU_TOKEN=<the admin token>
```

The token is the password in HTTP Basic auth. The username can be anything.

## 2. Create a repo

```sh
curl -u "x:$TARU_TOKEN" -H 'content-type: application/json' \
  -d '{"owner":"acme","name":"shop"}' $TARU_URL/api/repos
```

It answers `201` with the clone URL. Or create it in the [web app](/app): paste the token under **Admin token**, then **New repo**.

## 3. Push to it

From any Git repo on your machine:

```sh
git remote add taru "${TARU_URL/:\/\//://x:$TARU_TOKEN@}/acme/shop.git"
git push taru main
```

Cloning needs no token:

```sh
git clone $TARU_URL/acme/shop.git
```

## 4. Let an agent commit, with no clone

For Claude Code, one command adds Taru's MCP tools:

```sh
claude mcp add --transport http taru $TARU_URL/mcp \
  --header "Authorization: Basic $(printf 'x:%s' "$TARU_TOKEN" | base64 | tr -d '\n')"
```

Then ask in plain words: *"In acme/shop on Taru, add a CONTRIBUTING.md and commit it to main."* The agent reads the tree, commits through `commit_changes`, and `git pull` shows its commit. Other agents: see [Agents and MCP](/docs/agents).

## 5. Copy it to GitHub

Make an empty repo on GitHub, then point Taru at it. The server needs a GitHub token for this; see [GitHub import and copy](/docs/github).

```sh
curl -u "x:$TARU_TOKEN" -X PUT -H 'content-type: application/json' \
  -d '{"url":"https://github.com/you/shop.git"}' $TARU_URL/api/repos/acme/shop/mirror
```

From now on every push, agent commit and merge on Taru reaches GitHub about a second later, with the same commit ids.

## Already on GitHub?

Create an empty repo on Taru and import instead of pushing:

```sh
curl -u "x:$TARU_TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://github.com/you/shop.git"}' $TARU_URL/api/repos/acme/shop/import
```
