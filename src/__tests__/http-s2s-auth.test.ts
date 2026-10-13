/**
 * HTTP transport fail-closed auth.
 *
 * Startup requires CONDUIT_S2S_SECRET unless MCP_ALLOW_INSECURE_DEV=1.
 * Known placeholders are rejected even when that flag is set.
 * The dev bypass listens on 127.0.0.1 only.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit Halo credential headers
 * and must not fall back to HALOPSA_* in process.env.
 */

import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { credentialStore } from "../utils/client.js";
import { startHttpTransport } from "../index.js";

const S2S_SECRET = "s2s-do-not-log-7f3a";
const ENV_CLIENT_ID = "env-client-id-must-not-be-used";
const ENV_CLIENT_SECRET = "env-secret-must-not-be-used";
const ENV_TENANT = "env-tenant-must-not-be-used";
const HEADER_TENANT = "header-tenant";

const ENV_KEYS = [
  "CONDUIT_S2S_SECRET",
  "MCP_ALLOW_INSECURE_DEV",
  "MCP_HTTP_PORT",
  "MCP_HTTP_HOST",
  "AUTH_MODE",
  "HALOPSA_CLIENT_ID",
  "HALOPSA_CLIENT_SECRET",
  "HALOPSA_TENANT",
  "HALOPSA_BASE_URL",
  "LOG_LEVEL",
  "MCP_TRANSPORT",
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: Server[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac("sha256", secret).update(message).digest("hex");
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  });
  return {
    text: () => lines.join("\n"),
    restore: () => spy.mockRestore(),
  };
}

interface HttpResult {
  status: number;
  body: string;
}

function sendHttp(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`timeout ${options.method} ${options.path}`));
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function listen(): Promise<{ port: number; address: string; server: Server }> {
  const server = await startHttpTransport();
  servers.push(server);
  const bound = server.address() as AddressInfo | null;
  if (!bound || typeof bound === "string") {
    throw new Error("HTTP server did not bind a TCP port");
  }
  return { port: bound.port, address: bound.address, server };
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...extra,
  };
}

const statusCall = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "halopsa_status", arguments: {} },
});

function mockExit(): { restore: () => void } {
  const spy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
  return { restore: () => spy.mockRestore() };
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.MCP_HTTP_PORT = "0";
  process.env.MCP_HTTP_HOST = "127.0.0.1";
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.HALOPSA_CLIENT_ID;
  delete process.env.HALOPSA_CLIENT_SECRET;
  delete process.env.HALOPSA_TENANT;
  delete process.env.HALOPSA_BASE_URL;
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server?.listening) continue;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("HTTP startup", () => {
  it("refuses to start when CONDUIT_S2S_SECRET is empty", async () => {
    const logs = captureStderr();
    const exit = mockExit();
    try {
      await expect(startHttpTransport()).rejects.toThrow("process.exit:1");
      const text = logs.text();
      expect(text).toContain("Refusing to start HTTP transport");
      expect(text).toContain("CONDUIT_S2S_SECRET is empty");
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.restore();
      logs.restore();
    }
  });

  it("still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1", async () => {
    process.env.CONDUIT_S2S_SECRET = "   ";
    process.env.MCP_ALLOW_INSECURE_DEV = "true";
    const logs = captureStderr();
    const exit = mockExit();
    try {
      await expect(startHttpTransport()).rejects.toThrow("process.exit:1");
      expect(logs.text()).toContain("Refusing to start HTTP transport");
      expect(logs.text()).toContain("CONDUIT_S2S_SECRET is empty");
    } finally {
      exit.restore();
      logs.restore();
    }
  });

  it.each([
    "changeme",
    "ChangeMe",
    " your-s2s-secret ",
    "replace-with-a-real-secret",
    "replace-me",
    "s2s-secret",
    "change-me",
    "your-secret",
    "placeholder",
    "secret",
    "example",
  ])("refuses placeholder %j even when MCP_ALLOW_INSECURE_DEV=1", async (placeholder) => {
    process.env.CONDUIT_S2S_SECRET = placeholder;
    process.env.MCP_ALLOW_INSECURE_DEV = "1";
    process.env.MCP_HTTP_HOST = "0.0.0.0";
    const logs = captureStderr();
    const exit = mockExit();
    try {
      await expect(startHttpTransport()).rejects.toThrow("process.exit:1");
      const text = logs.text();
      expect(text).toContain("Refusing to start HTTP transport");
      expect(text).toContain("known placeholder");
      expect(text).not.toContain("SECURITY WARNING");
      const trimmed = placeholder.trim().toLowerCase();
      if (!["placeholder", "secret", "example"].includes(trimmed)) {
        expect(text).not.toContain(placeholder.trim());
      }
    } finally {
      exit.restore();
      logs.restore();
    }
  });

  it("allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1", async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.MCP_ALLOW_INSECURE_DEV = "1";
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe("127.0.0.1");
      const text = logs.text();
      expect(text).toContain("SECURITY WARNING");
      expect(text).toContain("CONDUIT_S2S_SECRET");
      expect(text).toContain("MCP_ALLOW_INSECURE_DEV=1");
      expect(text).toContain("127.0.0.1");
      expect(text).toContain("X-Gateway-S2S");
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it.each(["localhost", "::1", "127.0.0.2"])(
    "forces 127.0.0.1 when the dev bypass host is %s",
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = "1";
      process.env.MCP_HTTP_HOST = host;
      const logs = captureStderr();
      try {
        const server = await listen();
        expect(server.address).toBe("127.0.0.1");
        expect(logs.text()).toContain("SECURITY WARNING");
        expect(logs.text()).not.toContain("is not loopback");
      } finally {
        logs.restore();
      }
    }
  );

  it.each(["0.0.0.0", "10.1.2.3"])(
    "forces 127.0.0.1 when the dev bypass host is %s",
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = "1";
      process.env.MCP_HTTP_HOST = host;
      const logs = captureStderr();
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${String(code)}`);
      }) as typeof process.exit);
      try {
        const server = await listen();
        expect(exitSpy).not.toHaveBeenCalled();
        expect(server.address).toBe("127.0.0.1");
        const text = logs.text();
        expect(text).toContain("SECURITY WARNING");
        expect(text).toContain(`MCP_HTTP_HOST=${host} is not a loopback address`);
        expect(text).toContain("Binding 127.0.0.1 only");
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        exitSpy.mockRestore();
        logs.restore();
      }
    }
  );

  it("honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set", async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = "0.0.0.0";
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe("0.0.0.0");
      expect(logs.text()).not.toContain("SECURITY WARNING");
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it("keeps the historical 0.0.0.0 bind when the secret is set and MCP_HTTP_HOST is unset", async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const server = await listen();
    expect(server.address).toBe("0.0.0.0");
  });
});

describe("HTTP /mcp authentication", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = "gateway";
    process.env.HALOPSA_CLIENT_ID = ENV_CLIENT_ID;
    process.env.HALOPSA_CLIENT_SECRET = ENV_CLIENT_SECRET;
    process.env.HALOPSA_TENANT = ENV_TENANT;
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes(".halopsa.com/auth/token")) {
        return new Response(
          JSON.stringify({ access_token: "fake-access-token", token_type: "Bearer", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes(".halopsa.com/api/")) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns 401 when the S2S header is missing or invalid and does not log the secret", async () => {
    const logs = captureStderr();
    const runSpy = vi.spyOn(credentialStore, "run");
    const server = await listen();
    try {
      const missing = await sendHttp({
        port: server.port,
        method: "POST",
        path: "/mcp",
        headers: mcpHeaders({
          "x-halo-client-id": "header-client-id",
          "x-halo-client-secret": "header-client-secret",
          "x-halo-tenant": HEADER_TENANT,
        }),
        body: statusCall,
      });
      const invalid = await sendHttp({
        port: server.port,
        method: "POST",
        path: "/mcp",
        headers: mcpHeaders({
          "x-gateway-s2s": mintS2sHeader("wrong-secret"),
          "x-halo-client-id": "header-client-id",
          "x-halo-client-secret": "header-client-secret",
          "x-halo-tenant": HEADER_TENANT,
        }),
        body: statusCall,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      expect(missing.body).toContain("X-Gateway-S2S");
      expect(invalid.body).toContain("X-Gateway-S2S");
      expect(missing.body).not.toContain(S2S_SECRET);
      expect(invalid.body).not.toContain(S2S_SECRET);
      expect(missing.body).not.toContain(ENV_CLIENT_ID);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(runSpy).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it("returns 401 in gateway mode without credential headers and does not use env credentials", async () => {
    const runSpy = vi.spyOn(credentialStore, "run");
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: "POST",
      path: "/mcp",
      headers: mcpHeaders({ "x-gateway-s2s": mintS2sHeader(S2S_SECRET) }),
      body: statusCall,
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain("Missing credentials");
    expect(response.body).toContain("X-Halo-Client-ID");
    expect(response.body).not.toContain(ENV_CLIENT_ID);
    expect(response.body).not.toContain(ENV_CLIENT_SECRET);
    expect(response.body).not.toContain(ENV_TENANT);
    expect(response.body).not.toContain(S2S_SECRET);
    expect(runSpy).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const partial = await sendHttp({
      port: server.port,
      method: "POST",
      path: "/mcp",
      headers: mcpHeaders({
        "x-gateway-s2s": mintS2sHeader(S2S_SECRET),
        "x-halo-client-id": "header-client-id",
      }),
      body: statusCall,
    });
    expect(partial.status).toBe(401);
    expect(partial.body).toContain("Missing credentials");
    expect(runSpy).not.toHaveBeenCalled();

    const blank = await sendHttp({
      port: server.port,
      method: "POST",
      path: "/mcp",
      headers: mcpHeaders({
        "x-gateway-s2s": mintS2sHeader(S2S_SECRET),
        "x-halo-client-id": "   ",
        "x-halo-client-secret": "header-client-secret",
        "x-halo-tenant": HEADER_TENANT,
      }),
      body: statusCall,
    });
    expect(blank.status).toBe(401);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid S2S header plus credential headers and uses those credentials", async () => {
    const logs = captureStderr();
    const runSpy = vi.spyOn(credentialStore, "run");
    const server = await listen();
    try {
      const response = await sendHttp({
        port: server.port,
        method: "POST",
        path: "/mcp",
        headers: mcpHeaders({
          "x-gateway-s2s": mintS2sHeader(S2S_SECRET),
          "x-halo-client-id": "header-client-id",
          "x-halo-client-secret": "header-client-secret",
          "x-halo-tenant": HEADER_TENANT,
        }),
        body: statusCall,
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_CLIENT_ID);
      expect(response.body).not.toContain(ENV_CLIENT_SECRET);
      expect(response.body).not.toContain(ENV_TENANT);
      const payload = JSON.parse(response.body) as {
        result?: { content?: Array<{ text?: string }> };
      };
      const text = payload.result?.content?.[0]?.text ?? "";
      expect(text).toContain(`tenant: ${HEADER_TENANT}`);
      expect(text).toContain("Token mint: OK");
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(runSpy).toHaveBeenCalled();
      const bound = runSpy.mock.calls[0]?.[0] as { tenant?: string; clientId?: string };
      expect(bound.tenant).toBe(HEADER_TENANT);
      expect(bound.clientId).toBe("header-client-id");
    } finally {
      logs.restore();
    }
  });

  it("serves /health without authentication and without reading credentials", async () => {
    const runSpy = vi.spyOn(credentialStore, "run");
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: "GET",
      path: "/health",
    });
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { status?: string; authMode?: string };
    expect(body.status).toBe("ok");
    expect(body.authMode).toBe("gateway");
    expect(response.body).not.toContain(S2S_SECRET);
    expect(response.body).not.toContain(ENV_CLIENT_ID);
    expect(response.body).not.toContain(ENV_TENANT);
    expect(runSpy).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not enforce X-Gateway-S2S when the dev bypass is on, and still rejects missing gateway credentials", async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = "1";
    const runSpy = vi.spyOn(credentialStore, "run");
    const server = await listen();
    expect(server.address).toBe("127.0.0.1");
    const response = await sendHttp({
      port: server.port,
      method: "POST",
      path: "/mcp",
      headers: mcpHeaders(),
      body: statusCall,
    });
    expect(response.status).toBe(401);
    expect(response.body).toContain("Missing credentials");
    expect(response.body).not.toContain("X-Gateway-S2S");
    expect(runSpy).not.toHaveBeenCalled();
  });
});
