<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/taru-logo-dark.svg" />
  <img src="public/brand/taru-logo.svg" alt="Taru" height="44" />
</picture>

# Taru

Source control built for coding agents.

Taru is a Git server you run on your own Cloudflare account. Agents read, write and merge code through a REST API
or MCP tools without cloning. `git clone` and `git push` keep working, and Taru copies every push to GitHub, so
contributors, stars and CI stay where they are. Next: private folders inside public repos, and safe secret sharing.

Taru runs on Cloudflare (Workers, Durable Objects, R2, D1). You can run your own copy on your Cloudflare
account: it's free while you try it, and about $5 a month once it's in real use.

> Early. Today: create a repo, `git push` and `git clone` over HTTPS, import from GitHub, the automatic GitHub
> copy, the agent API and MCP server, and a web app to browse, review and edit. Import and the copy stop at 48 MiB
> of Git objects. For now anyone who can reach the server can list, read and clone every repo, so use it for
> public code.

## Use it

- **Docs**: `/docs` on any Taru server, starting with the quickstart. The same pages are Markdown in
  [features/docs/content](features/docs/content).
- **Web app**: `/app`.
- **For agents**: `/llms.txt` and `/llms-full.txt`, the MCP server at `/mcp`, and a skill:
  `npx skills add kausthubh-coder/taru` ([skills/taru/SKILL.md](skills/taru/SKILL.md)).

Brand, logo files and design tokens: `/brand/` on a running instance, and `shared/ui/theme.css`.

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
