/**
 * Tickets domain handler
 *
 * Provides tools for ticket operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { elicitSelection } from "../utils/elicitation.js";

/**
 * Get ticket domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_tickets_list",
      description:
        "List tickets in HaloPSA. Can filter by client, status, or open/closed state.",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: {
            type: "number",
            description: "Filter tickets by client ID",
          },
          status_id: {
            type: "number",
            description: "Filter tickets by status ID",
          },
          agent_id: {
            type: "number",
            description: "Filter tickets by assigned agent ID",
          },
          open_only: {
            type: "boolean",
            description: "Show only open tickets",
          },
          closed_only: {
            type: "boolean",
            description: "Show only closed tickets",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "halopsa_tickets_get",
      description: "Get details for a specific ticket by its ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          ticket_id: {
            type: "number",
            description: "The ticket ID",
          },
          include_actions: {
            type: "boolean",
            description: "Include ticket actions/notes in the response",
          },
        },
        required: ["ticket_id"],
      },
    },
    {
      name: "halopsa_tickets_create",
      description: "Create a new ticket in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "string",
            description: "Ticket summary/title",
          },
          details: {
            type: "string",
            description: "Ticket description/details",
          },
          client_id: {
            type: "number",
            description: "Client ID for the ticket",
          },
          tickettype_id: {
            type: "number",
            description: "Ticket type ID",
          },
          priority_id: {
            type: "number",
            description: "Priority ID",
          },
          agent_id: {
            type: "number",
            description: "Assigned agent ID",
          },
          site_id: {
            type: "number",
            description: "Site ID",
          },
        },
        required: ["summary", "client_id", "tickettype_id"],
      },
    },
    {
      name: "halopsa_tickets_update",
      description: "Update an existing ticket in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          ticket_id: {
            type: "number",
            description: "The ticket ID to update",
          },
          summary: {
            type: "string",
            description: "New ticket summary",
          },
          details: {
            type: "string",
            description: "New ticket details",
          },
          status_id: {
            type: "number",
            description: "New status ID",
          },
          priority_id: {
            type: "number",
            description: "New priority ID",
          },
          agent_id: {
            type: "number",
            description: "New assigned agent ID",
          },
        },
        required: ["ticket_id"],
      },
    },
    {
      name: "halopsa_tickets_add_action",
      description: "Add an action (note) to a ticket",
      inputSchema: {
        type: "object" as const,
        properties: {
          ticket_id: {
            type: "number",
            description: "The ticket ID to add the action to",
          },
          note: {
            type: "string",
            description: "The note/action text",
          },
          outcome: {
            type: "string",
            description: "Action outcome",
          },
          timetaken: {
            type: "number",
            description: "Time taken in minutes",
          },
          hidden_from_user: {
            type: "boolean",
            description: "Hide this note from the end user",
          },
        },
        required: ["ticket_id", "note"],
      },
    },
  ];
}

/**
 * Handle a ticket domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_tickets_list": {
      const limit = (args.limit as number) || 50;
      let openOnly = args.open_only as boolean | undefined;
      let closedOnly = args.closed_only as boolean | undefined;

      // If no filters provided, elicit a date range from the user
      const hasFilters =
        args.client_id || args.status_id || args.agent_id ||
        args.open_only !== undefined || args.closed_only !== undefined;

      if (!hasFilters) {
        const selection = await elicitSelection(
          "No filters provided. Would you like to narrow the ticket list?",
          "date_range",
          [
            { value: "open", label: "Open tickets only" },
            { value: "today", label: "Today's tickets" },
            { value: "past_week", label: "Past week" },
            { value: "past_month", label: "Past month" },
            { value: "all", label: "All tickets (no filter)" },
          ]
        );

        if (selection === "open") {
          openOnly = true;
        }
        // Note: HaloPSA list API may not support date filtering directly,
        // so we use open_only as the primary elicited filter
      }

      const response = await client.tickets.list({
        client_id: args.client_id as number | undefined,
        status_id: args.status_id as number | undefined,
        agent_id: args.agent_id as number | undefined,
        open_only: openOnly,
        closed_only: closedOnly,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                tickets: response.tickets,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_tickets_get": {
      const ticketId = args.ticket_id as number;
      const includeActions = args.include_actions as boolean | undefined;

      const ticket = await client.tickets.get(ticketId);

      let actions;
      if (includeActions) {
        const actionsResponse = await client.actions.list({
          ticket_id: ticketId,
        });
        actions = actionsResponse.actions;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              includeActions ? { ...ticket, actions } : ticket,
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_tickets_create": {
      const ticket = await client.tickets.create({
        summary: args.summary as string,
        details: args.details as string | undefined,
        client_id: args.client_id as number,
        tickettype_id: args.tickettype_id as number,
        priority_id: args.priority_id as number | undefined,
        agent_id: args.agent_id as number | undefined,
        site_id: args.site_id as number | undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
      };
    }

    case "halopsa_tickets_update": {
      const ticketId = args.ticket_id as number;
      const ticket = await client.tickets.update(ticketId, {
        summary: args.summary as string | undefined,
        details: args.details as string | undefined,
        status_id: args.status_id as number | undefined,
        priority_id: args.priority_id as number | undefined,
        agent_id: args.agent_id as number | undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
      };
    }

    case "halopsa_tickets_add_action": {
      const ticketId = args.ticket_id as number;
      const action = await client.actions.create({
        ticket_id: ticketId,
        note: args.note as string,
        outcome: args.outcome as string | undefined,
        timetaken: args.timetaken as number | undefined,
        hiddenfromuser: args.hidden_from_user as boolean | undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(action, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown ticket tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const ticketsHandler: DomainHandler = {
  getTools,
  handleCall,
};
