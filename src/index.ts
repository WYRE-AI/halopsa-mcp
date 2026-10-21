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
 *
 * HTTP transport refuses to start unless CONDUIT_S2S_SECRET is set to a real
 * secret. Known placeholders are rejected even when MCP_ALLOW_INSECURE_DEV=1.
 * That flag is the only bypass for an empty secret: it logs a warning, does
 * not enforce X-Gateway-S2S, and forces the listener to 127.0.0.1. A
 * non-loopback MCP_HTTP_HOST is overridden and that override is logged.
 * A configured secret still honors MCP_HTTP_HOST (unset keeps the historical
 * 0.0.0.0 bind).
 * Gateway mode rejects /mcp requests that omit credential headers and does not
 * fall back to HALOPSA_* in the environment. /health stays unauthenticated.
 * stdio does not use S2S auth.
 */

import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, resolveGatewayCredentials } from "./mcp-server.js";
import { runWithCredentials } from "./utils/client.js";
import { runWithServerRef, bindServerRef } from "./utils/server-ref.js";
import { verifyS2sHeader, S2S_HEADER } from "./s2s-verify.js";

/** Public example values. A copied placeholder must not verify as a real secret. */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  "replace-with-a-real-secret",
  "your-s2s-secret",
  "your-secret",
  "changeme",
  "change-me",
  "placeholder",
  "secret",
  "example",
  "replace-me",
  "s2s-secret",
]);

const LOOPBACK_HOST = "127.0.0.1";

const MISSING_S2S_SECRET_ERROR =
  "Refusing to start HTTP transport: CONDUIT_S2S_SECRET is empty. " +
  "Set CONDUIT_S2S_SECRET to the gateway-provisioned secret (openssl rand -hex 32), " +
  "or set MCP_ALLOW_INSECURE_DEV=1 for local development only.";

const PLACEHOLDER_S2S_SECRET_ERROR =
  "Refusing to start HTTP transport: CONDUIT_S2S_SECRET is a known placeholder. " +
  "Generate a secret with `openssl rand -hex 32` and set CONDUIT_S2S_SECRET to that value. " +
  "MCP_ALLOW_INSECURE_DEV does not accept a placeholder.";

const INSECURE_DEV_WARNING =
  "SECURITY WARNING: CONDUIT_S2S_SECRET is empty and MCP_ALLOW_INSECURE_DEV=1. " +
  "HTTP /mcp is not enforcing X-Gateway-S2S and is limited to 127.0.0.1 only. " +
  "Do not use this outside local development.";

function refuseStart(message: string): never {
  // console.error so the refusal is visible even when nothing else is logging.
  // The secret value is never included.
  console.error(message);
  process.exit(1);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** 127.0.0.1, the rest of 127.0.0.0/8, localhost, and ::1. */
function isLoopbackBindHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.+)\]$/, "$1");
  if (normalized === "localhost" || normalized === "::1") return true;
  const bare = normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized;
  const parts = bare.split(".");
  if (parts.length !== 4) return false;
  if (parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  return parts[0] === "127";
}

/**
 * Fail closed. A known placeholder is never a configured secret, including
 * when MCP_ALLOW_INSECURE_DEV=1 is also set. Empty is the only case the dev
 * flag may bypass, and that bypass does not check X-Gateway-S2S.
 * Read at HTTP startup, not module load. The secret value is never logged.
 */
function resolveS2sSecret(env: NodeJS.ProcessEnv = process.env): {
  secret: string;
  insecureDev: boolean;
} {
  const raw = (env.CONDUIT_S2S_SECRET ?? "").trim();
  if (raw && KNOWN_PLACEHOLDER_SECRETS.has(raw.toLowerCase())) {
    refuseStart(PLACEHOLDER_S2S_SECRET_ERROR);
  }
  if (raw) return { secret: raw, insecureDev: false };
  if (env.MCP_ALLOW_INSECURE_DEV === "1") {
    return { secret: "", insecureDev: true };
  }
  refuseStart(MISSING_S2S_SECRET_ERROR);
}

/**
 * No real secret: force 127.0.0.1. A non-loopback MCP_HTTP_HOST is overridden
 * and logged. A real secret honors MCP_HTTP_HOST; unset stays 0.0.0.0 so
 * existing container deploys keep their bind.
 */
function resolveBindHost(insecureDev: boolean, env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.MCP_HTTP_HOST ?? "").trim();
  if (!insecureDev) {
    return configured || "0.0.0.0";
  }
  if (configured && !isLoopbackBindHost(configured)) {
    console.error(
      `WARNING: MCP_HTTP_HOST=${configured} is not a loopback address. ` +
        "MCP_ALLOW_INSECURE_DEV=1 without CONDUIT_S2S_SECRET cannot listen there. " +
        `Binding ${LOOPBACK_HOST} only.`
    );
  }
  return LOOPBACK_HOST;
}

/**
 * Start the server with HTTP Streamable transport.
 * Each request gets a fresh Server + Transport (stateless).
 */
export async function startHttpTransport(): Promise<HttpServer> {
  const { secret: s2sSecret, insecureDev } = resolveS2sSecret();
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = resolveBindHost(insecureDev);
  if (insecureDev) {
    console.error(INSECURE_DEV_WARNING);
  }
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );

      // Health endpoint — shallow liveness, no auth, and this handler must
      // not read vendor credentials. Gateway credentials arrive per request,
      // so gating /health on them would fail container probes at startup.
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
        // Empty s2sSecret is only reachable when MCP_ALLOW_INSECURE_DEV=1;
        // startup refuses otherwise. A configured secret is always enforced,
        // before any credential extraction.
        if (
          s2sSecret &&
          !verifyS2sHeader(headerValue(req.headers[S2S_HEADER]), s2sSecret)
        ) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.",
            })
          );
          return;
        }

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

        // Gateway mode: credentials must arrive on every request via headers.
        // Reject explicitly if missing rather than falling through — falling
        // through would resolve HALOPSA_* from the process environment.
        if (isGatewayMode) {
          const { creds, error } = resolveGatewayCredentials((name) =>
            headerValue(req.headers[name])
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

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      reject(err);
    };
    httpServer.once("error", onError);
    httpServer.listen(port, host, () => {
      httpServer.off("error", onError);
      console.error(`HaloPSA MCP Server listening on http://${host}:${port}/mcp`);
      console.error(`Health check available at http://${host}:${port}/health`);
      console.error(
        `Authentication mode: ${isGatewayMode ? "gateway (header-based)" : "env (environment variables)"}`
      );
      resolve();
    });
  });

  return httpServer;
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
    const httpServer = await startHttpTransport();
    const shutdown = async () => {
      console.error("Shutting down HaloPSA MCP Server...");
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    await startStdioTransport();
  }
}

// Vitest imports this module to call startHttpTransport. Skip the CLI
// entrypoint there. `node dist/index.js` still starts stdio or HTTP.
if (process.env.VITEST !== "true") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
