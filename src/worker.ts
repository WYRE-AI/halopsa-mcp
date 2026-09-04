/**
 * Cloudflare Workers entry point for the HaloPSA MCP Server.
 *
 * Serves the full MCP server over the Streamable HTTP transport using the SDK's
 * Web Standard transport (Request/Response), which runs natively on Workers.
 * It reuses the exact same `createMcpServer()` factory as the stdio / Node HTTP
 * entrypoints (see `mcp-server.ts`), so there is no second tool implementation
 * to maintain.
 *
 * Credentials are bound per request via AsyncLocalStorage (`runWithCredentials`),
 * resolved in order:
 * 1. Gateway headers (when AUTH_MODE=gateway):
 *    - X-Halo-Client-ID
 *    - X-Halo-Client-Secret
 *    - X-Halo-Tenant (optional if base URL given)
 *    - X-Halo-Base-URL (optional if tenant given)
 * 2. Worker secrets / vars (env mode):
 *    - HALOPSA_CLIENT_ID
 *    - HALOPSA_CLIENT_SECRET
 *    - HALOPSA_TENANT / HALOPSA_BASE_URL
 *
 * `tools/list` and `initialize` work without credentials; only `tools/call`
 * requires them.
 *
 * The HaloPSA SDK (`@wyre-ai/node-halopsa`) uses the global `fetch`
 * API, so it runs natively on the Workers runtime with `nodejs_compat`
 * (needed for AsyncLocalStorage).
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  createMcpServer,
  resolveGatewayCredentials,
  buildCredentials,
  type HaloPsaCredentials,
} from "./mcp-server.js";
import { runWithCredentials } from "./utils/client.js";
import { runWithServerRef } from "./utils/server-ref.js";

export interface Env {
  HALOPSA_CLIENT_ID?: string;
  HALOPSA_CLIENT_SECRET?: string;
  HALOPSA_TENANT?: string;
  HALOPSA_BASE_URL?: string;
  AUTH_MODE?: string;
  LOG_LEVEL?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-Halo-Client-ID, X-Halo-Client-Secret, X-Halo-Tenant, X-Halo-Base-URL",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Run the MCP request through a fresh server + transport (stateless).
 * Credentials, when available, are bound to the async context so the
 * lazily-created HaloPSA client picks them up per request. The server is
 * likewise bound to the per-request async context (not a module-level
 * global) so elicitation helpers resolve *this* request's server even
 * after await gaps, and never a concurrent request's — see
 * utils/server-ref.ts.
 */
async function handleMcp(request: Request): Promise<Response> {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  return runWithServerRef(server, async () => {
    await server.connect(transport);

    try {
      const response = await transport.handleRequest(request);
      return withCors(response);
    } finally {
      await transport.close();
      await server.close();
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Shallow, unauthenticated liveness probe.
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return json({ status: "ok" });
    }

    if (url.pathname === "/mcp") {
      const isGatewayMode = (env.AUTH_MODE ?? "env") === "gateway";

      let creds: HaloPsaCredentials | undefined;
      if (isGatewayMode) {
        const resolved = resolveGatewayCredentials(
          (name) => request.headers.get(name) ?? undefined
        );
        if (resolved.error) {
          return json(
            {
              error: "Missing credentials",
              message: resolved.error,
              required: ["X-Halo-Client-ID", "X-Halo-Client-Secret"],
              optional: ["X-Halo-Tenant", "X-Halo-Base-URL"],
            },
            401
          );
        }
        creds = resolved.creds;
      } else {
        // env mode: build credentials from Worker secrets if present.
        // (Absent creds are fine — tools/list still works, tools/call errors.)
        const resolved = buildCredentials(
          env.HALOPSA_CLIENT_ID,
          env.HALOPSA_CLIENT_SECRET,
          env.HALOPSA_TENANT,
          env.HALOPSA_BASE_URL
        );
        creds = resolved.creds;
      }

      // Bind credentials (if any) to the async context for this request.
      if (creds) {
        return runWithCredentials(creds, () => handleMcp(request));
      }
      return handleMcp(request);
    }

    return json({ error: "Not found", endpoints: ["/mcp", "/health"] }, 404);
  },
};
