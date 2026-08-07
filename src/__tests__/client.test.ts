/**
 * Tests for lazy-loaded HaloPSA client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCredentials,
  getClient,
  clearClient,
  cleanCredential,
} from "../utils/client.js";

// Mock the node-halopsa library
vi.mock("@wyre-technology/node-halopsa", () => ({
  HaloPsaClient: vi.fn().mockImplementation(function (config) { return ({
    config,
    tickets: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    clients: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
    },
    assets: {
      list: vi.fn(),
      get: vi.fn(),
    },
    agents: {
      list: vi.fn(),
      get: vi.fn(),
    },
    invoices: {
      list: vi.fn(),
      get: vi.fn(),
    },
  }) }),
}));

describe("HaloPSA Client Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    clearClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearClient();
  });

  describe("getCredentials", () => {
    it("should return null when no credentials are set", () => {
      delete process.env.HALOPSA_CLIENT_ID;
      delete process.env.HALOPSA_CLIENT_SECRET;
      delete process.env.HALOPSA_TENANT;
      delete process.env.HALOPSA_BASE_URL;

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return null when client ID is missing", () => {
      delete process.env.HALOPSA_CLIENT_ID;
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return null when client secret is missing", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      delete process.env.HALOPSA_CLIENT_SECRET;
      process.env.HALOPSA_TENANT = "test-tenant";

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return null when neither tenant nor baseUrl is provided", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      delete process.env.HALOPSA_TENANT;
      delete process.env.HALOPSA_BASE_URL;

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return credentials with tenant when provided", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      const creds = getCredentials();
      expect(creds).toEqual({
        clientId: "test-id",
        clientSecret: "test-secret",
        tenant: "test-tenant",
        baseUrl: undefined,
      });
    });

    it("should return credentials with baseUrl when provided", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_BASE_URL = "https://api.halopsa.com";

      const creds = getCredentials();
      expect(creds).toEqual({
        clientId: "test-id",
        clientSecret: "test-secret",
        tenant: undefined,
        baseUrl: "https://api.halopsa.com",
      });
    });

    it("should return both tenant and baseUrl when both are provided", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";
      process.env.HALOPSA_BASE_URL = "https://api.halopsa.com";

      const creds = getCredentials();
      expect(creds).toEqual({
        clientId: "test-id",
        clientSecret: "test-secret",
        tenant: "test-tenant",
        baseUrl: "https://api.halopsa.com",
      });
    });

    // Regression: issue #73. A blank optional Base URL field in an MCPB/DXT
    // desktop bundle is injected as the literal "${user_config.halopsa_base_url}".
    // That string is truthy, so the old `!tenant && !baseUrl` guard was defeated
    // and the placeholder reached the SDK, which threw on `new URL(...)` and
    // broke an otherwise-valid tenant-only setup. baseUrl must resolve to absent.
    it("should ignore an unresolved base URL placeholder and keep the tenant path", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";
      process.env.HALOPSA_BASE_URL = "${user_config.halopsa_base_url}";

      const creds = getCredentials();
      expect(creds).toEqual({
        clientId: "test-id",
        clientSecret: "test-secret",
        tenant: "test-tenant",
        baseUrl: undefined,
      });
    });

    it("should ignore an unresolved tenant placeholder and keep the base URL path", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "${user_config.halopsa_tenant}";
      process.env.HALOPSA_BASE_URL = "https://api.halopsa.com";

      const creds = getCredentials();
      expect(creds).toEqual({
        clientId: "test-id",
        clientSecret: "test-secret",
        tenant: undefined,
        baseUrl: "https://api.halopsa.com",
      });
    });

    it("should return null when both tenant and base URL are unresolved placeholders", () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "${user_config.halopsa_tenant}";
      process.env.HALOPSA_BASE_URL = "${user_config.halopsa_base_url}";

      const creds = getCredentials();
      expect(creds).toBeNull();
    });
  });

  describe("cleanCredential", () => {
    it("drops undefined, empty, whitespace, and ${...} placeholder values", () => {
      expect(cleanCredential(undefined)).toBeUndefined();
      expect(cleanCredential("")).toBeUndefined();
      expect(cleanCredential("   ")).toBeUndefined();
      expect(cleanCredential("${user_config.halopsa_base_url}")).toBeUndefined();
      expect(cleanCredential("${user_config.halopsa_tenant}")).toBeUndefined();
      expect(
        cleanCredential("  ${user_config.halopsa_base_url}  ")
      ).toBeUndefined();
    });

    it("preserves and trims real values", () => {
      expect(cleanCredential("acme")).toBe("acme");
      expect(cleanCredential("  acme  ")).toBe("acme");
      expect(cleanCredential("https://api.halopsa.com")).toBe(
        "https://api.halopsa.com"
      );
    });
  });

  describe("getClient", () => {
    it("should throw error when no credentials are configured", async () => {
      delete process.env.HALOPSA_CLIENT_ID;
      delete process.env.HALOPSA_CLIENT_SECRET;
      delete process.env.HALOPSA_TENANT;
      delete process.env.HALOPSA_BASE_URL;

      await expect(getClient()).rejects.toThrow(
        "No API credentials provided"
      );
    });

    it("should create client when valid credentials are provided", async () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      const client = await getClient();
      expect(client).toBeDefined();
      expect(client.tickets).toBeDefined();
      expect(client.clients).toBeDefined();
    });

    // Regression: issue #73. With a valid tenant and a blank optional Base URL
    // field (injected as the literal "${user_config.halopsa_base_url}"), getClient
    // must resolve via the tenant path rather than reject. Before the fix the
    // truthy placeholder defeated the `!tenant && !baseUrl` guard and was passed
    // to the SDK, which took the baseUrl branch and threw on `new URL(...)`.
    // (The credential shape is asserted precisely in the getCredentials suite.)
    it("should resolve via the tenant path when the base URL is an unresolved placeholder", async () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";
      process.env.HALOPSA_BASE_URL = "${user_config.halopsa_base_url}";

      await expect(getClient()).resolves.toBeDefined();
    });

    it("should return cached client on subsequent calls", async () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      const client1 = await getClient();
      const client2 = await getClient();

      expect(client1).toBe(client2);
    });

    it("should create new client when credentials change", async () => {
      process.env.HALOPSA_CLIENT_ID = "test-id-1";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      const client1 = await getClient();

      // Change credentials
      process.env.HALOPSA_CLIENT_ID = "test-id-2";
      clearClient();

      const client2 = await getClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe("clearClient", () => {
    it("should clear cached client", async () => {
      process.env.HALOPSA_CLIENT_ID = "test-id";
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      const client1 = await getClient();
      clearClient();
      const client2 = await getClient();

      expect(client1).not.toBe(client2);
    });
  });

  // Regression: the tenant-keyed client cache (one entry per distinct
  // clientId/tenant/baseUrl fingerprint) previously grew without bound for
  // the lifetime of the process. In gateway mode a long-running server sees
  // a new fingerprint per tenant over time, so an unbounded Map is a slow
  // memory leak. The cache must now cap its size and evict the
  // least-recently-used entry rather than growing forever.
  describe("client cache eviction", () => {
    it("evicts the least-recently-used entry once the cache is full", async () => {
      process.env.HALOPSA_CLIENT_SECRET = "test-secret";
      process.env.HALOPSA_TENANT = "test-tenant";

      // MAX_CLIENT_CACHE_SIZE is 500; fill it, then add one more to force
      // an eviction of the oldest (first) entry.
      const MAX_CLIENT_CACHE_SIZE = 500;
      let firstClient: unknown;
      for (let i = 0; i < MAX_CLIENT_CACHE_SIZE; i++) {
        process.env.HALOPSA_CLIENT_ID = `tenant-${i}`;
        const client = await getClient();
        if (i === 0) firstClient = client;
      }

      // Cache is now full. Adding one more distinct tenant should evict the
      // very first tenant's client rather than growing past the cap.
      process.env.HALOPSA_CLIENT_ID = "tenant-overflow";
      await getClient();

      // Re-request the first tenant: it should be recreated (a new
      // instance), proving its old cache entry was evicted, not retained.
      process.env.HALOPSA_CLIENT_ID = "tenant-0";
      const firstClientAgain = await getClient();

      expect(firstClientAgain).not.toBe(firstClient);
    });
  });
});
