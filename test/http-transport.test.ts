/**
 * HTTP Transport Tests for HaloPSA MCP Server
 *
 * Tests the HTTP transport endpoints: /health, /mcp, 404 handling,
 * and gateway authentication mode.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";

// We test the HTTP layer directly by recreating the request handler logic
// rather than importing the full server (which has side effects).

interface HealthResponse {
  status: string;
  transport: string;
  authMode: string;
  timestamp: string;
}

interface ErrorResponse {
  error: string;
  message?: string;
  required?: string[];
  endpoints?: string[];
}

/**
 * Creates a minimal HTTP server that mirrors the HaloPSA MCP server's
 * routing logic for testing purposes.
 */
function createTestServer(options: { gatewayMode?: boolean } = {}): HttpServer {
  const isGatewayMode = options.gatewayMode ?? false;

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Health endpoint
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
      if (isGatewayMode) {
        const clientId = req.headers["x-halo-client-id"] as string | undefined;
        const clientSecret = req.headers["x-halo-client-secret"] as string | undefined;

        if (!clientId || !clientSecret) {
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

      // In a real server, this delegates to StreamableHTTPServerTransport.
      // For testing, return a 200 to confirm the route is reachable.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "mcp-ok" }));
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] })
    );
  });
}

/**
 * Helper to make HTTP requests to the test server
 */
async function fetchJson<T>(
  port: number,
  path: string,
  options: { headers?: Record<string, string> } = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: options.headers,
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

describe("HTTP Transport - env mode", () => {
  let server: HttpServer;
  let port: number;

  beforeAll(async () => {
    server = createTestServer({ gatewayMode: false });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr !== null ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("should return 200 on /health with correct fields", async () => {
    const { status, body } = await fetchJson<HealthResponse>(port, "/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.transport).toBe("http");
    expect(body.authMode).toBe("env");
    expect(body.timestamp).toBeDefined();
  });

  it("should return 200 on /mcp in env mode (no auth headers needed)", async () => {
    const { status, body } = await fetchJson<{ status: string }>(port, "/mcp");
    expect(status).toBe(200);
    expect(body.status).toBe("mcp-ok");
  });

  it("should return 404 for unknown paths", async () => {
    const { status, body } = await fetchJson<ErrorResponse>(port, "/unknown");
    expect(status).toBe(404);
    expect(body.error).toBe("Not found");
    expect(body.endpoints).toEqual(["/mcp", "/health"]);
  });

  it("should return 404 for root path", async () => {
    const { status, body } = await fetchJson<ErrorResponse>(port, "/");
    expect(status).toBe(404);
    expect(body.error).toBe("Not found");
  });
});

describe("HTTP Transport - gateway mode", () => {
  let server: HttpServer;
  let port: number;

  beforeAll(async () => {
    server = createTestServer({ gatewayMode: true });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr !== null ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("should return 200 on /health (no auth required for health)", async () => {
    const { status, body } = await fetchJson<HealthResponse>(port, "/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.authMode).toBe("gateway");
  });

  it("should return 401 on /mcp without credentials", async () => {
    const { status, body } = await fetchJson<ErrorResponse>(port, "/mcp");
    expect(status).toBe(401);
    expect(body.error).toBe("Missing credentials");
    expect(body.required).toContain("X-Halo-Client-ID");
    expect(body.required).toContain("X-Halo-Client-Secret");
  });

  it("should return 401 on /mcp with only client ID", async () => {
    const { status, body } = await fetchJson<ErrorResponse>(port, "/mcp", {
      headers: { "X-Halo-Client-ID": "test-id" },
    });
    expect(status).toBe(401);
    expect(body.error).toBe("Missing credentials");
  });

  it("should return 401 on /mcp with only client secret", async () => {
    const { status, body } = await fetchJson<ErrorResponse>(port, "/mcp", {
      headers: { "X-Halo-Client-Secret": "test-secret" },
    });
    expect(status).toBe(401);
    expect(body.error).toBe("Missing credentials");
  });

  it("should return 200 on /mcp with valid credentials", async () => {
    const { status, body } = await fetchJson<{ status: string }>(port, "/mcp", {
      headers: {
        "X-Halo-Client-ID": "test-client-id",
        "X-Halo-Client-Secret": "test-client-secret",
      },
    });
    expect(status).toBe(200);
    expect(body.status).toBe("mcp-ok");
  });

  it("should return 200 on /mcp with credentials and optional headers", async () => {
    const { status, body } = await fetchJson<{ status: string }>(port, "/mcp", {
      headers: {
        "X-Halo-Client-ID": "test-client-id",
        "X-Halo-Client-Secret": "test-client-secret",
        "X-Halo-Tenant": "test-tenant",
        "X-Halo-Base-URL": "https://test.halopsa.com",
      },
    });
    expect(status).toBe(200);
    expect(body.status).toBe("mcp-ok");
  });

  it("should still return 404 for unknown paths in gateway mode", async () => {
    const { status, body } = await fetchJson<ErrorResponse>(port, "/foo/bar");
    expect(status).toBe(404);
    expect(body.error).toBe("Not found");
  });
});
