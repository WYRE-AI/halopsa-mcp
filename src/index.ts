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
 * The Cloudflare Workers entrypoint lives in `worker.ts` and reuses the same
 * `createMcpServer()` factory from `mcp-server.ts`.
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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, resolveGatewayCredentials } from "./mcp-server.js";
import { runWithCredentials } from "./utils/client.js";
import { runWithServerRef, bindServerRef } from "./utils/server-ref.js";

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

          // Bind this request's server into the per-request async context
          // (not a module-level global) so elicitation helpers resolve
          // *this* server/transport even after await gaps, and never a
          // concurrent request's — see utils/server-ref.ts.
          runWithServerRef(server, () => {
            server.connect(transport).then(() => {
              transport.handleRequest(req, res);
            });
          });
        };

        if (isGatewayMode) {
          const { creds, error } = resolveGatewayCredentials(
            (name) => req.headers[name] as string | undefined
          );
          if (error || !creds) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Missing credentials",
                message:
                  error ??
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
  // stdio is single-session (one process = one caller), so there is no
  // concurrent tenant to isolate from — bind once for the process
  // lifetime rather than per-request. See utils/server-ref.ts.
  bindServerRef(server);
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
