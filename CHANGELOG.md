# Changelog

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
