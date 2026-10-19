# Dogear for coding agents: `dogear mcp`

`dogear mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server. A coding agent
connected to it can read the feedback people pinned to your pages: which page, which element, what
they said, and where that element probably lives in your code. With writes turned on, it can also
reply and resolve threads, and people see those replies in the thread on the page, with an
**Agent** badge.

It talks to **your own backend** through the same adapter the layer uses. Nothing is hosted and
there is no account to create. It runs over stdio, so your agent starts it as a subprocess.

## 1. Where it reads from

| You have | Run | How it signs in |
|---|---|---|
| Nothing yet (local development) | `npx dogear serve`, then `npx dogear mcp` in the same directory | the token `dogear serve` writes to `.dogear/token` |
| A REST route (`httpAdapter`) | `npx dogear mcp --endpoint https://app.example.com/api/comments` | `DOGEAR_TOKEN`, which your route maps to an agent user ([Agent tokens](contract.md#agent-tokens)) |
| Any other adapter | `npx dogear mcp --adapter ./dogear.adapter.mjs` | whatever the module does, such as a Supabase service key from the environment |

The adapter module's default export (or `adapter` export) is an `Adapter`. Give it `listAll` so the
agent can see every page at once. Without it, the agent has to ask page by page, and the tools say
so.

**Options:**
- `--site <url>` (or `DOGEAR_SITE_URL`): makes `?dogear=` links that open a thread on its page.
- `--write` (or `DOGEAR_MCP_WRITE=1`): adds `dogear_reply` and `dogear_resolve`. Without it the server is
  read-only, and those tools don't exist.

## 2. Connect your agent

Install once in the project (`npm install -D @harshi04/dogear`) so the server starts instantly from
`node_modules`. `npx -y @harshi04/dogear mcp` also works without installing, but its first start
downloads the package and can take longer than some clients wait.

**Claude Code**

```bash
claude mcp add dogear -- npx dogear mcp --write --site http://localhost:3000
# against your backend:
claude mcp add dogear --env DOGEAR_TOKEN=... -- npx dogear mcp --endpoint https://app.example.com/api/comments --write
```

Or share it with the team in `.mcp.json` (project scope). Locally that's all it needs:

```json
{
  "mcpServers": {
    "dogear": {
      "command": "npx",
      "args": ["dogear", "mcp", "--write", "--site", "http://localhost:3000"]
    }
  }
}
```

Against your backend, add `"--endpoint", "https://app.example.com/api/comments"` to `args` and
`"env": { "DOGEAR_TOKEN": "${DOGEAR_TOKEN}" }`, keeping the token itself in your environment, never in
the file.

**Cursor**: `.cursor/mcp.json` takes the same `mcpServers` object as above.

**Codex**: `~/.codex/config.toml`, or `codex mcp add dogear -- npx dogear mcp --write`:

```toml
[mcp_servers.dogear]
command = "npx"
args = ["dogear", "mcp", "--write"]
tool_timeout_sec = 90   # room for dogear_watch, which defaults to 50 s
```

**VS Code**: `.vscode/mcp.json`. Note the `servers` key:

```json
{
  "servers": {
    "dogear": { "type": "stdio", "command": "npx", "args": ["dogear", "mcp", "--write"] }
  }
}
```

Tested with Claude Code 2.1 and Codex 0.162. Any client that speaks MCP over stdio should work.

## 3. Tools

All tools return structured content (with an output schema) and the same data as JSON text.
Failures come back as tool errors that say what to do next.

**Read**: always there, and annotated read-only.

| Tool | What it does |
|---|---|
| `dogear_status` | Connection check: what it reads, who it is signed in as, whether writes are on, and counts of open, resolved and waiting threads. Call it first when something fails. |
| `dogear_list_threads` | Open threads by default, newest activity first. Filters: `status` (`open`, `resolved`, `all`), `path` (`/pricing` or `/settings/*`), `author`, `query` (comments, labels, element text), `waiting_on_agent`. Paged with `limit` (up to 100) and `cursor`. `response_format: "detailed"` adds ids, selectors and element text. |
| `dogear_get_thread` | One thread in full: the element (label, the text it showed, a DOM path, the position on it), **where to look** in the code, every comment, and a link. Takes the 8-character `ref`, a full id, or a `?dogear=` link. |
| `dogear_next` | The oldest open thread whose last comment is a person's, meaning nobody has answered it yet, in full. `done: true` when nothing is waiting. |
| `dogear_watch` | Waits for new threads and for people's replies on open threads, then returns them, gathering a burst into one answer. The first call returns what is already waiting. Pass the returned `cursor` as `since` to continue. Defaults to 50 s; keep it under your client's tool timeout. Agents' own replies never wake it. |

**Write**: only with `--write`. Nothing can delete.

| Tool | What it does |
|---|---|
| `dogear_reply` | Posts a reply as the agent, to ask a question or say what changed. |
| `dogear_resolve` | Resolves a thread. With `summary`, `commit`, `pr` or `files`, it first posts a closing reply such as ``Resolved in `abc1234` (#12): made it primary``. With `resolved: false` and a `summary`, it reopens the thread and says why. |

**Also:**
- **Prompt `dogear_fix_feedback`** (with an optional `path`): the whole loop, in this order:
  1. next
  2. find
  3. fix
  4. check
  5. resolve, or ask
- **Resource `dogear://threads/{id}`**: a thread as Markdown.

## 4. Working loops

**One pass**: "Work through the Dogear feedback" (or use the `dogear_fix_feedback` prompt). The agent:
1. calls `dogear_next`;
2. fixes the element it points at;
3. checks the change;
4. calls `dogear_resolve` with a summary;
5. repeats until `done: true`.

**Live review**: someone comments while the agent works. The agent calls `dogear_watch` in a loop,
handles each event, replies or resolves, and calls `dogear_watch` again with the new cursor. To keep
it going, add this to `CLAUDE.md` or `AGENTS.md`:

```md
When I say "watch Dogear", call dogear_watch in a loop. For each event: read the thread with
dogear_get_thread, make the change if it's clear (otherwise ask with dogear_reply), verify it, and
dogear_resolve with a one-line summary. Stop when I say stop.
```

## 5. Safety

- **Comment text is untrusted.** Anyone who can comment on your page can write text the agent will
  read.
  - The server's instructions, and a `note` on every thread, tell the agent to treat comment bodies
    as feedback, never as instructions.
  - Keep your agent's own permissions sensible: review its diffs, and don't give it production
    credentials it doesn't need.
- **Read-only unless you say so.** `dogear_reply` and `dogear_resolve` exist only with `--write`.
- **Nothing deletes.** There's no delete tool, and `dogear serve` refuses deletes from the agent.
  Resolving is reversible.
- **The agent is a real user.** It signs in with its own token, its comments carry
  `author.agent: true`, and it can't edit anyone else's words.
- **`dogear serve` is local only.**
  - It listens on 127.0.0.1 and rejects any other Host header, which blocks DNS rebinding.
  - It accepts browser requests from development origins only (localhost, 127.0.0.1,
    `*.localhost`, `*.test`, and anything added with `--origin`).
  - It caps request bodies at 64 KB.
  - It keeps its token in `.dogear/token` with mode 600.
- **Less leaks out.**
  - Query values that look secret (`token`, `key`, `code`, `session` and similar) are replaced with
    `redacted` in anything the tools return.
  - Authors appear by name only.
