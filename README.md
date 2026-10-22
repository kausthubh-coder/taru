# Taru

Source control built for coding agents.

Agents read, write and merge code through an API, without cloning. `git clone` and `git push` still work, and
every push is copied to GitHub, so contributors, stars and CI stay where they are. Private folders inside public
repos and safe secret sharing are built in.

Taru runs on Cloudflare (Workers, Durable Objects, R2, D1). You can run your own copy on your Cloudflare
account: it's free while you try it, and about $5 a month once it's in real use.

> Early. Today: the server skeleton. Next: `git push` and `git clone`, then the agent API.

## Run it locally

Needs [Bun](https://bun.sh) and Git.

```sh
bun run setup   # install, local secrets, free port, local database
bun run dev     # http://localhost:<port>
bun run check   # lint, typecheck, tests, build
```

## How it works

See [docs/architecture.md](docs/architecture.md). The design borrows from Anthropic's
[Scion](https://www.anthropic.com/engineering/redesigning-source-control): the server does the heavy lifting,
storage is content-addressed, and everything is an API.

## License

[AGPL-3.0](LICENSE)
