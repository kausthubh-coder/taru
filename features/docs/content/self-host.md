# Run your own

Taru is open source (AGPL-3.0) and runs on your own Cloudflare account: one Worker, a Durable Object per repo, an R2 bucket and a D1 database. It's free while you try it, and about $5 a month (the Workers paid plan) once it's in real use.

## Deploy

You need [Bun](https://bun.sh), Git and a Cloudflare account.

```sh
git clone https://github.com/kausthubh-coder/taru.git
cd taru
bun install
bunx wrangler login
bun run deploy
```

The first deploy creates the R2 bucket and the D1 database. Then create the tables and set the admin token, a long random string that every write needs:

```sh
bunx wrangler d1 migrations apply taru --remote
openssl rand -hex 32 | bunx wrangler secret put TARU_ADMIN_TOKEN
```

Your server is at `https://taru.<your-subdomain>.workers.dev`. Open `/app` to check it.

## The GitHub copy

To copy repos to GitHub (or import private ones), give the server a fine-grained personal access token with **Contents: read and write** on the GitHub repos it should push to:

```sh
bunx wrangler secret put GITHUB_MIRROR_TOKEN
```

It is only ever sent to `github.com`.

## Run it on your machine

```sh
bun run setup   # install, local secrets, a free port, the local database
bun run dev     # prints the local URL
```

Local dev uses Wrangler's local Durable Objects, R2 and D1 under `.wrangler/`, never your Cloudflare account. The local admin token is in `.dev.vars`.

## How it's built

Each repo is a Durable Object holding refs, commits, trees and small files in SQLite; files over 512 KiB go to R2. The Git protocol and the agent operations run inside that object, next to its storage. The design notes are in [docs/architecture.md](https://github.com/kausthubh-coder/taru/blob/main/docs/architecture.md).
