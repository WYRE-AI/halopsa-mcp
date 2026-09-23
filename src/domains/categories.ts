/**
 * Categories domain handler
 *
 * Provides tools for Halo ticket category lookup. Ticket create and update
 * take the category name (not the id) on category_1–category_4, matched to
 * the category's level.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";

/**
 * Get category domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_categories_list",
      description:
        "List Halo ticket categories. Pass a category's name as category_1–category_4 on ticket create or update, matching the category level (1–4).",
      inputSchema: {
        type: "object" as const,
        properties: {
          inactive: {
            type: "boolean",
            description: "Include inactive categories",
          },
          search: {
            type: "string",
            description: "Full-text search across category names",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "halopsa_categories_get",
      description: "Get a Halo ticket category by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          category_id: {
            type: "number",
          },
        },
        required: ["category_id"],
      },
    },
  ];
}

/**
 * Handle a category domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_categories_list": {
      const limit = (args.limit as number) || 50;
      const response = await client.categories.list({
        inactive: args.inactive as boolean | undefined,
        search: args.search as string | undefined,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                categories: response.categories,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_categories_get": {
      const categoryId = args.category_id as number;
      const category = await client.categories.get(categoryId);

      return {
        content: [{ type: "text", text: JSON.stringify(category, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown category tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const categoriesHandler: DomainHandler = {
  getTools,
  handleCall,
};
