/**
 * SPDX-License-Identifier: MIT
 *
 * OpenClaw plugin entrypoint for Composio MCP tools.
 *
 * Connects a single MCP `Client` to the session URL from `@composio/core`
 * (derived from `composioApiKey` + `userId`), lists tools via
 * `client.listTools()`, registers each with {@link OpenClawPluginApi.registerTool},
 * and executes calls through the same client. Subscribes to `before_prompt_build`
 * to inject `<composio>` system context and optionally registers a
 * `composio remove-toolkit` CLI when tools load successfully.
 *
 * NOTE: `register()` must be synchronous because the plugin loader
 * (`src/plugins/loader.ts:1328-1337`) does NOT await async register —
 * it logs a warning and moves on. All hooks and the MCP bootstrap IIFE
 * are set up synchronously; only the MCP connection + tool listing
 * runs in the background.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { composioPluginConfigSchema, parseComposioConfig } from "./src/config.js";
import { Composio } from "@composio/core";


// ---------------------------------------------------------------------------
// Plugin manifest and registration
// ---------------------------------------------------------------------------

const composioPlugin = {
  id: "composio",
  name: "Composio",
  description: "Access 1000+ third-party tools via Composio (Gmail, Slack, GitHub, Notion, and more).",
  configSchema: composioPluginConfigSchema,

  /**
   * Synchronous register — the loader does NOT await async register
   * (src/plugins/loader.ts:1328-1337). Hooks and state are set up
   * synchronously; the MCP client bootstraps in a fire-and-forget IIFE.
   */
  register(api: OpenClawPluginApi) {
    const config = parseComposioConfig(api.pluginConfig);

    if (!config.enabled) {
      api.logger.debug?.("[composio] Plugin disabled");
      return;
    }

    if (!config.composioApiKey || !config.userId) {
      api.logger.warn(
        "[composio] composioApiKey and userId are required. Set COMPOSIO_API_KEY and COMPOSIO_USER_ID env vars or configure plugins.composio.config.composioApiKey / plugins.composio.config.userId.",
      );
      return;
    }

    let toolCount = 0;
    let connectError = "";
    let ready = false;
    let cliRegistered = false;

    // The MCP client reference — set asynchronously once connected.
    let mcpClient: {
      callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
      close: () => Promise<void>;
    } | null = null;

    // Resolved once the async IIFE finishes (success or failure).
    let resolveMcpReady!: () => void;
    const mcpReady = new Promise<void>((resolve) => {
      resolveMcpReady = resolve;
    });

    const registerDeleteToolkitCli = () => {
      if (cliRegistered) return;
      cliRegistered = true;

      api.registerCli(
        ({ program }) => {
          const composioCmd = program
            .command("composio")
            .description("Composio commands");

          composioCmd
            .command("remove-toolkit <toolkit>")
            .description("Remove a toolkit connection for the configured userId")
            .action(async (toolkit: string) => {
              try {
                const composio = new Composio({ apiKey: config.composioApiKey });
                const userId = config.userId;

                const response = await composio.connectedAccounts.list({ userIds: [userId] });
                const connections = (
                  Array.isArray(response)
                    ? response
                    : (response as { items?: unknown[] })?.items || []
                ) as Array<{ id: string; toolkit?: { slug?: string } }>;

                const conn = connections.find(
                  (c) => c.toolkit?.slug?.toLowerCase() === toolkit.toLowerCase(),
                );

                if (!conn) {
                  console.log(
                    `[composio] No connection found for toolkit "${toolkit}" for user "${userId}".`,
                  );
                  return;
                }

                await composio.connectedAccounts.delete(conn.id);

                console.log(
                  `[composio] Toolkit "${toolkit}" removed for user "${userId}".`,
                );
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.log(`[composio] Error removing toolkit "${toolkit}": ${msg}`);
              }
            });
        },
        { commands: ["composio"] },
      );
    };
    registerDeleteToolkitCli();
    // -----------------------------------------------------------------------
    // System prompt injection (`before_prompt_build`)
    //
    // Registered synchronously — always in the hook runner. Three branches:
    //   1. ready + tools → full Composio guidance
    //   2. ready + no tools → troubleshooting guidance
    //   3. not ready → "loading, please wait"
    // -----------------------------------------------------------------------

    api.on("before_prompt_build", (_event, _ctx) => ({
      prependSystemContext:
        ready && toolCount > 0
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

"The Composio plugin is installed but couldn't load its tools. Please get in touch with support.
</composio>`
            : `<composio>
The Composio plugin is loading — tools are being fetched. They should be available shortly.
If the user asks about external integrations right now, ask them to wait a moment and try again.
Do NOT use pretrained knowledge about Composio APIs or SDKs.
</composio>`,
    }));

    // -----------------------------------------------------------------------
    // Cleanup on gateway stop — registered synchronously so it's always
    // in the hook runner. The handler itself checks if the client exists.
    // -----------------------------------------------------------------------

    api.on("gateway_stop", async () => {
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch {}
      }
    });

    // -----------------------------------------------------------------------
    // Async MCP bootstrap (fire-and-forget IIFE)
    //
    // Runs after register() returns. Tools registered here will be in
    // registry.tools by the time the first agent turn calls
    // resolvePluginTools — in practice the MCP handshake + listTools
    // completes well before the user sends their first message.
    // -----------------------------------------------------------------------

    api.logger.info("[composio] Connecting MCP client and fetching tools...");

    (async () => {
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
          requestInit: { headers: mcp.headers },
        }),
      );
      mcpClient = client;
      api.logger.info("[composio] MCP client connected");

      const { tools } = await client.listTools();

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
                    text: "Error: Composio MCP client is not connected.",
                  },
                ],
                details: null,
              };
            }

            try {
              const result = (await mcpClient.callTool({
                name: tool.name,
                arguments: params,
              })) as {
                content?: Array<{ type: string; text?: string }>;
              };

              const text = Array.isArray(result.content)
                ? result.content
                    .map((c) => (c.type === "text" ? (c.text ?? "") : JSON.stringify(c)))
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
      resolveMcpReady();
      api.logger.info(`[composio] Ready — ${toolCount} tools registered`);
    })().catch((err) => {
      connectError = err instanceof Error ? err.message : String(err);
      ready = true;
      resolveMcpReady();
      api.logger.error(`[composio] Failed to connect: ${connectError}`);
    });
  },
};

export default composioPlugin;
