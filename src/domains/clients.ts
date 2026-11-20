/**
 * Clients domain handler
 *
 * Provides tools for client (company) operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { elicitText } from "../utils/elicitation.js";
import { invalidInput } from "../utils/input-schema.js";
import { normalizeList } from "../utils/list-response.js";
import {
  clientUpdateSchema,
  contactCreateSchema,
  contactListSchema,
  contactUpdateSchema,
  siteListSchema,
} from "../utils/client-input.js";

const PAGING = {
  limit: { type: "integer", minimum: 1, description: "Page size (default: 50)" },
  page_no: {
    type: "integer",
    minimum: 1,
    description: "Page number, starting at 1 (default: 1)",
  },
} as const;

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
    {
      name: "halopsa_clients_update",
      description:
        "Update a company's name, website, phone, email, notes or active state. Only the fields you pass change.",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: { type: "integer", minimum: 1 },
          name: { type: "string" },
          website: { type: "string" },
          phonenumber: { type: "string" },
          email: { type: "string" },
          notes: { type: "string" },
          inactive: { type: "boolean", description: "Set true to deactivate the company" },
        },
        required: ["client_id"],
      },
    },
    {
      name: "halopsa_clients_list_contacts",
      description:
        "List one page of Halo contacts (end users), optionally for one client or site. Use it to find an existing user before creating one.",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: { type: "integer", minimum: 1 },
          site_id: { type: "integer", minimum: 1 },
          inactive: { type: "boolean", description: "Include inactive contacts" },
          search: { type: "string", description: "Search contact names" },
          ...PAGING,
        },
      },
    },
    {
      name: "halopsa_clients_create_contact",
      description:
        "Create a contact (end user) under a company, for onboarding a new user. Check halopsa_clients_list_contacts first to avoid duplicates.",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: { type: "integer", minimum: 1 },
          name: { type: "string" },
          emailaddress: { type: "string" },
          phonenumber: { type: "string" },
          mobilephone: { type: "string" },
          site_id: { type: "integer", minimum: 1 },
          notes: { type: "string" },
        },
        required: ["client_id", "name"],
      },
    },
    {
      name: "halopsa_clients_update_contact",
      description:
        "Update a contact (end user): name, email, phones, site, notes, or deactivate for offboarding. Only the fields you pass change.",
      inputSchema: {
        type: "object" as const,
        properties: {
          contact_id: { type: "integer", minimum: 1 },
          name: { type: "string" },
          emailaddress: { type: "string" },
          phonenumber: { type: "string" },
          mobilephone: { type: "string" },
          site_id: { type: "integer", minimum: 1 },
          notes: { type: "string" },
          inactive: { type: "boolean", description: "Set true to deactivate the contact" },
        },
        required: ["contact_id"],
      },
    },
    {
      name: "halopsa_clients_list_sites",
      description:
        "List one page of Halo sites, optionally for one client. Use the site id when creating or updating a contact.",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: { type: "integer", minimum: 1 },
          inactive: { type: "boolean", description: "Include inactive sites" },
          search: { type: "string", description: "Search site names" },
          ...PAGING,
        },
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

    case "halopsa_clients_update": {
      const parsed = clientUpdateSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const { client_id, ...changes } = parsed.data;
      const updated = await client.clients.update(client_id, changes);
      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }

    case "halopsa_clients_list_contacts": {
      const parsed = contactListSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const { limit, page_no: pageNo, ...filters } = parsed.data;
      const { record_count, rows } = normalizeList(
        await client.contacts.list({ ...filters, pageSize: limit, pageNo, count: true }),
        "users"
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { record_count, page_no: pageNo, page_size: limit, contacts: rows },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_clients_create_contact": {
      const parsed = contactCreateSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const created = await client.contacts.create(parsed.data);
      return {
        content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
      };
    }

    case "halopsa_clients_update_contact": {
      const parsed = contactUpdateSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const { contact_id, ...changes } = parsed.data;
      const updated = await client.contacts.update(contact_id, changes);
      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }

    case "halopsa_clients_list_sites": {
      const parsed = siteListSchema.safeParse(args);
      if (!parsed.success) return invalidInput(parsed.error);
      const { limit, page_no: pageNo, ...filters } = parsed.data;
      const { record_count, rows } = normalizeList(
        await client.sites.list({ ...filters, pageSize: limit, pageNo, count: true }),
        "sites"
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { record_count, page_no: pageNo, page_size: limit, sites: rows },
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
