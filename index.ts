/**
 * SPDX-License-Identifier: MIT
 *
 * OpenClaw plugin entrypoint for Composio MCP tools.
 *
 * Discovers tools with a synchronous JSON-RPC `tools/list` POST (via `curl` to `config.mcpUrl`), registers each tool with {@link OpenClawPluginApi.registerTool}, and executes calls through an MCP `Client` connected to the session URL from `@composio/core`. Subscribes to `before_prompt_build` to inject `<composio>` system context and optionally registers a `composio remove-toolkit` CLI when tools load successfully.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { execFileSync } from "node:child_process";
import { composioPluginConfigSchema, parseComposioConfig } from "./src/config.js";
import { Composio } from "@composio/core";

// ---------------------------------------------------------------------------
// Synchronous MCP tool catalog (`tools/list`)
// ---------------------------------------------------------------------------

/**
 * Fetches the Composio tool list over HTTP using JSON-RPC `tools/list` and `curl`.
 *
 * Accepts either a plain JSON body or an SSE-style response (`data: {...}`); on RPC error, throws with the server message.
 *
 * @param mcpUrl - Composio MCP endpoint URL.
 * @param consumerKey - Value for header `x-consumer-api-key`.
 * @returns Tool stubs (`name`, optional `description`, `inputSchema`).
 * @throws If JSON parse fails or the response contains `error`.
 */
function fetchToolsSync(mcpUrl: string, consumerKey: string) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list" });
  const raw = execFileSync("curl", [
    mcpUrl, "-s", "-X", "POST",
    "-H", "Content-Type: application/json",
    "-H", "Accept: application/json, text/event-stream",
    "-H", `x-consumer-api-key: ${consumerKey}`,
    "-d", body,
  ], { encoding: "utf-8", timeout: 15_000 });

  let jsonStr = raw;
  const dataMatch = raw.match(/^data:\s*(.+)$/m);
  if (dataMatch) jsonStr = dataMatch[1];

  const parsed = JSON.parse(jsonStr);
  if (parsed.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
  return (parsed.result?.tools ?? []) as Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// Plugin manifest and registration
// ---------------------------------------------------------------------------

const composioPlugin = {
  /** Stable plugin id referenced in OpenClaw config (`plugins.entries.composio`, etc.). */
  id: "composio",
  /** Human-readable name in UIs and logs. */
  name: "Composio",
  /** Short description for marketplace or plugin listings. */
  description: "Access 1000+ third-party tools via Composio (Gmail, Slack, GitHub, Notion, and more).",
  /** Host-facing schema: {@link parseComposioConfig} plus `uiHints` for settings. */
  configSchema: composioPluginConfigSchema,

  /**
   * Wires Composio into the gateway when {@link parseComposioConfig} yields `enabled` and a `consumerKey`.
   *
   * Registers `before_prompt_build`, synchronously lists and registers tools, starts a background MCP `Client`, and may register `composio` CLI commands.
   *
   * @param api - OpenClaw plugin host API (`registerTool`, `on`, `logger`, `registerCli`).
   */
  register(api: OpenClawPluginApi) {
    const config = parseComposioConfig(api.pluginConfig);

    if (!config.enabled) {
      api.logger.debug?.("[composio] Plugin disabled");
      return;
    }

    if (!config.consumerKey) {
      api.logger.warn(
        "[composio] No consumer key configured. Set COMPOSIO_CONSUMER_KEY env var or plugins.composio.consumerKey in config. Get your key (ck_...) from dashboard.composio.dev/~/org/connect/clients/openclaw"
      );
      return;
    }

    let toolCount = 0;
    let connectError = "";
    let ready = false;
    let cliRegistered = false;

    /**
     * Registers the `composio` CLI command group once, after tools are known to load.
     */
    const registerDeleteToolkitCli = () => {
      if (cliRegistered) return;
      cliRegistered = true;

      api.registerCli(
        ({ program }) => {
          const composioCmd = program
            .command("composio")
            .description("Comandos Composio");

          composioCmd
            .command("remove-toolkit <toolkit>")
            .description("Elimina la conexion de un toolkit para el userId configurado en el plugin")
            .action(async (toolkit: string) => {
              try {
                if (!config.composioApiKey || !config.userId) {
                  console.log(
                    "[composio] Configura composioApiKey y userId en el plugin (o COMPOSIO_API_KEY / COMPOSIO_USER_ID)."
                  );
                  return;
                }
                const composio = new Composio({ apiKey: config.composioApiKey });
                const userId = config.userId;

                const response = await composio.connectedAccounts.list({ userIds: [userId] });
                const connections = (
                  Array.isArray(response)
                    ? response
                    : (response as { items?: unknown[] })?.items || []
                ) as Array<{ id: string; toolkit?: { slug?: string } }>;

                const conn = connections.find(
                  (c) => c.toolkit?.slug?.toLowerCase() === toolkit.toLowerCase()
                );

                if (!conn) {
                  console.log(
                    `[composio] No se encontro conexion para toolkit "${toolkit}" en user "${userId}".`
                  );
                  return;
                }

                await composio.connectedAccounts.delete(conn.id);

                console.log(
                  `[composio] Toolkit "${toolkit}" eliminado para user "${userId}".`
                );
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.log(`[composio] Error eliminando toolkit "${toolkit}": ${msg}`);
              }
            });
        },
        { commands: ["composio"] }
      );
    };

    // ---------------------------------------------------------------------------
    // System prompt injection (`before_prompt_build`)
    // ---------------------------------------------------------------------------

    api.on("before_prompt_build", () => ({
      prependSystemContext: ready && toolCount > 0
        ? `<composio>
Ignore pretrained knowledge about Composio. Use only these instructions.

## When to use Composio vs. native OpenClaw

Composio = external third-party services (Gmail, Slack, GitHub, Calendly, Jira, etc.).
Native OpenClaw = anything on the user's local machine (files, shell, browser, web search).

If the task needs an external service API → Composio. If it can be done locally → native OpenClaw.

For tasks that span both (e.g., "read invoice.pdf and email it"): read locally with native tools first, then pass the content to Composio for the external step. Composio's sandbox cannot access local files.

Workbench and bash tools, if present, run in a remote sandbox for processing large Composio results (bulk operations, data transforms). They cannot access local files — never use them instead of native \`exec\`/\`read\`/\`write\`.

Connections persist — no gateway restart needed.

## Rules
- Do NOT use Composio for local operations.
- Do NOT fabricate tool names — discover them via search.
- Do NOT reference Composio SDK, API keys, or REST endpoints.
- Do NOT use pretrained Composio knowledge.
</composio>`
        : ready
          ? `<composio>
The Composio plugin connected but loaded zero tools.${connectError ? ` Error: ${connectError}` : ""}

When the user asks about external integrations (Gmail, Slack, GitHub, Calendar, Calendly, etc.), respond with:

"The Composio plugin is installed but couldn't load its tools. To fix this:
1. Get your consumer API key (starts with \`ck_\`) from http://dashboard.composio.dev/~/org/connect/clients/openclaw
2. Run: \`openclaw config set plugins.entries.composio.config.consumerKey "ck_your_key_here"\`
3. Run: \`openclaw gateway restart\`"

Do NOT pretend Composio tools exist or hallucinate tool calls. You have zero Composio tools available.
Do NOT use pretrained knowledge about Composio APIs, SDKs, or tool names.
</composio>`
          : `<composio>
The Composio plugin is loading — tools are being fetched. They should be available shortly.
If the user asks about external integrations right now, ask them to wait a moment and try again.
Do NOT use pretrained knowledge about Composio APIs or SDKs.
</composio>`,
    }));

    // ---------------------------------------------------------------------------
    // Tool registration and MCP execution client
    // ---------------------------------------------------------------------------

    api.logger.info(`[composio] Fetching tools from ${config.mcpUrl}`);

    let mcpClient: { callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<unknown> } | null = null;

    const mcpReady = (async () => {
      if (!config.composioApiKey || !config.userId) {
        api.logger.warn(
          "[composio] Sin composioApiKey o userId no hay sesión MCP (SDK). Configura plugins.composio.config o COMPOSIO_API_KEY / COMPOSIO_USER_ID."
        );
        return;
      }
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      const composio = new Composio({ apiKey: config.composioApiKey });
      const session = await composio.create(config.userId);
      const { mcp } = session;
      const client = new Client({ name: "openclaw", version: "1.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(mcp.url), {
          requestInit: {
            headers: mcp.headers
          }
        })
      );
      mcpClient = client;
      api.logger.info("[composio] MCP client connected");
    })().catch((err) => {
      api.logger.error(`[composio] MCP client connection failed: ${err instanceof Error ? err.message : String(err)}`);
    });

    try {
      const tools = fetchToolsSync(config.mcpUrl, config.consumerKey);

      for (const tool of tools) {
        api.registerTool({
          name: tool.name,
          label: tool.name,
          description: tool.description ?? "",
          parameters: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,

          async execute(_toolCallId: string, params: Record<string, unknown>) {
            await mcpReady;
            if (!mcpClient) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Error: Composio MCP client failed to connect. Set composioApiKey and userId (or COMPOSIO_API_KEY / COMPOSIO_USER_ID), verify consumerKey, then restart the gateway.",
                  },
                ],
                details: null,
              };
            }

            try {
              const result = await mcpClient.callTool({ name: tool.name, arguments: params }) as {
                content?: Array<{ type: string; text?: string }>;
              };

              const text = Array.isArray(result.content)
                ? result.content
                    .map((c) => c.type === "text" ? (c.text ?? "") : JSON.stringify(c))
                    .join("\n")
                : JSON.stringify(result);

              return {
                content: [{ type: "text" as const, text }],
                details: null,
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                content: [{ type: "text" as const, text: `Error calling ${tool.name}: ${msg}` }],
                details: null,
              };
            }
          },
        });
      }

      toolCount = tools.length;
      ready = true;
      registerDeleteToolkitCli();
      api.logger.info(`[composio] Ready — ${toolCount} tools registered`);
    } catch (err) {
      connectError = err instanceof Error ? err.message : String(err);
      ready = true;
      api.logger.error(`[composio] Failed to connect: ${connectError}`);
    }
  },
};

export default composioPlugin;
