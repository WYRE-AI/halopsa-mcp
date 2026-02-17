/**
 * Tests for lazy-loaded HaloPSA client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCredentials, getClient, clearClient } from "../utils/client.js";

// Mock the node-halopsa library
vi.mock("@wyre-technology/node-halopsa", () => ({
  HaloPsaClient: vi.fn().mockImplementation((config) => ({
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
  })),
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
});
