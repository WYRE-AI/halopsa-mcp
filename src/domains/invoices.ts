/**
 * Invoices domain handler
 *
 * Provides tools for invoice operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";

/**
 * Get invoice domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_invoices_list",
      description: "List invoices in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: {
            type: "number",
            description: "Filter invoices by client ID",
          },
          status: {
            type: "string",
            description: "Filter by invoice status",
          },
          sent: {
            type: "boolean",
            description: "Filter by sent status",
          },
          paid: {
            type: "boolean",
            description: "Filter by paid status",
          },
          invoice_date_start: {
            type: "string",
            description: "Filter by invoice date start (YYYY-MM-DD)",
          },
          invoice_date_end: {
            type: "string",
            description: "Filter by invoice date end (YYYY-MM-DD)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "halopsa_invoices_get",
      description: "Get details for a specific invoice by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          invoice_id: {
            type: "number",
            description: "The invoice ID",
          },
        },
        required: ["invoice_id"],
      },
    },
  ];
}

/**
 * Handle an invoice domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_invoices_list": {
      const limit = (args.limit as number) || 50;
      const response = await client.invoices.list({
        client_id: args.client_id as number | undefined,
        status: args.status as string | undefined,
        sent: args.sent as boolean | undefined,
        paid: args.paid as boolean | undefined,
        invoice_date_start: args.invoice_date_start as string | undefined,
        invoice_date_end: args.invoice_date_end as string | undefined,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                invoices: response.invoices,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_invoices_get": {
      const invoiceId = args.invoice_id as number;
      const invoice = await client.invoices.get(invoiceId);

      return {
        content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown invoice tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const invoicesHandler: DomainHandler = {
  getTools,
  handleCall,
};
