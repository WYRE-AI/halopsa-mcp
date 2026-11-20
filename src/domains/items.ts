/**
 * Items domain handler
 *
 * Read-only access to the Halo items catalog (products, services, bundles).
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { invalidInput } from "../utils/input-schema.js";
import { normalizeList } from "../utils/list-response.js";
import { itemGetSchema, itemListSchema } from "../utils/catalog-input.js";

function getTools(): Tool[] {
  return [
    {
      name: "halopsa_items_list",
      description:
        "List one page of the Halo items catalog (products, services, bundles). The type, category, supplier_id and inactive filters are best-effort: they are sent to Halo as query parameters, which ignores any it does not support, so check that returned records match the filter.",
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
      if (!parsed.success) return invalidInput(parsed.error);
      const { limit, page_no: pageNo, ...filters } = parsed.data;
      const { record_count, rows } = normalizeList(
        await client.items.list({
          ...filters,
          pageSize: limit,
          pageNo,
          count: true,
        }),
        "items"
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count,
                page_no: pageNo,
                page_size: limit,
                items: rows,
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
      if (!parsed.success) return invalidInput(parsed.error);
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
