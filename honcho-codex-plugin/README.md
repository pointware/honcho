# Honcho Codex Plugin

This directory is a Codex plugin bundle that can be published inside a GitHub
repository and installed through a Codex marketplace.

## What ships in this bundle

- `.codex-plugin/plugin.json` as the Codex plugin entry point
- `.codex-plugin/hooks.json` for `SessionStart` and `UserPromptSubmit`
- `.codex-plugin/mcp.json` for the MCP server definition
- `mcp/dist/index.js` and `mcp/dist/hooks/*.js` as prebuilt runtime artifacts

The `mcp/dist` files are part of the distributable bundle and should be rebuilt
and committed before publishing changes.

## Publish checklist

This plugin now lives inside the `honcho` repository and expects the GitHub
marketplace root to be that repository root.

1. In `honcho-codex-plugin/mcp/`, install dependencies with `bun install`
2. In the same directory, run `bun run verify:release`
3. Confirm these built files exist and are updated:
   - `honcho-codex-plugin/mcp/dist/index.js`
   - `honcho-codex-plugin/mcp/dist/hooks/session-start.js`
   - `honcho-codex-plugin/mcp/dist/hooks/prompt-submit.js`
4. Commit the plugin files together with `/.agents/plugins/marketplace.json`
5. Push the `honcho` repository to GitHub

## Install from GitHub

After the `honcho` repository is pushed to GitHub, another Codex user can add
the marketplace with:

```bash
codex plugin marketplace add <owner>/<repo>
```

Then:

1. Restart Codex
2. Open `/plugins`
3. Choose the `Honcho` marketplace
4. Install `Honcho`

The marketplace definition is stored at `honcho/.agents/plugins/marketplace.json`
inside this workspace, which becomes `/.agents/plugins/marketplace.json` at the
root of the published GitHub repository.

## Required environment variables

Set these before launching Codex:

- `HONCHO_API_KEY` required
- `HONCHO_WORKSPACE_ID` optional, defaults to `default`
- `HONCHO_USER_NAME` optional, defaults to the local user name
- `HONCHO_ASSISTANT_NAME` optional, defaults to `assistant`
- `HONCHO_API_URL` optional, defaults to `https://api.honcho.dev`

## Optional local backend auto-start

If you are pointing `HONCHO_API_URL` to a local Honcho server such as
`http://127.0.0.1:8000`, you can opt in to automatic backend startup by setting:

```bash
HONCHO_AUTO_START_BACKEND=1
```

When enabled, the MCP process will attempt `docker compose up -d` only if the
configured Honcho URL is local, the backend is not already running, and a
nearby `docker-compose.yml` is present.
