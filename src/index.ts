#!/usr/bin/env node
/**
 * HaloPSA MCP Server with Decision Tree Architecture
 *
 * This MCP server uses a hierarchical tool loading approach:
 * 1. Initially exposes only a navigation tool
 * 2. After user selects a domain, exposes domain-specific tools
 * 3. Lazy-loads domain handlers and the HaloPSA client
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
import { randomUUID } from "node:crypto";
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
import { getCredentials } from "./utils/client.js";
import { setServerRef } from "./utils/server-ref.js";

// Server state
let currentDomain: DomainName | null = null;

// Create the MCP server
const server = new Server(
  {
    name: "halopsa-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
setServerRef(server);

/**
 * Navigation tool - always available
 */
const navigateTool: Tool = {
  name: "halopsa_navigate",
  description:
    "Navigate to a HaloPSA domain to access its tools. Available domains: tickets (manage support tickets), clients (manage companies), assets (manage configuration items), agents (manage technicians/users), invoices (view billing).",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: getAvailableDomains(),
        description:
          "The domain to navigate to. Choose: tickets, clients, assets, agents, or invoices",
      },
    },
    required: ["domain"],
  },
};

/**
 * Back navigation tool - available when in a domain
 */
const backTool: Tool = {
  name: "halopsa_back",
  description: "Navigate back to the main menu to select a different domain",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Status tool - shows current navigation state
 */
const statusTool: Tool = {
  name: "halopsa_status",
  description:
    "Show current navigation state and available domains. Also verifies API credentials are configured.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Get tools based on current navigation state
 */
async function getToolsForState(): Promise<Tool[]> {
  // Always include status tool
  const tools: Tool[] = [statusTool];

  if (currentDomain === null) {
    // At the root - show navigation tool
    tools.unshift(navigateTool);
  } else {
    // In a domain - show back tool and domain-specific tools
    tools.unshift(backTool);

    const handler = await getDomainHandler(currentDomain);
    const domainTools = handler.getTools();
    tools.push(...domainTools);
  }

  return tools;
}

// Handle ListTools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await getToolsForState();
  return { tools };
});

// Handle CallTool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Handle navigation
    if (name === "halopsa_navigate") {
      const domain = (args as { domain: string }).domain;

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

      // Check credentials before navigating
      const creds = getCredentials();
      if (!creds) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No API credentials configured. Please set HALOPSA_CLIENT_ID, HALOPSA_CLIENT_SECRET, and either HALOPSA_TENANT or HALOPSA_BASE_URL environment variables.",
            },
          ],
          isError: true,
        };
      }

      currentDomain = domain;

      // Get tools for the new domain
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();

      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${domain} domain.\n\nAvailable tools:\n${domainTools
              .map((t) => `- ${t.name}: ${t.description}`)
              .join("\n")}\n\nUse halopsa_back to return to the main menu.`,
          },
        ],
      };
    }

    // Handle back navigation
    if (name === "halopsa_back") {
      const previousDomain = currentDomain;
      currentDomain = null;

      return {
        content: [
          {
            type: "text",
            text: `Navigated back from ${previousDomain || "root"} to the main menu.\n\nAvailable domains: ${getAvailableDomains().join(", ")}\n\nUse halopsa_navigate to select a domain.`,
          },
        ],
      };
    }

    // Handle status
    if (name === "halopsa_status") {
      const creds = getCredentials();
      const credStatus = creds
        ? `Configured (tenant: ${creds.tenant || creds.baseUrl})`
        : "NOT CONFIGURED - Please set environment variables";

      return {
        content: [
          {
            type: "text",
            text: `HaloPSA MCP Server Status\n\nCurrent domain: ${currentDomain || "(none - at main menu)"}\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(", ")}`,
          },
        ],
      };
    }

    // Handle domain-specific tools
    if (currentDomain !== null) {
      const handler = await getDomainHandler(currentDomain);

      // Check if the tool belongs to this domain
      const domainTools = handler.getTools();
      const toolExists = domainTools.some((t) => t.name === name);

      if (toolExists) {
        return await handler.handleCall(name, args as Record<string, unknown>);
      }
    }

    // Tool not found
    return {
      content: [
        {
          type: "text",
          text: currentDomain
            ? `Unknown tool: ${name}. You are currently in the ${currentDomain} domain. Use halopsa_back to return to the main menu.`
            : `Unknown tool: ${name}. Use halopsa_navigate to select a domain first.`,
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

/**
 * Extract gateway credentials from HTTP request headers and set them as
 * environment variables so the lazy-loaded HaloPSA client picks them up.
 */
function applyGatewayCredentials(req: IncomingMessage): boolean {
  const clientId = req.headers["x-halo-client-id"] as string | undefined;
  const clientSecret = req.headers["x-halo-client-secret"] as
    | string
    | undefined;
  const tenant = req.headers["x-halo-tenant"] as string | undefined;
  const baseUrl = req.headers["x-halo-base-url"] as string | undefined;

  if (!clientId || !clientSecret) {
    return false;
  }

  process.env.HALOPSA_CLIENT_ID = clientId;
  process.env.HALOPSA_CLIENT_SECRET = clientSecret;

  if (tenant) {
    process.env.HALOPSA_TENANT = tenant;
  }
  if (baseUrl) {
    process.env.HALOPSA_BASE_URL = baseUrl;
  }

  return true;
}

/**
 * Start the server with HTTP Streamable transport
 */
async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

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
        // In gateway mode, extract credentials from headers
        if (isGatewayMode) {
          const valid = applyGatewayCredentials(req);
          if (!valid) {
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
        }

        transport.handleRequest(req, res);
        return;
      }

      // 404 for everything else
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] })
      );
    }
  );

  await server.connect(transport);

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
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Start the server with stdio transport (default)
 */
async function startStdioTransport(): Promise<void> {
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
