/**
 * Tests for invoices domain handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted so they're available when vi.mock is hoisted
const { mockInvoicesList, mockInvoicesGet, mockClient } = vi.hoisted(() => {
  const mockInvoicesList = vi.fn();
  const mockInvoicesGet = vi.fn();

  const mockClient = {
    invoices: {
      list: mockInvoicesList,
      get: mockInvoicesGet,
    },
  };

  return {
    mockInvoicesList,
    mockInvoicesGet,
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
import { invoicesHandler } from "../../domains/invoices.js";

describe("Invoices Domain Handler", () => {
  beforeEach(() => {
    // Clear call history but NOT return values
    mockInvoicesList.mockClear();
    mockInvoicesGet.mockClear();

    // Reset mock implementations
    mockInvoicesList.mockResolvedValue({
      record_count: 2,
      invoices: [
        { id: 1, invoice_number: "INV-001", total: 1000.0, paid: false },
        { id: 2, invoice_number: "INV-002", total: 500.0, paid: true },
      ],
    });
    mockInvoicesGet.mockResolvedValue({
      id: 1,
      invoice_number: "INV-001",
      total: 1000.0,
      client_id: 5,
      paid: false,
      sent: true,
    });
  });

  describe("getTools", () => {
    it("should return all invoice tools", () => {
      const tools = invoicesHandler.getTools();

      expect(tools.length).toBe(2);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("halopsa_invoices_list");
      expect(toolNames).toContain("halopsa_invoices_get");
    });

    it("halopsa_invoices_list should have correct schema", () => {
      const tools = invoicesHandler.getTools();
      const listTool = tools.find((t) => t.name === "halopsa_invoices_list");

      expect(listTool).toBeDefined();
      expect(listTool?.inputSchema.properties).toHaveProperty("client_id");
      expect(listTool?.inputSchema.properties).toHaveProperty("status");
      expect(listTool?.inputSchema.properties).toHaveProperty("sent");
      expect(listTool?.inputSchema.properties).toHaveProperty("paid");
      expect(listTool?.inputSchema.properties).toHaveProperty("invoice_date_start");
      expect(listTool?.inputSchema.properties).toHaveProperty("invoice_date_end");
      expect(listTool?.inputSchema.properties).toHaveProperty("limit");
    });

    it("halopsa_invoices_get should require invoice_id", () => {
      const tools = invoicesHandler.getTools();
      const getTool = tools.find((t) => t.name === "halopsa_invoices_get");

      expect(getTool).toBeDefined();
      expect(getTool?.inputSchema.required).toContain("invoice_id");
    });
  });

  describe("handleCall", () => {
    describe("halopsa_invoices_list", () => {
      it("should list invoices with default parameters", async () => {
        const result = await invoicesHandler.handleCall("halopsa_invoices_list", {});

        expect(result.isError).toBeUndefined();
        expect(result.content[0].type).toBe("text");

        const data = JSON.parse(result.content[0].text);
        expect(data.record_count).toBe(2);
        expect(data.invoices).toHaveLength(2);
      });

      it("should pass filters to API", async () => {
        await invoicesHandler.handleCall("halopsa_invoices_list", {
          client_id: 5,
          status: "pending",
          sent: true,
          paid: false,
          invoice_date_start: "2025-01-01",
          invoice_date_end: "2025-12-31",
          limit: 100,
        });

        expect(mockInvoicesList).toHaveBeenCalledWith({
          client_id: 5,
          status: "pending",
          sent: true,
          paid: false,
          invoice_date_start: "2025-01-01",
          invoice_date_end: "2025-12-31",
          pageSize: 100,
        });
      });

      it("should handle partial filters", async () => {
        await invoicesHandler.handleCall("halopsa_invoices_list", {
          paid: true,
        });

        expect(mockInvoicesList).toHaveBeenCalledWith({
          client_id: undefined,
          status: undefined,
          sent: undefined,
          paid: true,
          invoice_date_start: undefined,
          invoice_date_end: undefined,
          pageSize: 50,
        });
      });
    });

    describe("halopsa_invoices_get", () => {
      it("should get a single invoice", async () => {
        const result = await invoicesHandler.handleCall("halopsa_invoices_get", {
          invoice_id: 1,
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(1);
        expect(data.invoice_number).toBe("INV-001");
        expect(data.total).toBe(1000.0);
        expect(data.client_id).toBe(5);
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await invoicesHandler.handleCall("halopsa_invoices_unknown", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown invoice tool");
      });
    });
  });
});
