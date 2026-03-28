# Composio Plugin for OpenClaw

[Composio](https://composio.dev) integration for OpenClaw: the gateway connects a per-user MCP session (via `composioApiKey` + `userId`), discovers third-party tools (Gmail, Slack, GitHub, Notion, and many more), registers them as OpenClaw tools, and executes calls through the same session.

## Install

```bash
openclaw plugins install @laburen/openclaw-plugin-composio
```

If you install from a local folder instead, copy the package into your OpenClaw extensions root and enable it in config (same plugin id: `composio`).

## Setup

1. In [Composio](https://app.composio.dev/), create or open your org and obtain:
   - **API key** (`ak_...`) for SDK / MCP session creation.
2. Choose a stable **`userId`** string for the end user (connections and MCP sessions are scoped to this id).
3. Use env-backed config in production where possible; never commit keys.

### Via OpenClaw Config

Minimal example — enable the plugin, set key and user id:

```bash
openclaw config set plugins.entries.composio.config.enabled true
openclaw config set plugins.entries.composio.config.composioApiKey "ak_..."
openclaw config set plugins.entries.composio.config.userId "user-id"
openclaw config set tools.alsoAllow '["composio"]'
```

Restart the gateway after changes:

```bash
openclaw gateway restart
```

## How It Works

- Registers plugin id **`composio`** and reads config via `parseComposioConfig` (nested `plugins.entries.composio.config` or env).
- **Connection**: asynchronously creates a Composio session for `userId` using `composioApiKey`, connects an MCP `Client` to the session URL with the headers Composio returns.
- **Tool catalog**: lists tools via `client.listTools()` on the connected MCP client. Each returned tool is registered with OpenClaw.
- **Execution**: forwards `callTool` to the same MCP client used for discovery.
- **`before_prompt_build`**: injects a `<composio>` system block so the model knows when to prefer Composio (external SaaS) vs native OpenClaw (local machine).

## Configuration

```json
{
  "plugins": {
    "allow": ["composio"],
    "entries": {
      "composio": {
        "enabled": true,
        "config": {
          "enabled": true,
          "composioApiKey": "ak_...",
          "userId": "your-stable-user-id"
        }
      }
    }
  }
}
```

| Option | Description | Default |
|--------|-------------|---------|
| `plugins.entries.composio.enabled` | Turn the plugin entry on or off | — |
| `config.enabled` | Turn the Composio integration on or off | `true` |
| `config.composioApiKey` | Composio API key (`ak_...`) for SDK session, tool discovery, and execution | — (or `COMPOSIO_API_KEY`) |
| `config.userId` | End-user id for connections and MCP session | — (or `COMPOSIO_USER_ID`) |

## CLI

After tools load successfully, the plugin may register a **`composio`** command group. Example:

```bash
openclaw composio remove-toolkit <toolkit-slug>
```

Removes the connected account for the given toolkit for the configured `userId` (requires `composioApiKey` and `userId`).

## Notes

- Both **API key** and **userId** are required — without them the plugin logs a warning and exits without registering tools.
- Keep keys out of logs and rotate them on a schedule.
- Composio-connected work runs in Composio's environment — it cannot read arbitrary files from the user's machine; combine with native OpenClaw tools when a task needs both local and external steps.

## Links

- [Composio](https://composio.dev)
- [OpenClaw](https://github.com/openclaw/openclaw) (ecosystem reference)
