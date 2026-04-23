# Changelog

## 0.0.13

### Changes

- **CLI/gateway:** Registers the `composio` CLI command synchronously during plugin `register()` (before the async MCP bootstrap), fixing late command registration where it could be missing from the gateway right after startup.

## 0.1.0

### Breaking

- **Config/schema:** `consumerKey`, `mcpUrl`, and `COMPOSIO_CONSUMER_KEY` are removed from `openclaw.plugin.json`, `src/config.ts`, and `src/types.ts`. The plugin requires `composioApiKey` and `userId` (or `COMPOSIO_API_KEY` / `COMPOSIO_USER_ID`) before registering tools or hooks; without both it logs a warning and exits early.
- **Packaging:** `openclaw.plugin.json` no longer declares `skills`, and the `skills/` directory is removed from published `files` in `package.json`. The bundled `composio` and `composio-mcp` skill markdown files are deleted.

### Changes

- **Core/MCP:** One MCP `Client` connects to the session URL from `@composio/core` (`composioApiKey` + `userId`); tool catalog comes from `client.listTools()` on that client instead of a synchronous `curl` JSON-RPC `tools/list` POST to `mcpUrl` with `x-consumer-api-key`.
- **Lifecycle:** Subscribes to `gateway_stop` and closes the MCP client when the gateway stops.
- **Prompt/hooks:** `before_prompt_build` distinguishes loading, zero tools after connect, and ready states; zero-tool troubleshooting text no longer points users at consumer-key setup.
- **CLI:** `composio` command descriptions and `remove-toolkit` user-facing messages are in English; redundant `composioApiKey` / `userId` checks in `remove-toolkit` are removed because the plugin already requires them at startup.
- **Docs/README:** README describes API key + `userId` only, `tools.alsoAllow`, drops `curl` / consumer key prerequisites, and updates the options table and “How it works” to match MCP-only discovery.

## 0.0.11

### Changes

- **CI/publish:** The npm publish workflow (`.github/workflows/publish.yml`) uses `branches: [master]` instead of `main`, matching the repository default branch so Actions runs trigger on pushes that change `package.json`.

## 0.0.10

### Changes

- **Docs/README:** The `userId` example in `openclaw config set` commands uses the `"user-id"` placeholder instead of `"your-stable-user-id"`.
- **Docs/Changelog:** The 0.0.9 release notes no longer include a **Fixes** section (note about the publish workflow and the `main` branch).

## 0.0.9

### Breaking

- **Core/MCP:** Composio tool execution no longer relies only on `mcpUrl` and the `x-consumer-api-key` header with `consumerKey`. In `index.ts`, the MCP connection (`StreamableHTTPClientTransport`) uses the URL and headers from the session created with `new Composio({ apiKey }).create(userId)` from `@composio/core`. Without `composioApiKey` and `userId` (or without the `COMPOSIO_API_KEY` and `COMPOSIO_USER_ID` environment variables read in `parseComposioConfig` in `src/config.ts`), `mcpClient` is not initialized and tool calls fail, while `consumerKey` remains required for synchronous `fetchToolsSync` listing and tool name registration.

### Changes

- **Entry/CLI:** Registers the `composio remove-toolkit <toolkit>` subcommand via `api.registerCli` in `index.ts`, which lists connected accounts with `composio.connectedAccounts.list`, matches by `toolkit.slug`, and removes with `connectedAccounts.delete` using the plugin `userId`.
- **Packaging/manifest:** `openclaw.plugin.json` extends the schema and `uiHints` with `composioApiKey` (sensitive) and `userId`; `composioPluginConfigSchema` in `src/config.ts` mirrors the same hints and `src/types.ts` extends `ComposioConfig` with both fields.
- **Packaging/Dependencies:** `package.json` adds `@composio/core` (^0.6.7) for the MCP session and CLI operations on connected accounts.
- **Entry/Tools:** When `mcpClient` is unavailable after `mcpReady` in `execute`, the returned message tells users to set `composioApiKey` and `userId` (or env vars), verify `consumerKey`, and restart the gateway, replacing the message that only mentioned the consumer key.
- **Docs/README:** `README.md` is cleared of the installation instructions, `openclaw config`, and options table that shipped in earlier versions.
