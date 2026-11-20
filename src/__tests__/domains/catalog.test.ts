/**
 * Tests for the statuses, items, and contracts domain handlers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    statuses: { list: vi.fn(), get: vi.fn() },
    items: { list: vi.fn(), get: vi.fn() },
    contracts: { list: vi.fn(), get: vi.fn() },
  },
}));

vi.mock("../../utils/client.js", () => ({
  getClient: () => Promise.resolve(mockClient),
  clearClient: vi.fn(),
  getCredentials: () => ({
    clientId: "test",
    clientSecret: "test",
    tenant: "test",
  }),
}));

import { statusesHandler } from "../../domains/statuses.js";
import { itemsHandler } from "../../domains/items.js";
import { contractsHandler } from "../../domains/contracts.js";

beforeEach(() => {
  vi.resetAllMocks();
  mockClient.statuses.list.mockResolvedValue({
    record_count: 2,
    statuses: [
      { id: 1, name: "New", isopen: true },
      { id: 9, name: "Closed", isopen: false },
    ],
  });
  mockClient.statuses.get.mockResolvedValue({ id: 1, name: "New" });
  mockClient.items.list.mockResolvedValue({
    record_count: 1,
    items: [{ id: 5, name: "Managed Workstation", type: "service" }],
  });
  mockClient.items.get.mockResolvedValue({ id: 5, name: "Managed Workstation" });
  mockClient.contracts.list.mockResolvedValue({
    record_count: 1,
    contracts: [{ id: 7, ref: "C-7", client_id: 3, hours: 40 }],
  });
  mockClient.contracts.get.mockResolvedValue({ id: 7, ref: "C-7", hours: 40 });
});

describe("Statuses domain handler", () => {
  it("exposes list and get tools", () => {
    const tools = statusesHandler.getTools();
    expect(tools.map((t) => t.name)).toEqual([
      "halopsa_statuses_list",
      "halopsa_statuses_get",
    ]);
    expect(tools[1].inputSchema.required).toContain("status_id");
  });

  it("lists statuses with the default page size and pageinate set", async () => {
    const result = await statusesHandler.handleCall("halopsa_statuses_list", {});

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.record_count).toBe(2);
    expect(data.page_size).toBe(50);
    expect(data.statuses).toHaveLength(2);
    expect(mockClient.statuses.list).toHaveBeenCalledWith({
      inactive: undefined,
      search: undefined,
      pageSize: 50,
      pageNo: 1,
      pageinate: true,
      count: true,
    });
  });

  it("passes filters through", async () => {
    await statusesHandler.handleCall("halopsa_statuses_list", {
      inactive: true,
      search: "wait",
      limit: 10,
      page_no: 3,
    });

    expect(mockClient.statuses.list).toHaveBeenCalledWith({
      inactive: true,
      search: "wait",
      pageSize: 10,
      pageNo: 3,
      pageinate: true,
      count: true,
    });
  });

  it.each([0, -1, 1.5, "10"])("rejects invalid limit %s", async (limit) => {
    const result = await statusesHandler.handleCall("halopsa_statuses_list", { limit });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/limit/);
    expect(mockClient.statuses.list).not.toHaveBeenCalled();
  });

  it("gets a status by id", async () => {
    const result = await statusesHandler.handleCall("halopsa_statuses_get", {
      status_id: 1,
    });

    expect(JSON.parse(result.content[0].text).name).toBe("New");
    expect(mockClient.statuses.get).toHaveBeenCalledWith(1);
  });

  it.each([undefined, "1", 0, 1.5])("rejects invalid status_id %s", async (status_id) => {
    const result = await statusesHandler.handleCall("halopsa_statuses_get", { status_id });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/status_id/);
    expect(mockClient.statuses.get).not.toHaveBeenCalled();
  });

  it("returns an error for an unknown tool", async () => {
    const result = await statusesHandler.handleCall("halopsa_statuses_nope", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown status tool");
  });
});

describe("Items domain handler", () => {
  it("exposes list and get tools", () => {
    const tools = itemsHandler.getTools();
    expect(tools.map((t) => t.name)).toEqual(["halopsa_items_list", "halopsa_items_get"]);
    expect(tools[1].inputSchema.required).toContain("item_id");
  });

  it("lists items with the default page size", async () => {
    const result = await itemsHandler.handleCall("halopsa_items_list", {});

    const data = JSON.parse(result.content[0].text);
    expect(data.items).toHaveLength(1);
    expect(data.page_no).toBe(1);
    expect(mockClient.items.list).toHaveBeenCalledWith({
      pageSize: 50,
      pageNo: 1,
      count: true,
    });
  });

  it("passes filters through", async () => {
    await itemsHandler.handleCall("halopsa_items_list", {
      type: "service",
      category: "Managed",
      supplier_id: 4,
      inactive: true,
      search: "work",
      limit: 5,
      page_no: 2,
    });

    expect(mockClient.items.list).toHaveBeenCalledWith({
      type: "service",
      category: "Managed",
      supplier_id: 4,
      inactive: true,
      search: "work",
      pageSize: 5,
      pageNo: 2,
      count: true,
    });
  });

  it("rejects an unknown item type before calling Halo", async () => {
    const result = await itemsHandler.handleCall("halopsa_items_list", { type: "widget" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/type/);
    expect(mockClient.items.list).not.toHaveBeenCalled();
  });

  it("gets an item by id", async () => {
    const result = await itemsHandler.handleCall("halopsa_items_get", { item_id: 5 });

    expect(JSON.parse(result.content[0].text).name).toBe("Managed Workstation");
    expect(mockClient.items.get).toHaveBeenCalledWith(5);
  });

  it.each([undefined, "5", 0, -2])("rejects invalid item_id %s", async (item_id) => {
    const result = await itemsHandler.handleCall("halopsa_items_get", { item_id });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/item_id/);
    expect(mockClient.items.get).not.toHaveBeenCalled();
  });

  it("returns an error for an unknown tool", async () => {
    const result = await itemsHandler.handleCall("halopsa_items_nope", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown item tool");
  });
});

describe("Contracts domain handler", () => {
  it("exposes list and get tools", () => {
    const tools = contractsHandler.getTools();
    expect(tools.map((t) => t.name)).toEqual([
      "halopsa_contracts_list",
      "halopsa_contracts_get",
    ]);
    expect(tools[1].inputSchema.required).toContain("contract_id");
  });

  it("lists contracts for one client and returns Halo's fields unchanged", async () => {
    const result = await contractsHandler.handleCall("halopsa_contracts_list", {
      client_id: 3,
      limit: 20,
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.contracts[0]).toEqual({ id: 7, ref: "C-7", client_id: 3, hours: 40 });
    expect(mockClient.contracts.list).toHaveBeenCalledWith({
      client_id: 3,
      pageSize: 20,
      pageNo: 1,
      count: true,
    });
  });

  it("rejects an invalid client_id before calling Halo", async () => {
    const result = await contractsHandler.handleCall("halopsa_contracts_list", {
      client_id: "3",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/client_id/);
    expect(mockClient.contracts.list).not.toHaveBeenCalled();
  });

  it("gets a contract by id", async () => {
    const result = await contractsHandler.handleCall("halopsa_contracts_get", {
      contract_id: 7,
    });

    expect(JSON.parse(result.content[0].text).ref).toBe("C-7");
    expect(mockClient.contracts.get).toHaveBeenCalledWith(7);
  });

  it.each([undefined, "7", 0, 1.5])("rejects invalid contract_id %s", async (contract_id) => {
    const result = await contractsHandler.handleCall("halopsa_contracts_get", {
      contract_id,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/contract_id/);
    expect(mockClient.contracts.get).not.toHaveBeenCalled();
  });

  it("returns an error for an unknown tool", async () => {
    const result = await contractsHandler.handleCall("halopsa_contracts_nope", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown contract tool");
  });
});
