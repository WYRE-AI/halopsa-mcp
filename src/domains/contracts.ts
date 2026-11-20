/**
 * Contracts domain handler
 *
 * Read-only access to Halo client contracts. Records are returned as Halo
 * supplies them, so any hours or billing-period fields the tenant exposes on
 * a contract come through unchanged.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { invalidInput } from "../utils/input-schema.js";
import { normalizeList } from "../utils/list-response.js";
import {
  contractGetSchema,
  contractListSchema,
} from "../utils/catalog-input.js";

function getTools(): Tool[] {
  return [
    {
      name: "halopsa_contracts_list",
      description:
        "List one page of Halo client contracts, optionally for one client. Records are returned as Halo supplies them. The filters are sent to Halo as query parameters, which ignores any it does not support, so check that returned records match the client_id, site_id, status, type and inactive filters you set.",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: { type: "integer", minimum: 1 },
          site_id: { type: "integer", minimum: 1 },
          status: { type: "string" },
          type: { type: "string" },
          inactive: { type: "boolean", description: "Include inactive contracts" },
          search: { type: "string", description: "Search contracts" },
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
      name: "halopsa_contracts_get",
      description: "Get a Halo client contract by ID",
      inputSchema: {
        type: "object" as const,
        properties: { contract_id: { type: "integer", minimum: 1 } },
        required: ["contract_id"],
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
    case "halopsa_contracts_list": {
      const parsed = contractListSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const { limit, page_no: pageNo, ...filters } = parsed.data;
      const { record_count, rows } = normalizeList(
        await client.contracts.list({
          ...filters,
          pageSize: limit,
          pageNo,
          count: true,
        }),
        "contracts"
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
                contracts: rows,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_contracts_get": {
      const parsed = contractGetSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const contract = await client.contracts.get(parsed.data.contract_id);
      return { content: [{ type: "text", text: JSON.stringify(contract, null, 2) }] };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown contract tool: ${toolName}` }],
        isError: true,
      };
  }
}

/** Handles contracts-domain tool discovery and validated contract lookups. */
export const contractsHandler: DomainHandler = { getTools, handleCall };
