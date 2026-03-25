/**
 * SPDX-License-Identifier: MIT
 *
 * Shared Composio plugin configuration types.
 *
 * These fields mirror the shape produced by `parseComposioConfig` in `config.ts` after Zod validation and env fallbacks (`COMPOSIO_CONSUMER_KEY`, `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID`).
 */

/**
 * Runtime Composio settings for this plugin instance (`consumerKey`, MCP URL, SDK key, end-user id).
 */
export interface ComposioConfig {
  /** When false, `register` exits early and no tools or hooks are installed. */
  enabled: boolean;
  /** Consumer key (`ck_...`) for the public MCP `tools/list` HTTP endpoint; sent as `x-consumer-api-key`. */
  consumerKey: string;
  /** Base URL for JSON-RPC MCP over HTTP (default Composio connect endpoint). */
  mcpUrl: string;
  /** Composio platform API key (`ak_...`) used with the `Composio` client (`@composio/core`) for sessions and CLI. */
  composioApiKey: string;
  /** End-user identifier passed to Composio for connected accounts and MCP. */
  userId: string;
}
