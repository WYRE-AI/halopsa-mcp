/**
 * Robustness probe for the Node HTTP entrypoint (src/index.ts): a request whose
 * Host header or request target cannot be parsed must never throw out of the
 * request listener (which would take the whole process down). Unparseable
 * targets answer 400 and the server keeps serving.
 *
 * Raw sockets are used because fetch() refuses to send these requests.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { connect, createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';

// src/index.ts starts its listener at import time and keeps the server private,
// so record whatever it creates in order to close it in afterAll.
const httpServers = vi.hoisted(() => [] as Server[]);
vi.mock('node:http', async (importOriginal) => {
  const http = await importOriginal<typeof import('node:http')>();
  return {
    ...http,
    createServer: ((...args: Parameters<typeof http.createServer>) => {
      const server = http.createServer(...args);
      httpServers.push(server);
      return server;
    }) as typeof http.createServer,
  };
});

let port: number;

/** Ask the OS for a free port by briefly binding port 0. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  port = await getFreePort();
  process.env.MCP_TRANSPORT = 'http';
  process.env.MCP_HTTP_PORT = String(port);
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  delete process.env.CONDUIT_S2S_SECRET;
  await import('../index.js');
  expect(httpServers).toHaveLength(1); // guards the afterAll cleanup below
  await waitForServerReady();
});

afterAll(async () => {
  for (const server of httpServers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** Send raw HTTP bytes, return the status line and body. */
function rawRequest(payload: string): Promise<{ status: string; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let data = '';
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      const [head, body = ''] = data.split('\r\n\r\n');
      resolve({ status: head.split('\r\n')[0], body });
    });
  });
}

async function waitForServerReady(): Promise<void> {
  const deadline = Date.now() + 5000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch (err) {
      lastError = err; // not up yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('halopsa-mcp test HTTP server did not become ready in time', {
    cause: lastError,
  });
}

const HEALTH = 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n';

describe('malformed requests on the Node HTTP entrypoint', () => {
  it('serves a request with a malformed Host header and keeps running', async () => {
    const res = await rawRequest('GET /health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n');
    expect(res.status).toBe('HTTP/1.1 200 OK');
    expect((await rawRequest(HEALTH)).status).toBe('HTTP/1.1 200 OK');
  });

  it('answers 400 for an unparseable request target and keeps running', async () => {
    const res = await rawRequest('GET // HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    expect(res.status).toBe('HTTP/1.1 400 Bad Request');
    expect(res.body).toContain('{"error":"Bad request"}');
    expect((await rawRequest(HEALTH)).status).toBe('HTTP/1.1 200 OK');
  });

  it('serves an HTTP/1.0 request that has no Host header', async () => {
    const res = await rawRequest('GET /health HTTP/1.0\r\n\r\n');
    expect(res.status).toBe('HTTP/1.1 200 OK');
  });
});
