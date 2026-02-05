/**
 * Tests for assets domain handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted so they're available when vi.mock is hoisted
const { mockAssetsList, mockAssetsGet, mockAssetTypesList, mockClient } =
  vi.hoisted(() => {
    const mockAssetsList = vi.fn();
    const mockAssetsGet = vi.fn();
    const mockAssetTypesList = vi.fn();

    const mockClient = {
      assets: {
        list: mockAssetsList,
        get: mockAssetsGet,
      },
      assetTypes: {
        list: mockAssetTypesList,
      },
    };

    return {
      mockAssetsList,
      mockAssetsGet,
      mockAssetTypesList,
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
import { assetsHandler } from "../../domains/assets.js";

describe("Assets Domain Handler", () => {
  beforeEach(() => {
    // Clear call history but NOT return values
    mockAssetsList.mockClear();
    mockAssetsGet.mockClear();
    mockAssetTypesList.mockClear();

    // Reset mock implementations
    mockAssetsList.mockResolvedValue({
      record_count: 2,
      assets: [
        { id: 1, name: "Server 1", inventory_number: "SRV001" },
        { id: 2, name: "Laptop 1", inventory_number: "LPT001" },
      ],
    });
    mockAssetsGet.mockResolvedValue({
      id: 1,
      name: "Server 1",
      inventory_number: "SRV001",
      client_id: 5,
    });
    mockAssetTypesList.mockResolvedValue({
      record_count: 3,
      asset_types: [
        { id: 1, name: "Server" },
        { id: 2, name: "Laptop" },
        { id: 3, name: "Network Device" },
      ],
    });
  });

  describe("getTools", () => {
    it("should return all asset tools", () => {
      const tools = assetsHandler.getTools();

      expect(tools.length).toBe(4);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("halopsa_assets_list");
      expect(toolNames).toContain("halopsa_assets_get");
      expect(toolNames).toContain("halopsa_assets_search");
      expect(toolNames).toContain("halopsa_assets_list_types");
    });

    it("halopsa_assets_list should have correct schema", () => {
      const tools = assetsHandler.getTools();
      const listTool = tools.find((t) => t.name === "halopsa_assets_list");

      expect(listTool).toBeDefined();
      expect(listTool?.inputSchema.properties).toHaveProperty("client_id");
      expect(listTool?.inputSchema.properties).toHaveProperty("site_id");
      expect(listTool?.inputSchema.properties).toHaveProperty("assettype_id");
      expect(listTool?.inputSchema.properties).toHaveProperty("inactive");
      expect(listTool?.inputSchema.properties).toHaveProperty("limit");
    });

    it("halopsa_assets_get should require asset_id", () => {
      const tools = assetsHandler.getTools();
      const getTool = tools.find((t) => t.name === "halopsa_assets_get");

      expect(getTool).toBeDefined();
      expect(getTool?.inputSchema.required).toContain("asset_id");
    });

    it("halopsa_assets_search should require query", () => {
      const tools = assetsHandler.getTools();
      const searchTool = tools.find((t) => t.name === "halopsa_assets_search");

      expect(searchTool).toBeDefined();
      expect(searchTool?.inputSchema.required).toContain("query");
    });
  });

  describe("handleCall", () => {
    describe("halopsa_assets_list", () => {
      it("should list assets with default parameters", async () => {
        const result = await assetsHandler.handleCall("halopsa_assets_list", {});

        expect(result.isError).toBeUndefined();
        expect(result.content[0].type).toBe("text");

        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(2);
        expect(data.assets).toHaveLength(2);
      });

      it("should pass filters to API", async () => {
        await assetsHandler.handleCall("halopsa_assets_list", {
          client_id: 5,
          site_id: 2,
          assettype_id: 1,
          inactive: false,
          limit: 100,
        });

        expect(mockAssetsList).toHaveBeenCalledWith({
          client_id: 5,
          site_id: 2,
          assettype_id: 1,
          inactive: false,
          pageSize: 100,
        });
      });
    });

    describe("halopsa_assets_get", () => {
      it("should get a single asset", async () => {
        const result = await assetsHandler.handleCall("halopsa_assets_get", {
          asset_id: 1,
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(1);
        expect(data.name).toBe("Server 1");
        expect(data.inventory_number).toBe("SRV001");
      });
    });

    describe("halopsa_assets_search", () => {
      it("should search assets", async () => {
        const result = await assetsHandler.handleCall("halopsa_assets_search", {
          query: "Server",
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(2);
      });

      it("should pass search query and filters to API", async () => {
        await assetsHandler.handleCall("halopsa_assets_search", {
          query: "laptop",
          client_id: 10,
          limit: 15,
        });

        expect(mockAssetsList).toHaveBeenCalledWith({
          search: "laptop",
          client_id: 10,
          pageSize: 15,
        });
      });
    });

    describe("halopsa_assets_list_types", () => {
      it("should list asset types", async () => {
        const result = await assetsHandler.handleCall("halopsa_assets_list_types", {});

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(3);
        expect(data.asset_types).toHaveLength(3);
      });

      it("should pass limit to API", async () => {
        await assetsHandler.handleCall("halopsa_assets_list_types", {
          limit: 50,
        });

        expect(mockAssetTypesList).toHaveBeenCalledWith({
          pageSize: 50,
        });
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await assetsHandler.handleCall("halopsa_assets_unknown", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown asset tool");
      });
    });
  });
});
