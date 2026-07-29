/**
 * Instrumented call-counter probe for the S2S guard ordering invariant
 * (boss's ordering-catch rule, 2026-07-28 S2S rollout evidence report).
 *
 * This covers the Node HTTP entrypoint (src/index.ts) only -- the separate
 * Cloudflare Workers entrypoint (src/worker.ts) has an open, unresolved
 * question about its deployment status (see forge/warden thread,
 * 2026-07-29) and is out of scope for this test.
 *
 * halopsa-mcp's own credential resolution (resolveGatewayCredentials in
 * src/mcp-server.ts) is a pure header read, but the vendored
 * @wyre-technology/node-halopsa SDK's AuthManager has its own lazy side
 * effect: getToken() calls acquireToken(), a real outbound OAuth2
 * client-credentials POST to `${baseUrl}/auth/token` (baseUrl derives from
 * the tenant header, e.g. https://<tenant>.halopsa.com), the first time any
 * tool needing API access executes. A generic grant/deny test can't catch
 * a future ordering regression here since the exchange only fires lazily,
 * inside tool dispatch.
 *
 * Drives a real tools/call round-trip (halopsa_clients_list, no required
 * args) through the actual HTTP server -- no mocking of index.ts/
 * mcp-server.ts/domains. Only the network boundary (the tenant's own host)
 * is stubbed, with a passthrough for the test's own loopback request.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';

const TEST_PORT = 47007;
const TEST_SECRET = 'test-s2s-guard-ordering-secret-do-not-use-in-prod';
const TEST_TENANT = 'test-tenant';
const HALO_HOST = `https://${TEST_TENANT}.halopsa.com`;

let tokenCalls = 0;
let clientsCalls = 0;

const realFetch = globalThis.fetch;

beforeAll(async () => {
  globalThis.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.startsWith(`${HALO_HOST}/auth/token`)) {
      tokenCalls++;
      return new Response(
        JSON.stringify({
          access_token: 'fake-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.startsWith(`${HALO_HOST}/api/`)) {
      clientsCalls++;
      return new Response(JSON.stringify({ clients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Everything else (notably the test's own loopback calls into the
    // in-process server below) goes through to the real fetch untouched.
    return realFetch(input, init);
  }) as typeof fetch;

  process.env.MCP_TRANSPORT = 'http';
  process.env.AUTH_MODE = 'gateway';
  process.env.MCP_HTTP_PORT = String(TEST_PORT);
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.CONDUIT_S2S_SECRET = TEST_SECRET;
  await import('../index.js');
  await waitForServerReady();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function mintS2sHeader(secret: string, unixSeconds: number): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

async function waitForServerReady(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await realFetch(`http://127.0.0.1:${TEST_PORT}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('halopsa-mcp test HTTP server did not become ready in time');
}

async function callClientsList(headers: Record<string, string>): Promise<Response> {
  return fetch(`http://127.0.0.1:${TEST_PORT}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'halopsa_clients_list', arguments: {} },
      id: 1,
    }),
  });
}

const VALID_HALO_HEADERS = {
  'x-halo-client-id': 'test-client-id',
  'x-halo-client-secret': 'test-client-secret',
  'x-halo-tenant': TEST_TENANT,
};

describe('S2S guard ordering vs. lazy HaloPSA OAuth token acquisition (Node HTTP entrypoint)', () => {
  it('does NOT call the HaloPSA OAuth token endpoint when the S2S header is missing', async () => {
    tokenCalls = 0;
    clientsCalls = 0;
    const res = await callClientsList(VALID_HALO_HEADERS);
    expect(res.status).toBe(401);
    expect(tokenCalls).toBe(0);
    expect(clientsCalls).toBe(0);
  });

  it('does NOT call the HaloPSA OAuth token endpoint when the S2S header is present but invalid', async () => {
    tokenCalls = 0;
    clientsCalls = 0;
    const res = await callClientsList({
      'x-gateway-s2s': mintS2sHeader('wrong-secret', Math.floor(Date.now() / 1000)),
      ...VALID_HALO_HEADERS,
    });
    expect(res.status).toBe(401);
    expect(tokenCalls).toBe(0);
    expect(clientsCalls).toBe(0);
  });

  it('DOES call the HaloPSA OAuth token endpoint exactly once on a real accepted tool call (negative control)', async () => {
    tokenCalls = 0;
    clientsCalls = 0;
    const res = await callClientsList({
      'x-gateway-s2s': mintS2sHeader(TEST_SECRET, Math.floor(Date.now() / 1000)),
      ...VALID_HALO_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { isError?: boolean } };
    expect(body.result?.isError).toBeFalsy();
    expect(tokenCalls).toBe(1);
    expect(clientsCalls).toBe(1);
  });
});
