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
      description: "List clients (companies) in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          search: {
            type: "string",
            description: "Search term to filter clients",
          },
          inactive: {
            type: "boolean",
            description: "Include inactive clients",
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
      description: "Get details for a specific client by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: {
            type: "number",
            description: "The client ID",
          },
        },
        required: ["client_id"],
      },
    },
    {
      name: "halopsa_clients_create",
      description: "Create a new client in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Client/company name",
          },
          website: {
            type: "string",
            description: "Company website URL",
          },
          phonenumber: {
            type: "string",
            description: "Phone number",
          },
          email: {
            type: "string",
            description: "Primary email address",
          },
          notes: {
            type: "string",
            description: "Additional notes",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "halopsa_clients_search",
      description: "Search for clients by name or other criteria",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query",
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
