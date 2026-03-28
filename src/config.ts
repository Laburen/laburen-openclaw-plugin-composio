/**
 * SPDX-License-Identifier: MIT
 *
 * Zod schema, env-aware parsing, and UI hints for Composio plugin config.
 *
 * `parseComposioConfig` normalizes OpenClaw's plugin config object (nested `config` or top-level keys), merges `process.env` overrides, and returns a validated {@link ComposioConfig}. `composioPluginConfigSchema` is the shape expected by the host for settings UI (`uiHints`) and parsing (`parse`).
 */

import { z } from "zod";
import type { ComposioConfig } from "./types.js";

/**
 * Validates primitive fields after {@link parseComposioConfig} supplies defaults and env fallbacks.
 */
export const ComposioConfigSchema = z.object({
  enabled: z.boolean().default(true),
  composioApiKey: z.string().default(""),
  userId: z.string().default(""),
});

/**
 * Parses host plugin config and environment into a {@link ComposioConfig}.
 *
 * Reads `config.composioApiKey` (or top-level `composioApiKey`), same for `userId`, then `COMPOSIO_*` env vars where strings are empty.
 *
 * @param value - Raw `api.pluginConfig` or similar unknown object.
 */
export function parseComposioConfig(value: unknown): ComposioConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const configObj = raw.config as Record<string, unknown> | undefined;

  const composioApiKey =
    (typeof configObj?.composioApiKey === "string" && configObj.composioApiKey.trim()) ||
    (typeof raw.composioApiKey === "string" && raw.composioApiKey.trim()) ||
    process.env.COMPOSIO_API_KEY ||
    "";

  const userId =
    (typeof configObj?.userId === "string" && configObj.userId.trim()) ||
    (typeof raw.userId === "string" && raw.userId.trim()) ||
    process.env.COMPOSIO_USER_ID ||
    "";

  return ComposioConfigSchema.parse({
    ...raw,
    composioApiKey,
    userId,
  });
}

/**
 * OpenClaw plugin config descriptor: `parse` delegate and per-field `uiHints` for the settings UI.
 */
export const composioPluginConfigSchema = {
  parse: parseComposioConfig,
  uiHints: {
    enabled: {
      label: "Enable Composio",
      help: "Enable or disable the Composio integration",
    },
    composioApiKey: {
      label: "Composio API key",
      help: "Your Composio API key (ak_...) for SDK / MCP session — from Composio platform",
      sensitive: true,
    },
    userId: {
      label: "User ID",
      help: "End-user identifier passed to Composio for connections and MCP session",
    },
  },
};
