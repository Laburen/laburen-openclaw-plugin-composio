# Composio Plugin for OpenClaw

[Composio](https://composio.dev) integration for OpenClaw: the gateway discovers third-party tools (Gmail, Slack, GitHub, Notion, and many more) via Composio’s MCP endpoint, registers them as OpenClaw tools, and runs calls through a per-user MCP session created with the Composio SDK.

## Install

```bash
openclaw plugins install @laburen/openclaw-plugin-composio
```

If you install from a local folder instead, copy the package into your OpenClaw extensions root and enable it in config (same plugin id: `composio`).

## Prerequisites

- **`curl`** on the host `PATH` — used once at startup to call JSON-RPC `tools/list` on the Composio MCP URL (synchronous catalog discovery).

## Setup

1. In [Composio](https://app.composio.dev/), create or open your org and obtain:
   - **Consumer key** (`ck_...`) for the OpenClaw client — from [dashboard connect / OpenClaw client](https://dashboard.composio.dev/~/org/connect/clients/openclaw).
   - **API key** (`ak_...`) for SDK / MCP session creation.
2. Choose a stable **`userId`** string for the end user (connections and MCP sessions are scoped to this id).
3. Use env-backed config in production where possible; never commit keys.

### Via OpenClaw Config

Minimal example — enable the plugin, set keys and user id:

```bash
openclaw config set plugins.allow '["composio"]'
openclaw config set plugins.entries.composio.enabled true
openclaw config set plugins.entries.composio.config.enabled true
openclaw config set plugins.entries.composio.config.consumerKey "ck_..."
openclaw config set plugins.entries.composio.config.composioApiKey "ak_..."
openclaw config set plugins.entries.composio.config.userId "your-stable-user-id"
```

Restart the gateway after changes:

```bash
openclaw gateway restart
```

## How It Works

- Registers plugin id **`composio`** and reads config via `parseComposioConfig` (nested `plugins.entries.composio.config` or env).
- **Tool catalog**: synchronous `POST` to `mcpUrl` with JSON-RPC `tools/list`, header `x-consumer-api-key: <consumerKey>`. Each returned tool is registered with OpenClaw.
- **Execution**: asynchronously creates a Composio session for `userId`, connects an MCP `Client` to the session URL with the headers Composio returns, and forwards `callTool` to that client.
- **`before_prompt_build`**: injects a `<composio>` system block so the model knows when to prefer Composio (external SaaS) vs native OpenClaw (local machine).
- Without `composioApiKey` / `userId`, tools may still **list**, but **calls** return an error until both are set and the gateway is restarted.

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
          "consumerKey": "ck_...",
          "composioApiKey": "ak_...",
          "userId": "your-stable-user-id",
          "mcpUrl": "https://connect.composio.dev/mcp"
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
| `config.consumerKey` | Composio consumer key (`ck_...`) for MCP `tools/list` | — (or `COMPOSIO_CONSUMER_KEY`) |
| `config.composioApiKey` | Composio API key (`ak_...`) for SDK session / tool execution | — (or `COMPOSIO_API_KEY`) |
| `config.userId` | End-user id for connections and MCP session | — (or `COMPOSIO_USER_ID`) |
| `config.mcpUrl` | Composio MCP base URL for catalog discovery | `https://connect.composio.dev/mcp` |

## CLI

After tools load successfully, the plugin may register a **`composio`** command group. Example:

```bash
openclaw composio remove-toolkit <toolkit-slug>
```

Removes the connected account for the given toolkit for the configured `userId` (requires `composioApiKey` and `userId`).

## Notes

- **Consumer key** is required for startup tool discovery; **API key** and **userId** are required for actual tool execution over MCP.
- Keep keys out of logs and rotate them on a schedule.
- Composio-connected work runs in Composio’s environment — it cannot read arbitrary files from the user’s machine; combine with native OpenClaw tools when a task needs both local and external steps.

## Links

- [Composio](https://composio.dev)
- [OpenClaw](https://github.com/openclaw/openclaw) (ecosystem reference)
- [Composio dashboard — OpenClaw client](https://dashboard.composio.dev/~/org/connect/clients/openclaw)
