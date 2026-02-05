/**
 * Assets domain handler
 *
 * Provides tools for asset (configuration item) operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";

/**
 * Get asset domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_assets_list",
      description: "List assets (configuration items) in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: {
            type: "number",
            description: "Filter assets by client ID",
          },
          site_id: {
            type: "number",
            description: "Filter assets by site ID",
          },
          assettype_id: {
            type: "number",
            description: "Filter assets by asset type ID",
          },
          inactive: {
            type: "boolean",
            description: "Include inactive assets",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "halopsa_assets_get",
      description: "Get details for a specific asset by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          asset_id: {
            type: "number",
            description: "The asset ID",
          },
        },
        required: ["asset_id"],
      },
    },
    {
      name: "halopsa_assets_search",
      description: "Search for assets by keyword",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query (matches inventory number, key fields)",
          },
          client_id: {
            type: "number",
            description: "Optionally filter by client ID",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 25)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "halopsa_assets_list_types",
      description: "List available asset types",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of results (default: 100)",
          },
        },
      },
    },
  ];
}

/**
 * Handle an asset domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_assets_list": {
      const limit = (args.limit as number) || 50;
      const response = await client.assets.list({
        client_id: args.client_id as number | undefined,
        site_id: args.site_id as number | undefined,
        assettype_id: args.assettype_id as number | undefined,
        inactive: args.inactive as boolean | undefined,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                assets: response.assets,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_assets_get": {
      const assetId = args.asset_id as number;
      const asset = await client.assets.get(assetId);

      return {
        content: [{ type: "text", text: JSON.stringify(asset, null, 2) }],
      };
    }

    case "halopsa_assets_search": {
      const limit = (args.limit as number) || 25;
      const response = await client.assets.list({
        search: args.query as string,
        client_id: args.client_id as number | undefined,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                assets: response.assets,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_assets_list_types": {
      const limit = (args.limit as number) || 100;
      const response = await client.assetTypes.list({
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                asset_types: response.asset_types,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown asset tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const assetsHandler: DomainHandler = {
  getTools,
  handleCall,
};
