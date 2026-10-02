/**
 * Tests for categories domain handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCategoriesList, mockCategoriesGet, mockClient } = vi.hoisted(() => {
  const mockCategoriesList = vi.fn();
  const mockCategoriesGet = vi.fn();

  const mockClient = {
    categories: {
      list: mockCategoriesList,
      get: mockCategoriesGet,
    },
  };

  return {
    mockCategoriesList,
    mockCategoriesGet,
    mockClient,
  };
});

vi.mock("../../utils/client.js", () => ({
  getClient: () => Promise.resolve(mockClient),
  clearClient: vi.fn(),
  getCredentials: () => ({
    clientId: "test",
    clientSecret: "test",
    tenant: "test",
  }),
}));

import { categoriesHandler } from "../../domains/categories.js";

describe("Categories Domain Handler", () => {
  beforeEach(() => {
    mockCategoriesList.mockClear();
    mockCategoriesGet.mockClear();

    mockCategoriesList.mockResolvedValue({
      record_count: 2,
      categories: [
        { id: 1, name: "Hardware", level: 1, inactive: false },
        { id: 2, name: "Laptop", level: 2, inactive: false, parent_id: 1 },
      ],
    });
    mockCategoriesGet.mockResolvedValue({
      id: 1,
      name: "Hardware",
      level: 1,
      inactive: false,
    });
  });

  describe("getTools", () => {
    it("should return category list and get tools", () => {
      const tools = categoriesHandler.getTools();

      expect(tools.length).toBe(2);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("halopsa_categories_list");
      expect(toolNames).toContain("halopsa_categories_get");
    });

    it("halopsa_categories_list should describe name and level lookup", () => {
      const tools = categoriesHandler.getTools();
      const listTool = tools.find((t) => t.name === "halopsa_categories_list");

      expect(listTool).toBeDefined();
      expect(listTool?.description).toMatch(/category_1/);
      expect(listTool?.inputSchema.properties).toHaveProperty("inactive");
      expect(listTool?.inputSchema.properties).toHaveProperty("search");
      expect(listTool?.inputSchema.properties).toHaveProperty("limit");
      expect(listTool?.inputSchema.properties).toHaveProperty("page_no");
    });

    it("halopsa_categories_get should require category_id", () => {
      const tools = categoriesHandler.getTools();
      const getTool = tools.find((t) => t.name === "halopsa_categories_get");

      expect(getTool).toBeDefined();
      expect(getTool?.inputSchema.required).toContain("category_id");
    });
  });

  describe("handleCall", () => {
    describe("halopsa_categories_list", () => {
      it("should list categories with the default page size", async () => {
        const result = await categoriesHandler.handleCall(
          "halopsa_categories_list",
          {}
        );

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(2);
        expect(data.page_no).toBe(1);
        expect(data.page_size).toBe(50);
        expect(data.categories).toHaveLength(2);
        expect(mockCategoriesList).toHaveBeenCalledWith({
          inactive: undefined,
          search: undefined,
          pageSize: 50,
          pageNo: 1,
          pageinate: true,
          count: true,
        });
      });

      it("should pass filters to client.categories.list", async () => {
        await categoriesHandler.handleCall("halopsa_categories_list", {
          inactive: true,
          search: "laptop",
          limit: 10,
          page_no: 2,
        });

        expect(mockCategoriesList).toHaveBeenCalledWith({
          inactive: true,
          search: "laptop",
          pageSize: 10,
          pageNo: 2,
          pageinate: true,
          count: true,
        });
      });

      it.each([0, -1, 1.5, "10", Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid limit %s before calling Halo",
        async (limit) => {
          const result = await categoriesHandler.handleCall("halopsa_categories_list", { limit });
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toMatch(/limit/);
          expect(mockCategoriesList).not.toHaveBeenCalled();
        }
      );

      it.each([0, -1, 1.5, "2", Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid page_no %s before calling Halo",
        async (page_no) => {
          const result = await categoriesHandler.handleCall("halopsa_categories_list", { page_no });
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toMatch(/page_no/);
          expect(mockCategoriesList).not.toHaveBeenCalled();
        }
      );
    });

    describe("halopsa_categories_get", () => {
      it("should get a category by id", async () => {
        const result = await categoriesHandler.handleCall(
          "halopsa_categories_get",
          { category_id: 1 }
        );

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.name).toBe("Hardware");
        expect(mockCategoriesGet).toHaveBeenCalledWith(1);
      });

      it.each([undefined, "1", 0, 1.5, Number.NaN])(
        "rejects invalid category_id %s before calling Halo",
        async (category_id) => {
          const result = await categoriesHandler.handleCall("halopsa_categories_get", {
            category_id,
          });
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toMatch(/category_id/);
          expect(mockCategoriesGet).not.toHaveBeenCalled();
        }
      );
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await categoriesHandler.handleCall(
          "halopsa_categories_unknown",
          {}
        );

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown category tool");
      });
    });
  });
});
