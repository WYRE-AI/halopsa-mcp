/**
 * Shared MCP server factory for HaloPSA.
 *
 * This module is **side-effect free** (importing it never starts a transport),
 * so it can be reused by every entrypoint:
 * - `index.ts` — stdio + Node HTTP transport
 * - `worker.ts` — Cloudflare Workers (Web Standard) transport
 *
 * All HaloPSA tools are exposed upfront (flat architecture) for universal MCP
 * client compatibility. Credentials are bound per request via AsyncLocalStorage
 * (`runWithCredentials`) so concurrent requests never share state.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDomainHandler, getAvailableDomains } from "./domains/index.js";
import { isDomainName, type DomainName } from "./utils/types.js";
import {
  getCredentials,
  cleanCredential,
  type HaloPsaCredentials,
} from "./utils/client.js";
import { setServerRef } from "./utils/server-ref.js";
import { registerPromptHandlers } from "./prompts.js";

export type { HaloPsaCredentials };

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
 * Navigation / discovery tool - helps the LLM find the right tools.
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
 * The tool set is static and credential-independent, but a fresh server is
 * created per request (for credential isolation), so the assembled list is
 * memoized at module scope to avoid rebuilding it on every request.
 */
let allDomainTools: Tool[] | null = null;

/**
 * Load all domain tools (memoized on first access)
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
 * Build a validated HaloPsaCredentials object from raw values.
 * Returns `{ creds }` on success or `{ error }` when required values are
 * missing. Shared by every transport (Node HTTP headers, Workers headers,
 * Workers env).
 *
 * HaloPSA requires a client id + secret plus either a tenant or a base URL.
 */
export function buildCredentials(
  clientId: string | undefined,
  clientSecret: string | undefined,
  tenant: string | undefined,
  baseUrl: string | undefined
): { creds?: HaloPsaCredentials; error?: string } {
  if (!clientId || !clientSecret) {
    return {
      error:
        "Missing credentials: X-Halo-Client-ID / X-Halo-Client-Secret (or HALOPSA_CLIENT_ID / HALOPSA_CLIENT_SECRET)",
    };
  }

  // Drop unresolved MCPB placeholders / blank values so a blank optional field
  // (which arrives as the literal "${user_config.X}") is treated as absent
  // rather than a real setting. See cleanCredential / issue #73.
  tenant = cleanCredential(tenant);
  baseUrl = cleanCredential(baseUrl);

  if (!tenant && !baseUrl) {
    return {
      error:
        "Missing tenant: X-Halo-Tenant or X-Halo-Base-URL (or HALOPSA_TENANT / HALOPSA_BASE_URL)",
    };
  }

  return { creds: { clientId, clientSecret, tenant, baseUrl } };
}

/**
 * Resolve per-request gateway credentials from a header accessor.
 *
 * Works with any transport: pass a getter that returns a (lowercased) header
 * value. Returns `{ creds }` on success, or `{ error }` when required headers
 * are missing.
 */
export function resolveGatewayCredentials(
  getHeader: (lowerName: string) => string | undefined
): { creds?: HaloPsaCredentials; error?: string } {
  return buildCredentials(
    getHeader("x-halo-client-id"),
    getHeader("x-halo-client-secret"),
    getHeader("x-halo-tenant"),
    getHeader("x-halo-base-url")
  );
}

/**
 * Create a fresh MCP server instance with all handlers registered.
 * Called once for stdio, or per-request for HTTP / Workers transports.
 *
 * Credentials are NOT passed here — they are resolved at call time via
 * `getCredentials()`, which reads the AsyncLocalStorage context bound by
 * `runWithCredentials` (gateway mode) or falls back to env vars (stdio mode).
 */
export function createMcpServer(): Server {
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
