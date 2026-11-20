/**
 * Items domain handler
 *
 * Read-only access to the Halo items catalog (products, services, bundles).
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import {
  invalidCatalogInput,
  itemGetSchema,
  itemListSchema,
} from "../utils/catalog-input.js";

function getTools(): Tool[] {
  return [
    {
      name: "halopsa_items_list",
      description:
        "List one page of the Halo items catalog (products, services, bundles) with optional filters",
      inputSchema: {
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            enum: ["product", "service", "bundle"],
            description: "Filter by item type",
          },
          category: { type: "string", description: "Filter by item category" },
          supplier_id: { type: "integer", minimum: 1 },
          inactive: { type: "boolean", description: "Include inactive items" },
          search: { type: "string", description: "Search item names" },
          limit: { type: "integer", minimum: 1, description: "Page size (default: 50)" },
          page_no: {
            type: "integer",
            minimum: 1,
            description: "Page number, starting at 1 (default: 1)",
          },
        },
      },
    },
    {
      name: "halopsa_items_get",
      description: "Get a Halo catalog item by ID",
      inputSchema: {
        type: "object" as const,
        properties: { item_id: { type: "integer", minimum: 1 } },
        required: ["item_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_items_list": {
      const parsed = itemListSchema.safeParse(args);
      if (!parsed.success) return invalidCatalogInput(parsed.error);
      const { limit, page_no: pageNo, ...filters } = parsed.data;
      const response = await client.items.list({
        ...filters,
        pageSize: limit,
        pageNo,
        count: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                page_no: pageNo,
                page_size: limit,
                items: response.items,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_items_get": {
      const parsed = itemGetSchema.safeParse(args);
      if (!parsed.success) return invalidCatalogInput(parsed.error);
      const item = await client.items.get(parsed.data.item_id);
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown item tool: ${toolName}` }],
        isError: true,
      };
  }
}

/** Handles items-domain tool discovery and validated catalog lookups. */
export const itemsHandler: DomainHandler = { getTools, handleCall };
