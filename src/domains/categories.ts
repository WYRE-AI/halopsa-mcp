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
import {
  categoryGetSchema,
  categoryListSchema,
  invalidCategoryInput,
} from "../utils/category-input.js";

/**
 * Get category domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_categories_list",
      description:
        "List one page of Halo ticket categories. Pass a category's name as category_1–category_4 on ticket create or update, matching the category level (1–4).",
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
            type: "integer",
            minimum: 1,
            description: "Page size (default: 50)",
          },
          page_no: {
            type: "integer",
            minimum: 1,
            description: "Page number, starting at 1 (default: 1)",
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
            type: "integer",
            minimum: 1,
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
      const parsed = categoryListSchema.safeParse(args);
      if (!parsed.success) return invalidCategoryInput(parsed.error);
      const { limit, page_no: pageNo, inactive, search } = parsed.data;
      const request = {
        inactive,
        search,
        pageSize: limit,
        pageNo,
        pageinate: true,
        count: true,
      };
      const response = await client.categories.list(request);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                page_no: pageNo,
                page_size: limit,
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
      const parsed = categoryGetSchema.safeParse(args);
      if (!parsed.success) return invalidCategoryInput(parsed.error);
      const category = await client.categories.get(parsed.data.category_id);

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

/** Handles category-domain tool discovery and validated category lookup calls. */
export const categoriesHandler: DomainHandler = {
  getTools,
  handleCall,
};
