/**
 * Tests for navigation and domain state management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock handlers using vi.hoisted
const { mockHandlers } = vi.hoisted(() => {
  const mockHandlers = {
    tickets: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_tickets_list", description: "List tickets" },
        { name: "halopsa_tickets_get", description: "Get ticket" },
      ]),
      handleCall: vi.fn(),
    },
    clients: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_clients_list", description: "List clients" },
        { name: "halopsa_clients_get", description: "Get client" },
      ]),
      handleCall: vi.fn(),
    },
    assets: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_assets_list", description: "List assets" },
        { name: "halopsa_assets_get", description: "Get asset" },
      ]),
      handleCall: vi.fn(),
    },
    agents: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_agents_list", description: "List agents" },
        { name: "halopsa_agents_get", description: "Get agent" },
      ]),
      handleCall: vi.fn(),
    },
    invoices: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_invoices_list", description: "List invoices" },
        { name: "halopsa_invoices_get", description: "Get invoice" },
      ]),
      handleCall: vi.fn(),
    },
  };

  return { mockHandlers };
});

// Mock all domain handlers
vi.mock("../domains/tickets.js", () => ({
  ticketsHandler: mockHandlers.tickets,
}));

vi.mock("../domains/clients.js", () => ({
  clientsHandler: mockHandlers.clients,
}));

vi.mock("../domains/assets.js", () => ({
  assetsHandler: mockHandlers.assets,
}));

vi.mock("../domains/agents.js", () => ({
  agentsHandler: mockHandlers.agents,
}));

vi.mock("../domains/invoices.js", () => ({
  invoicesHandler: mockHandlers.invoices,
}));

import {
  getDomainHandler,
  getAvailableDomains,
  clearDomainCache,
} from "../domains/index.js";
import { isDomainName } from "../utils/types.js";

describe("Domain Navigation", () => {
  beforeEach(() => {
    clearDomainCache();
    vi.clearAllMocks();

    // Reset mock return values
    mockHandlers.tickets.getTools.mockReturnValue([
      { name: "halopsa_tickets_list", description: "List tickets" },
      { name: "halopsa_tickets_get", description: "Get ticket" },
    ]);
    mockHandlers.clients.getTools.mockReturnValue([
      { name: "halopsa_clients_list", description: "List clients" },
      { name: "halopsa_clients_get", description: "Get client" },
    ]);
    mockHandlers.assets.getTools.mockReturnValue([
      { name: "halopsa_assets_list", description: "List assets" },
      { name: "halopsa_assets_get", description: "Get asset" },
    ]);
    mockHandlers.agents.getTools.mockReturnValue([
      { name: "halopsa_agents_list", description: "List agents" },
      { name: "halopsa_agents_get", description: "Get agent" },
    ]);
    mockHandlers.invoices.getTools.mockReturnValue([
      { name: "halopsa_invoices_list", description: "List invoices" },
      { name: "halopsa_invoices_get", description: "Get invoice" },
    ]);
  });

  describe("getAvailableDomains", () => {
    it("should return all available domains", () => {
      const domains = getAvailableDomains();

      expect(domains).toEqual([
        "tickets",
        "clients",
        "assets",
        "agents",
        "invoices",
      ]);
    });

    it("should return a consistent list", () => {
      const domains1 = getAvailableDomains();
      const domains2 = getAvailableDomains();

      expect(domains1).toEqual(domains2);
    });
  });

  describe("isDomainName", () => {
    it("should return true for valid domain names", () => {
      expect(isDomainName("tickets")).toBe(true);
      expect(isDomainName("clients")).toBe(true);
      expect(isDomainName("assets")).toBe(true);
      expect(isDomainName("agents")).toBe(true);
      expect(isDomainName("invoices")).toBe(true);
    });

    it("should return false for invalid domain names", () => {
      expect(isDomainName("invalid")).toBe(false);
      expect(isDomainName("")).toBe(false);
      expect(isDomainName("TICKETS")).toBe(false);
      expect(isDomainName("ticket")).toBe(false);
    });
  });

  describe("getDomainHandler", () => {
    it("should load tickets domain handler", async () => {
      const handler = await getDomainHandler("tickets");

      expect(handler).toBeDefined();
      expect(handler.getTools).toBeDefined();
      expect(handler.handleCall).toBeDefined();
    });

    it("should load clients domain handler", async () => {
      const handler = await getDomainHandler("clients");

      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(2);
    });

    it("should load assets domain handler", async () => {
      const handler = await getDomainHandler("assets");

      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(2);
    });

    it("should load agents domain handler", async () => {
      const handler = await getDomainHandler("agents");

      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(2);
    });

    it("should load invoices domain handler", async () => {
      const handler = await getDomainHandler("invoices");

      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(2);
    });

    it("should cache domain handlers", async () => {
      const handler1 = await getDomainHandler("tickets");
      const handler2 = await getDomainHandler("tickets");

      expect(handler1).toBe(handler2);
    });

    it("should throw for unknown domain", async () => {
      await expect(
        getDomainHandler("unknown" as "tickets")
      ).rejects.toThrow("Unknown domain: unknown");
    });
  });

  describe("clearDomainCache", () => {
    it("should clear the cached handlers", async () => {
      // Load a handler to cache it
      const handler1 = await getDomainHandler("tickets");

      // Clear cache
      clearDomainCache();

      // The handler should still be loadable
      const handler2 = await getDomainHandler("tickets");

      // Both should have same interface but may be different objects
      expect(handler2).toBeDefined();
      expect(handler2.getTools).toBeDefined();
    });
  });
});

describe("Domain Tools Structure", () => {
  beforeEach(() => {
    clearDomainCache();

    // Reset mock return values
    mockHandlers.tickets.getTools.mockReturnValue([
      { name: "halopsa_tickets_list", description: "List tickets" },
      { name: "halopsa_tickets_get", description: "Get ticket" },
    ]);
    mockHandlers.clients.getTools.mockReturnValue([
      { name: "halopsa_clients_list", description: "List clients" },
      { name: "halopsa_clients_get", description: "Get client" },
    ]);
    mockHandlers.assets.getTools.mockReturnValue([
      { name: "halopsa_assets_list", description: "List assets" },
      { name: "halopsa_assets_get", description: "Get asset" },
    ]);
    mockHandlers.agents.getTools.mockReturnValue([
      { name: "halopsa_agents_list", description: "List agents" },
      { name: "halopsa_agents_get", description: "Get agent" },
    ]);
    mockHandlers.invoices.getTools.mockReturnValue([
      { name: "halopsa_invoices_list", description: "List invoices" },
      { name: "halopsa_invoices_get", description: "Get invoice" },
    ]);
  });

  it("tickets domain should expose ticket-specific tools", async () => {
    const handler = await getDomainHandler("tickets");
    const tools = handler.getTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("halopsa_tickets_list");
    expect(toolNames).toContain("halopsa_tickets_get");
  });

  it("clients domain should expose client-specific tools", async () => {
    const handler = await getDomainHandler("clients");
    const tools = handler.getTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("halopsa_clients_list");
    expect(toolNames).toContain("halopsa_clients_get");
  });

  it("assets domain should expose asset-specific tools", async () => {
    const handler = await getDomainHandler("assets");
    const tools = handler.getTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("halopsa_assets_list");
    expect(toolNames).toContain("halopsa_assets_get");
  });

  it("agents domain should expose agent-specific tools", async () => {
    const handler = await getDomainHandler("agents");
    const tools = handler.getTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("halopsa_agents_list");
    expect(toolNames).toContain("halopsa_agents_get");
  });

  it("invoices domain should expose invoice-specific tools", async () => {
    const handler = await getDomainHandler("invoices");
    const tools = handler.getTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("halopsa_invoices_list");
    expect(toolNames).toContain("halopsa_invoices_get");
  });
});
