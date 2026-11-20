/**
 * Statuses domain handler
 *
 * Read-only lookup of Halo ticket statuses, so a ticket can be filtered or
 * moved by status without guessing ids. Records are returned as Halo supplies
 * them.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { invalidInput } from "../utils/input-schema.js";
import { normalizeList } from "../utils/list-response.js";
import { statusGetSchema, statusListSchema } from "../utils/catalog-input.js";

function getTools(): Tool[] {
  return [
    {
      name: "halopsa_statuses_list",
      description:
        "List one page of Halo ticket statuses (id and name). Use the id as status_id when filtering or updating tickets.",
      inputSchema: {
        type: "object" as const,
        properties: {
          inactive: { type: "boolean", description: "Include inactive statuses" },
          search: { type: "string", description: "Search status names" },
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
      name: "halopsa_statuses_get",
      description: "Get a Halo ticket status by ID",
      inputSchema: {
        type: "object" as const,
        properties: { status_id: { type: "integer", minimum: 1 } },
        required: ["status_id"],
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
    case "halopsa_statuses_list": {
      const parsed = statusListSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const { limit, page_no: pageNo, inactive, search } = parsed.data;
      // The reference-data list does not add `pageinate` itself, and Halo
      // ignores page_size without it.
      const request = {
        inactive,
        search,
        pageSize: limit,
        pageNo,
        pageinate: true,
        count: true,
      };
      const { record_count, rows } = normalizeList(
        await client.statuses.list(request),
        "statuses"
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
                statuses: rows,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_statuses_get": {
      const parsed = statusGetSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const status = await client.statuses.get(parsed.data.status_id);
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown status tool: ${toolName}` }],
        isError: true,
      };
  }
}

/** Handles status-domain tool discovery and validated status lookups. */
export const statusesHandler: DomainHandler = { getTools, handleCall };
