# Honcho Codex MCP

Codex-oriented Honcho plugin runtime.

This package provides two runtime surfaces that are bundled together:

- a local stdio MCP server for Codex
- two Codex hook entrypoints used by the plugin manifest

The shared MCP tool surface still comes from the Honcho TypeScript SDK and the
same tool registration layer used by the original `honcho/mcp` server.

## What this package ships

After `bun run build`, the plugin consumes these artifacts:

- `dist/index.js` — stdio MCP entrypoint used by `.codex-plugin/mcp.json`
- `dist/hooks/session-start.js` — Codex `SessionStart` hook
- `dist/hooks/prompt-submit.js` — Codex `UserPromptSubmit` hook

The installed plugin manifest points Codex at those built files instead of the
source tree.

## Environment

The local MCP server reads standard Honcho environment variables first, then
falls back to `~/.honcho/config.json` when available:

- `HONCHO_API_KEY` — required unless `honcho init` already stored `apiKey`
- `HONCHO_API_URL` — optional, defaults to `https://api.honcho.dev`
- `HONCHO_WORKSPACE_ID` — optional, defaults to `default`
- `HONCHO_USER_NAME` — optional
- `HONCHO_ASSISTANT_NAME` — optional
- `HONCHO_AUTO_START_BACKEND=1` — optional opt-in flag for local Docker auto-start

### Auto-start behavior

Local backend auto-start is disabled by default.

If `HONCHO_API_URL` points at a local Honcho instance and that endpoint is not
reachable, the MCP server only logs a warning unless
`HONCHO_AUTO_START_BACKEND=1` is set.

When the opt-in flag is enabled, the server looks for `docker-compose.yml`
near the plugin root and attempts `docker compose up -d`. No compose or env
files are copied or generated automatically.

## Available tools

**Workspace:** `inspect_workspace`, `list_workspaces`, `search`, `get_metadata`, `set_metadata`

**Peers:** `create_peer`, `list_peers`, `chat`, `get_peer_card`, `set_peer_card`, `get_peer_context`, `get_representation`

**Sessions:** `create_session`, `list_sessions`, `delete_session`, `clone_session`, `add_peers_to_session`, `remove_peers_from_session`, `get_session_peers`, `inspect_session`, `add_messages_to_session`, `get_session_messages`, `get_session_message`, `get_session_context`

**Conclusions:** `list_conclusions`, `query_conclusions`, `create_conclusions`, `delete_conclusion`

**System:** `schedule_dream`, `get_queue_status`

## Hooks

The plugin includes two Codex hooks:

- `SessionStart`
- `UserPromptSubmit`

`SessionStart` verifies that the Honcho session can be resolved and injects a
small availability notice.

`UserPromptSubmit` keeps best-effort prompt-time context injection. It asks
Honcho for session context and returns `additionalContext` in Codex hook
format, but the host may ignore that payload. Reliable personalization should
still come from the Honcho MCP tools and the MCP server instructions.

## Development

### Setup

```bash
bun install
```

### Build plugin artifacts

```bash
bun run build
```

### Type-check

```bash
bun run check
```

### Release verification

```bash
bun run verify:release
```

### Run the local stdio server

```bash
HONCHO_API_KEY=your-key node ./dist/index.js
```

### Worker development

The shared Cloudflare Worker entrypoint is still available for the HTTP MCP
server implementation:

```bash
bun dev
```

For Worker-local testing, create `mcp/.dev.vars` from `.dev.vars.example` when
you need a custom `HONCHO_API_URL`.
