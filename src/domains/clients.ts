/**
 * Clients domain handler
 *
 * Provides tools for client (company) operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { elicitText } from "../utils/elicitation.js";

/**
 * Get client domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_clients_list",
      description: "List companies",
      inputSchema: {
        type: "object" as const,
        properties: {
          search: {
            type: "string",
          },
          inactive: {
            type: "boolean",
            description: "Include inactive",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "halopsa_clients_get",
      description: "Get company details by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: {
            type: "number",
          },
        },
        required: ["client_id"],
      },
    },
    {
      name: "halopsa_clients_create",
      description: "Create company",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
          },
          website: {
            type: "string",
          },
          phonenumber: {
            type: "string",
          },
          email: {
            type: "string",
          },
          notes: {
            type: "string",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "halopsa_clients_search",
      description: "Search companies by name",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 25)",
          },
        },
        required: ["query"],
      },
    },
  ];
}

/**
 * Handle a client domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_clients_list": {
      const limit = (args.limit as number) || 50;
      let search = args.search as string | undefined;

      // If no filters provided, elicit a search term from the user
      const hasFilters = args.search || args.inactive !== undefined;

      if (!hasFilters) {
        const searchTerm = await elicitText(
          "No search filters provided. Would you like to search for a specific client?",
          "search",
          "Enter a client name or keyword to search"
        );

        if (searchTerm) {
          search = searchTerm;
        }
      }

      const response = await client.clients.list({
        search,
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
                clients: response.clients,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_clients_get": {
      const clientId = args.client_id as number;
      const clientData = await client.clients.get(clientId);

      return {
        content: [{ type: "text", text: JSON.stringify(clientData, null, 2) }],
      };
    }

    case "halopsa_clients_create": {
      const newClient = await client.clients.create({
        name: args.name as string,
        website: args.website as string | undefined,
        phonenumber: args.phonenumber as string | undefined,
        email: args.email as string | undefined,
        notes: args.notes as string | undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(newClient, null, 2) }],
      };
    }

    case "halopsa_clients_search": {
      const limit = (args.limit as number) || 25;
      const response = await client.clients.list({
        search: args.query as string,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                clients: response.clients,
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
        content: [{ type: "text", text: `Unknown client tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const clientsHandler: DomainHandler = {
  getTools,
  handleCall,
};
