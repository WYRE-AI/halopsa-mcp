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
    categories: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_categories_list", description: "List categories" },
        { name: "halopsa_categories_get", description: "Get category" },
      ]),
      handleCall: vi.fn(),
    },
    statuses: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_statuses_list", description: "List statuses" },
        { name: "halopsa_statuses_get", description: "Get status" },
      ]),
      handleCall: vi.fn(),
    },
    items: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_items_list", description: "List items" },
        { name: "halopsa_items_get", description: "Get item" },
      ]),
      handleCall: vi.fn(),
    },
    contracts: {
      getTools: vi.fn().mockReturnValue([
        { name: "halopsa_contracts_list", description: "List contracts" },
        { name: "halopsa_contracts_get", description: "Get contract" },
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

vi.mock("../domains/categories.js", () => ({
  categoriesHandler: mockHandlers.categories,
}));

vi.mock("../domains/statuses.js", () => ({
  statusesHandler: mockHandlers.statuses,
}));

vi.mock("../domains/items.js", () => ({
  itemsHandler: mockHandlers.items,
}));

vi.mock("../domains/contracts.js", () => ({
  contractsHandler: mockHandlers.contracts,
}));

import {
  getDomainHandler,
  getAvailableDomains,
  clearDomainCache,
} from "../domains/index.js";
import { isDomainName } from "../utils/types.js";
import { createMcpServer } from "../mcp-server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

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
    mockHandlers.categories.getTools.mockReturnValue([
      { name: "halopsa_categories_list", description: "List categories" },
      { name: "halopsa_categories_get", description: "Get category" },
    ]);
    for (const domain of ["statuses", "items", "contracts"] as const) {
      mockHandlers[domain].getTools.mockReturnValue([
        { name: `halopsa_${domain}_list`, description: `List ${domain}` },
        { name: `halopsa_${domain}_get`, description: `Get ${domain}` },
      ]);
    }
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
        "categories",
        "statuses",
        "items",
        "contracts",
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
      expect(isDomainName("categories")).toBe(true);
      expect(isDomainName("statuses")).toBe(true);
      expect(isDomainName("items")).toBe(true);
      expect(isDomainName("contracts")).toBe(true);
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

    it("should load categories domain handler", async () => {
      const handler = await getDomainHandler("categories");

      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(2);
    });

    it.each(["statuses", "items", "contracts"] as const)(
      "should load %s domain handler",
      async (domain) => {
        const handler = await getDomainHandler(domain);

        expect(handler).toBeDefined();
        expect(handler.getTools()).toHaveLength(2);
      }
    );

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
      // Load a handler to cache it (return value not asserted — only the side-effect matters)
      const _handler1 = await getDomainHandler("tickets");

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
    mockHandlers.categories.getTools.mockReturnValue([
      { name: "halopsa_categories_list", description: "List categories" },
      { name: "halopsa_categories_get", description: "Get category" },
    ]);
    for (const domain of ["statuses", "items", "contracts"] as const) {
      mockHandlers[domain].getTools.mockReturnValue([
        { name: `halopsa_${domain}_list`, description: `List ${domain}` },
        { name: `halopsa_${domain}_get`, description: `Get ${domain}` },
      ]);
    }
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

  it("categories domain should expose category-specific tools", async () => {
    const handler = await getDomainHandler("categories");
    const tools = handler.getTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("halopsa_categories_list");
    expect(toolNames).toContain("halopsa_categories_get");
  });

  it.each(["statuses", "items", "contracts"] as const)(
    "%s domain should expose list and get tools",
    async (domain) => {
      const handler = await getDomainHandler(domain);
      const toolNames = handler.getTools().map((t) => t.name);

      expect(toolNames).toContain(`halopsa_${domain}_list`);
      expect(toolNames).toContain(`halopsa_${domain}_get`);
    }
  );
});

describe("CallTool routing", () => {
  beforeEach(() => {
    clearDomainCache();
    vi.clearAllMocks();
  });

  it.each([
    "tickets",
    "clients",
    "assets",
    "agents",
    "invoices",
    "categories",
    "statuses",
    "items",
    "contracts",
  ] as const)("routes halopsa_%s_* to its own handler", async (domain) => {
    mockHandlers[domain].handleCall.mockResolvedValue({
      content: [{ type: "text", text: domain }],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    const client = new Client({ name: "routing-test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: `halopsa_${domain}_list`, arguments: {} });
    await client.close();

    expect(mockHandlers[domain].handleCall).toHaveBeenCalledWith(`halopsa_${domain}_list`, {});
    expect(result.content).toEqual([{ type: "text", text: domain }]);
  });
});
