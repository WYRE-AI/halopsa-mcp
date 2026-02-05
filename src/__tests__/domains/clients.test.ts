/**
 * Tests for clients domain handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted so they're available when vi.mock is hoisted
const { mockClientsList, mockClientsGet, mockClientsCreate, mockClient } =
  vi.hoisted(() => {
    const mockClientsList = vi.fn();
    const mockClientsGet = vi.fn();
    const mockClientsCreate = vi.fn();

    const mockClient = {
      clients: {
        list: mockClientsList,
        get: mockClientsGet,
        create: mockClientsCreate,
      },
    };

    return {
      mockClientsList,
      mockClientsGet,
      mockClientsCreate,
      mockClient,
    };
  });

// Mock the client module before importing the handler
vi.mock("../../utils/client.js", () => ({
  getClient: () => Promise.resolve(mockClient),
  clearClient: vi.fn(),
  getCredentials: () => ({
    clientId: "test",
    clientSecret: "test",
    tenant: "test",
  }),
}));

// Import handler after mocking
import { clientsHandler } from "../../domains/clients.js";

describe("Clients Domain Handler", () => {
  beforeEach(() => {
    // Clear call history but NOT return values
    mockClientsList.mockClear();
    mockClientsGet.mockClear();
    mockClientsCreate.mockClear();

    // Reset mock implementations
    mockClientsList.mockResolvedValue({
      record_count: 2,
      clients: [
        { id: 1, name: "Client A" },
        { id: 2, name: "Client B" },
      ],
    });
    mockClientsGet.mockResolvedValue({
      id: 1,
      name: "Client A",
      website: "https://clienta.com",
    });
    mockClientsCreate.mockResolvedValue({
      id: 100,
      name: "New Client",
    });
  });

  describe("getTools", () => {
    it("should return all client tools", () => {
      const tools = clientsHandler.getTools();

      expect(tools.length).toBe(4);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("halopsa_clients_list");
      expect(toolNames).toContain("halopsa_clients_get");
      expect(toolNames).toContain("halopsa_clients_create");
      expect(toolNames).toContain("halopsa_clients_search");
    });

    it("halopsa_clients_list should have correct schema", () => {
      const tools = clientsHandler.getTools();
      const listTool = tools.find((t) => t.name === "halopsa_clients_list");

      expect(listTool).toBeDefined();
      expect(listTool?.inputSchema.properties).toHaveProperty("search");
      expect(listTool?.inputSchema.properties).toHaveProperty("inactive");
      expect(listTool?.inputSchema.properties).toHaveProperty("limit");
    });

    it("halopsa_clients_get should require client_id", () => {
      const tools = clientsHandler.getTools();
      const getTool = tools.find((t) => t.name === "halopsa_clients_get");

      expect(getTool).toBeDefined();
      expect(getTool?.inputSchema.required).toContain("client_id");
    });

    it("halopsa_clients_create should require name", () => {
      const tools = clientsHandler.getTools();
      const createTool = tools.find((t) => t.name === "halopsa_clients_create");

      expect(createTool).toBeDefined();
      expect(createTool?.inputSchema.required).toContain("name");
    });

    it("halopsa_clients_search should require query", () => {
      const tools = clientsHandler.getTools();
      const searchTool = tools.find((t) => t.name === "halopsa_clients_search");

      expect(searchTool).toBeDefined();
      expect(searchTool?.inputSchema.required).toContain("query");
    });
  });

  describe("handleCall", () => {
    describe("halopsa_clients_list", () => {
      it("should list clients with default parameters", async () => {
        const result = await clientsHandler.handleCall("halopsa_clients_list", {});

        expect(result.isError).toBeUndefined();
        expect(result.content[0].type).toBe("text");

        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(2);
        expect(data.clients).toHaveLength(2);
      });

      it("should pass filters to API", async () => {
        await clientsHandler.handleCall("halopsa_clients_list", {
          search: "test",
          inactive: true,
          limit: 25,
        });

        expect(mockClientsList).toHaveBeenCalledWith({
          search: "test",
          inactive: true,
          pageSize: 25,
        });
      });
    });

    describe("halopsa_clients_get", () => {
      it("should get a single client", async () => {
        const result = await clientsHandler.handleCall("halopsa_clients_get", {
          client_id: 1,
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(1);
        expect(data.name).toBe("Client A");
      });
    });

    describe("halopsa_clients_create", () => {
      it("should create a client with required fields", async () => {
        const result = await clientsHandler.handleCall("halopsa_clients_create", {
          name: "New Client",
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(100);
        expect(data.name).toBe("New Client");
      });

      it("should pass all fields to API", async () => {
        await clientsHandler.handleCall("halopsa_clients_create", {
          name: "New Client",
          website: "https://newclient.com",
          phonenumber: "123-456-7890",
          email: "contact@newclient.com",
          notes: "Test notes",
        });

        expect(mockClientsCreate).toHaveBeenCalledWith({
          name: "New Client",
          website: "https://newclient.com",
          phonenumber: "123-456-7890",
          email: "contact@newclient.com",
          notes: "Test notes",
        });
      });
    });

    describe("halopsa_clients_search", () => {
      it("should search clients", async () => {
        const result = await clientsHandler.handleCall("halopsa_clients_search", {
          query: "Client",
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(2);
      });

      it("should pass search query to list API", async () => {
        await clientsHandler.handleCall("halopsa_clients_search", {
          query: "test query",
          limit: 10,
        });

        expect(mockClientsList).toHaveBeenCalledWith({
          search: "test query",
          pageSize: 10,
        });
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await clientsHandler.handleCall("halopsa_clients_unknown", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown client tool");
      });
    });
  });
});
