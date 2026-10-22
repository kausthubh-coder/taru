# MCP server

`POST /mcp` speaks MCP over Streamable HTTP (stateless, JSON responses, no SSE). Tools mirror the agent API: `list_repos`, `read_tree`, `read_file`, `commit_changes`, `merge_branches`.

## Sub-features

- `mcp-handshake`: `initialize` answers with `protocolVersion`, `capabilities.tools`, `serverInfo.name` `taru` and `instructions`; `notifications/initialized` gets 202; `ping` gets `{}`; `GET /mcp` is 405.
- `mcp-tools`: `tools/list` has the five tools with JSON schemas; `tools/call` returns `content[0].text` and `structuredContent` with the same JSON the REST API returns, `isError: true` on a failed operation (400/404/409 bodies).
- `mcp-auth`: `commit_changes` and `merge_branches` without HTTP Basic admin auth are HTTP 401 with a JSON-RPC error `-32001`.

## How to get to it (user POV)

- Any MCP client with Streamable HTTP: URL `<url>/mcp`, header `Authorization: Basic base64(x:<token>)` for writes.
- Claude Code: `claude mcp add --transport http taru <url>/mcp --header "Authorization: Basic <base64>"`.

## Driving it with verify.mjs

Preconditions: baseline; git on PATH; `@modelcontextprotocol/sdk` installed (devDependency).

- **Edit through MCP.** `node .agents/skills/verify-taru/verify.mjs mcp`. Creates `verify/mcp-<time>`, pushes a seed with git and clones it, posts raw `initialize` and `tools/list` JSON-RPC, then connects the official SDK `Client` over `StreamableHTTPClientTransport`, calls `read_file` and `commit_changes` (nested edit, new folder, delete), then `git pull` in the clone and checks HEAD and every changed path's bytes, plus `fsck`. A pass ends with `PASS; transcript in .../mcp.md`.

## Gotchas

- The server is stateless: no `Mcp-Session-Id`, and a client's `GET` for a server stream gets 405, which the SDK client treats as "no stream" and carries on.
- `expected_head` is required for `commit_changes`, same as the REST API; `read_tree`/`read_file` return the commit oid to use.
