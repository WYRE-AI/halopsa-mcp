#!/usr/bin/env node
/**
 * HaloPSA MCP Server
 *
 * This MCP server provides tools for interacting with the HaloPSA API.
 * All tools are listed upfront so they work with every MCP client, including
 * remote connectors (claude.ai, mcp-remote) that do not support dynamic
 * tool-list changes. A helper `halopsa_navigate` tool provides domain
 * discovery and guidance.
 *
 * Supports both stdio and HTTP transports:
 * - stdio: default, for local CLI usage
 * - http: set MCP_TRANSPORT=http for hosted/gateway deployments
 *
 * Credentials are provided via environment variables:
 * - HALOPSA_CLIENT_ID
 * - HALOPSA_CLIENT_SECRET
 * - HALOPSA_TENANT or HALOPSA_BASE_URL
 *
 * In gateway mode (AUTH_MODE=gateway), credentials come from request headers:
 * - X-Halo-Client-ID
 * - X-Halo-Client-Secret
 * - X-Halo-Tenant
 * - X-Halo-Base-URL
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDomainHandler, getAvailableDomains } from "./domains/index.js";
import { isDomainName, type DomainName } from "./utils/types.js";
import {
  getCredentials,
  runWithCredentials,
  type HaloPsaCredentials,
} from "./utils/client.js";
import { setServerRef } from "./utils/server-ref.js";
import { registerPromptHandlers } from "./prompts.js";

/**
 * Available domains for navigation
 */
type Domain = "tickets" | "clients" | "assets" | "agents" | "invoices";

/**
 * Domain metadata for navigation
 */
const domainDescriptions: Record<Domain, string> = {
  tickets: "Ticket management - list, get, create, update tickets and manage support workflow",
  clients: "Client/company management - list and get client information and relationships",
  assets: "Asset management - list and get hardware/software assets, configurations",
  agents: "Agent management - list and get support staff and technician information",
  invoices: "Invoice management - list and get billing and invoice information",
};

/**
 * Navigation / discovery tool - helps the LLM find the right tools
 *
 * This is a stateless helper that describes available tools for a domain.
 * All domain tools are always listed in tools/list regardless of navigation
 * state, because many MCP clients (claude.ai connectors, mcp-remote) only
 * fetch the tool list once and do not support notifications/tools/list_changed.
 */
const navigateTool: Tool = {
  name: "halopsa_navigate",
  description:
    "Discover available HaloPSA tools by domain. Returns tool names and descriptions for the selected domain. All tools are callable at any time — this is a help/discovery aid, not a prerequisite.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: getAvailableDomains(),
        description: `The domain to explore:
- tickets: ${domainDescriptions.tickets}
- clients: ${domainDescriptions.clients}
- assets: ${domainDescriptions.assets}
- agents: ${domainDescriptions.agents}
- invoices: ${domainDescriptions.invoices}`,
      },
    },
    required: ["domain"],
  },
};

/**
 * Status tool - shows credentials status and available domains
 */
const statusTool: Tool = {
  name: "halopsa_status",
  description: "Show credentials status and available domains",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Map from domain name to its tool definitions (loaded lazily)
 */
const domainToolMap = new Map<DomainName, Tool[]>();

/**
 * All domain tools, collected once at startup
 */
let allDomainTools: Tool[] | null = null;

/**
 * Load all domain tools (lazy-loaded on first access)
 */
async function getAllDomainTools(): Promise<Tool[]> {
  if (allDomainTools !== null) {
    return allDomainTools;
  }

  const domains = getAvailableDomains();
  const tools: Tool[] = [];

  for (const domain of domains) {
    if (!domainToolMap.has(domain)) {
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();
      domainToolMap.set(domain, domainTools);
    }
    tools.push(...domainToolMap.get(domain)!);
  }

  allDomainTools = tools;
  return tools;
}

/**
 * Create a fresh MCP server instance with all handlers registered.
 * Called once for stdio, or per-request for HTTP transport.
 */
function createMcpServer(): Server {

  const server = new Server(
    {
      name: "halopsa-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );
  setServerRef(server);
  registerPromptHandlers(server);

  /**
   * Handle ListTools requests - always returns ALL tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const domainTools = await getAllDomainTools();
    return { tools: [navigateTool, statusTool, ...domainTools] };
  });

  /**
   * Handle CallTool requests
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Handle navigation / discovery helper
      if (name === "halopsa_navigate") {
        const { domain } = args as { domain: Domain };

        if (!isDomainName(domain)) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid domain: ${domain}. Available domains: ${getAvailableDomains().join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const handler = await getDomainHandler(domain);
        const tools = handler.getTools();

        const toolSummary = tools
          .map((t) => `- ${t.name}: ${t.description}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `${domainDescriptions[domain]}\n\nAvailable tools:\n${toolSummary}\n\nYou can call any of these tools directly.`,
            },
          ],
        };
      }

      if (name === "halopsa_status") {
        const creds = getCredentials();
        const credStatus = creds
          ? `Configured (tenant: ${creds.tenant || creds.baseUrl})`
          : "NOT CONFIGURED - Please set environment variables";

        return {
          content: [
            {
              type: "text",
              text: `HaloPSA MCP Server Status\n\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(", ")}\n\nAll tools are available at all times. Use halopsa_navigate to discover tools by domain.`,
            },
          ],
        };
      }

      // Route to appropriate domain handler
      const toolArgs = (args ?? {}) as Record<string, unknown>;

      if (name.startsWith("halopsa_tickets_")) {
        const handler = await getDomainHandler("tickets");
        return await handler.handleCall(name, toolArgs);
      }
      if (name.startsWith("halopsa_clients_")) {
        const handler = await getDomainHandler("clients");
        return await handler.handleCall(name, toolArgs);
      }
      if (name.startsWith("halopsa_assets_")) {
        const handler = await getDomainHandler("assets");
        return await handler.handleCall(name, toolArgs);
      }
      if (name.startsWith("halopsa_agents_")) {
        const handler = await getDomainHandler("agents");
        return await handler.handleCall(name, toolArgs);
      }
      if (name.startsWith("halopsa_invoices_")) {
        const handler = await getDomainHandler("invoices");
        return await handler.handleCall(name, toolArgs);
      }

      // Unknown tool
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}. Use halopsa_navigate to discover available tools by domain.`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Extract gateway credentials from HTTP request headers.
 * Returns the credentials object or null if required headers are missing.
 * Does NOT mutate process.env — credentials are bound per-request via AsyncLocalStorage.
 */
function extractGatewayCredentials(
  req: IncomingMessage
): HaloPsaCredentials | null {
  const clientId = req.headers["x-halo-client-id"] as string | undefined;
  const clientSecret = req.headers["x-halo-client-secret"] as
    | string
    | undefined;
  const tenant = req.headers["x-halo-tenant"] as string | undefined;
  const baseUrl = req.headers["x-halo-base-url"] as string | undefined;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret, tenant, baseUrl };
}

/**
 * Start the server with HTTP Streamable transport.
 * Each request gets a fresh Server + Transport (stateless).
 */
async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );

      // Health endpoint - no auth required
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            transport: "http",
            authMode: isGatewayMode ? "gateway" : "env",
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // MCP endpoint
      if (url.pathname === "/mcp") {
        // In gateway mode, extract credentials and bind them to the
        // request's async context — no process.env mutation.
        const handleMcp = () => {
          const server = createMcpServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });

          res.on("close", () => {
            transport.close();
            server.close();
          });

          server.connect(transport).then(() => {
            transport.handleRequest(req, res);
          });
        };

        if (isGatewayMode) {
          const creds = extractGatewayCredentials(req);
          if (!creds) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Missing credentials",
                message:
                  "Gateway mode requires X-Halo-Client-ID and X-Halo-Client-Secret headers",
                required: ["X-Halo-Client-ID", "X-Halo-Client-Secret"],
              })
            );
            return;
          }
          runWithCredentials(creds, handleMcp);
        } else {
          handleMcp();
        }
        return;
      }

      // 404 for everything else
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] })
      );
    }
  );

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      console.error(`HaloPSA MCP Server listening on http://${host}:${port}/mcp`);
      console.error(`Health check available at http://${host}:${port}/health`);
      console.error(
        `Authentication mode: ${isGatewayMode ? "gateway (header-based)" : "env (environment variables)"}`
      );
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.error("Shutting down HaloPSA MCP Server...");
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Start the server with stdio transport (default)
 */
async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HaloPSA MCP server running on stdio (decision tree mode)");
}

// Start the server
async function main() {
  const transportType = process.env.MCP_TRANSPORT || "stdio";

  if (transportType === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch(console.error);
