/**
 * Cloudflare Workers entry point for HaloPSA MCP Server
 *
 * This module adapts the HaloPSA MCP server for Cloudflare Workers runtime.
 * It handles incoming HTTP requests and routes them to the appropriate handlers.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface Env {
  HALOPSA_CLIENT_ID: string;
  HALOPSA_CLIENT_SECRET: string;
  HALOPSA_TENANT?: string;
  HALOPSA_BASE_URL?: string;
  AUTH_MODE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          transport: "cloudflare-workers",
          authMode: env.AUTH_MODE === "gateway" ? "gateway" : "env",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      // In gateway mode, extract credentials from headers
      if (env.AUTH_MODE === "gateway") {
        const clientId = request.headers.get("x-halo-client-id");
        const clientSecret = request.headers.get("x-halo-client-secret");

        if (!clientId || !clientSecret) {
          return new Response(
            JSON.stringify({
              error: "Missing credentials",
              message:
                "Gateway mode requires X-Halo-Client-ID and X-Halo-Client-Secret headers",
              required: ["X-Halo-Client-ID", "X-Halo-Client-Secret"],
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }

      // For Workers, we return a basic acknowledgment
      // Full MCP transport integration requires the Node.js HTTP adapter
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message:
              "Cloudflare Workers transport requires the MCP SDK Workers adapter. Use HTTP transport for full functionality.",
          },
        }),
        {
          status: 501,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 404 for everything else
    return new Response(
      JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
