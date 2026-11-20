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
        update: vi.fn(),
      },
      contacts: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
      sites: { list: vi.fn() },
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

      expect(tools.length).toBe(9);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("halopsa_clients_list");
      expect(toolNames).toContain("halopsa_clients_get");
      expect(toolNames).toContain("halopsa_clients_create");
      expect(toolNames).toContain("halopsa_clients_search");
      expect(toolNames).toContain("halopsa_clients_update");
      expect(toolNames).toContain("halopsa_clients_list_contacts");
      expect(toolNames).toContain("halopsa_clients_create_contact");
      expect(toolNames).toContain("halopsa_clients_update_contact");
      expect(toolNames).toContain("halopsa_clients_list_sites");
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

  describe("job-depth tools (WYREAI-704)", () => {
    beforeEach(() => {
      mockClient.clients.update.mockReset().mockResolvedValue({ id: 1, name: "Renamed" });
      mockClient.contacts.list.mockReset().mockResolvedValue({
        record_count: 1,
        users: [{ id: 9, name: "Pat Example", client_id: 1 }],
      });
      mockClient.contacts.create.mockReset().mockResolvedValue({ id: 10, name: "New User" });
      mockClient.contacts.update.mockReset().mockResolvedValue({ id: 9, inactive: true });
      mockClient.sites.list.mockReset().mockResolvedValue({
        record_count: 1,
        sites: [{ id: 4, name: "Main", client_id: 1 }],
      });
    });

    it("updates a client with only the passed fields", async () => {
      const result = await clientsHandler.handleCall("halopsa_clients_update", {
        client_id: 1,
        name: "Renamed",
      });
      expect(result.isError).toBeUndefined();
      expect(mockClient.clients.update).toHaveBeenCalledWith(1, { name: "Renamed" });
    });

    it("rejects a client update with no changes", async () => {
      const result = await clientsHandler.handleCall("halopsa_clients_update", { client_id: 1 });
      expect(result.isError).toBe(true);
      expect(mockClient.clients.update).not.toHaveBeenCalled();
    });

    it("lists contacts with paging and the wrapped users key", async () => {
      const result = await clientsHandler.handleCall("halopsa_clients_list_contacts", {
        client_id: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.contacts).toHaveLength(1);
      expect(data.page_size).toBe(50);
      expect(mockClient.contacts.list).toHaveBeenCalledWith({
        client_id: 1,
        pageSize: 50,
        pageNo: 1,
        count: true,
      });
    });

    it("creates a contact and validates required fields", async () => {
      const bad = await clientsHandler.handleCall("halopsa_clients_create_contact", {
        client_id: 1,
      });
      expect(bad.isError).toBe(true);
      expect(mockClient.contacts.create).not.toHaveBeenCalled();

      const ok = await clientsHandler.handleCall("halopsa_clients_create_contact", {
        client_id: 1,
        name: "New User",
        emailaddress: "new.user@example.com",
      });
      expect(ok.isError).toBeUndefined();
      expect(mockClient.contacts.create).toHaveBeenCalledWith({
        client_id: 1,
        name: "New User",
        emailaddress: "new.user@example.com",
      });
    });

    it("deactivates a contact and rejects an empty update", async () => {
      const ok = await clientsHandler.handleCall("halopsa_clients_update_contact", {
        contact_id: 9,
        inactive: true,
      });
      expect(ok.isError).toBeUndefined();
      expect(mockClient.contacts.update).toHaveBeenCalledWith(9, { inactive: true });

      const bad = await clientsHandler.handleCall("halopsa_clients_update_contact", {
        contact_id: 9,
      });
      expect(bad.isError).toBe(true);
    });

    it("lists sites for a client", async () => {
      const result = await clientsHandler.handleCall("halopsa_clients_list_sites", {
        client_id: 1,
        page_no: 2,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.sites[0].id).toBe(4);
      expect(data.page_no).toBe(2);
      expect(mockClient.sites.list).toHaveBeenCalledWith({
        client_id: 1,
        pageSize: 50,
        pageNo: 2,
        count: true,
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
