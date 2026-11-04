# Agents and MCP

Agents work on Taru repos through seven MCP tools at `{{origin}}/mcp`: read, review history, commit and merge, all on the server, with no clone.

## Connect an agent

Reading tools work with no token. Committing and merging need the admin token as HTTP Basic auth. Build the header once:

```sh
export TARU_URL={{origin}}
export TARU_AUTH="Basic $(printf 'x:%s' "$TARU_TOKEN" | base64 | tr -d '\n')"
```

**Claude Code**

```sh
claude mcp add --transport http taru $TARU_URL/mcp --header "Authorization: $TARU_AUTH"
```

**Codex** (`~/.codex/config.toml`; Codex reads the header from the environment variable you name)

```toml
[mcp_servers.taru]
url = "{{origin}}/mcp"
env_http_headers = { "Authorization" = "TARU_AUTH" }
```

**Cursor** (`.cursor/mcp.json`; Cursor fills `${env:TARU_AUTH}` from the environment)

```json
{
  "mcpServers": {
    "taru": {
      "url": "{{origin}}/mcp",
      "headers": { "Authorization": "${env:TARU_AUTH}" }
    }
  }
}
```

**Anything else** that speaks MCP over Streamable HTTP: the URL is `{{origin}}/mcp` and the header is `Authorization: Basic <base64 of x:token>`. The server answers every request with JSON; it doesn't open a stream or keep sessions.

## Install the Taru skill

The skill teaches an agent the workflow: read, commit with `expected_head`, retry on a conflict, review, merge. Install it into a project:

```sh
npx skills add kausthubh-coder/taru
```

Or download it straight from this server:

```sh
mkdir -p .claude/skills/taru
curl -fsSL {{origin}}/skills/taru/SKILL.md -o .claude/skills/taru/SKILL.md
```

## Or add this to AGENTS.md

For agents without skills, paste this into the project's `AGENTS.md` or `CLAUDE.md`:

```markdown
## Taru

This repo's source of truth is Taru at {{origin}} (repo: OWNER/NAME). Use the `taru` MCP tools,
not a local clone, to change it:
1. read_tree / read_file at the branch, and keep the `commit` id they return.
2. commit_changes with expected_head set to that id. On head_mismatch, read again and redo the change.
3. Work on your own branch (expected_head null, start_rev "main"), review it with read_commit,
   then merge_branches into main. On merge_conflict, fix the files on your branch and merge again.
Every commit reaches git and GitHub on its own. Docs: {{origin}}/llms.txt
```

## The tools

| Tool | What it does | Token |
|---|---|---|
| `list_repos` | Every repo with its clone URL | no |
| `read_tree` | A folder's entries at a branch, tag or commit, plus the commit id | no |
| `read_file` | One file: text as UTF-8, binary as base64, plus the commit id | no |
| `read_log` | Commits newest first, like `git log`, in pages of up to 100 | no |
| `read_commit` | One commit and its changed files, with a unified diff per text file | no |
| `commit_changes` | Writes, deletes and new files as one commit, if the branch is still at `expected_head` | yes |
| `merge_branches` | Fast-forward or three-way merge on the server; a conflict writes nothing and returns a report | yes |

Refs can be a branch (`main`), a tag, a full ref (`refs/heads/main`) or a 40-character commit id. The [API reference](/docs/api) runs the same operations with the same inputs and errors.

## How a good agent session goes

1. `read_tree` on the branch. Keep the `commit` it returns.
2. Create a branch: `commit_changes` with `branch: "agent/fix-cart"`, `expected_head: null`, `start_rev: "main"`.
3. Commit as many times as needed, each with `expected_head` set to the last commit id.
4. `read_commit` on the branch to review the change.
5. `merge_branches` into `main`. On `merge_conflict`, each conflict names the file and, for text, includes it with `<<<<<<<` markers: commit the fixed file on the branch and merge again.

If `commit_changes` returns `head_mismatch`, someone else moved the branch. Read again, redo the edit on the new version, and commit with the new head. Nothing was overwritten.
