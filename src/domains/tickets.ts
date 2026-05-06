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
      description: "List tickets with optional filters by client, status, agent, open/closed state, or date occurred range",
      inputSchema: {
        type: "object" as const,
        properties: {
          client_id: {
            type: "number",
          },
          status_id: {
            type: "number",
          },
          agent_id: {
            type: "number",
          },
          open_only: {
            type: "boolean",
          },
          closed_only: {
            type: "boolean",
          },
          dateoccurred_start: {
            type: "string",
            description: "ISO-8601 start date for tickets (e.g. 2026-04-06T00:00:00Z)",
          },
          dateoccurred_end: {
            type: "string",
            description: "ISO-8601 end date for tickets",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
          page_no: {
            type: "number",
            description: "Page number (1-indexed) for pagination",
          },
        },
      },
    },
    {
      name: "halopsa_tickets_get",
      description: "Get ticket details by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          ticket_id: {
            type: "number",
          },
          include_actions: {
            type: "boolean",
            description: "Include actions/notes",
          },
        },
        required: ["ticket_id"],
      },
    },
    {
      name: "halopsa_tickets_create",
      description: "Create ticket",
      inputSchema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "string",
          },
          details: {
            type: "string",
          },
          client_id: {
            type: "number",
          },
          tickettype_id: {
            type: "number",
          },
          priority_id: {
            type: "number",
          },
          agent_id: {
            type: "number",
          },
          site_id: {
            type: "number",
          },
        },
        required: ["summary", "client_id", "tickettype_id"],
      },
    },
    {
      name: "halopsa_tickets_update",
      description: "Update ticket",
      inputSchema: {
        type: "object" as const,
        properties: {
          ticket_id: {
            type: "number",
          },
          summary: {
            type: "string",
          },
          details: {
            type: "string",
          },
          status_id: {
            type: "number",
          },
          priority_id: {
            type: "number",
          },
          agent_id: {
            type: "number",
          },
        },
        required: ["ticket_id"],
      },
    },
    {
      name: "halopsa_tickets_add_action",
      description: "Add note to ticket",
      inputSchema: {
        type: "object" as const,
        properties: {
          ticket_id: {
            type: "number",
          },
          note: {
            type: "string",
          },
          outcome: {
            type: "string",
          },
          timetaken: {
            type: "number",
            description: "Minutes",
          },
          hidden_from_user: {
            type: "boolean",
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
      const pageNo = args.page_no as number | undefined;
      const dateStart = args.dateoccurred_start as string | undefined;
      const dateEnd = args.dateoccurred_end as string | undefined;
      let openOnly = args.open_only as boolean | undefined;
      let closedOnly = args.closed_only as boolean | undefined;

      const hasFilters =
        args.client_id || args.status_id || args.agent_id ||
        args.open_only !== undefined || args.closed_only !== undefined ||
        dateStart || dateEnd;

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
      }

      const response = await client.tickets.list({
        client_id: args.client_id as number | undefined,
        status_id: args.status_id as number | undefined,
        agent_id: args.agent_id as number | undefined,
        open_only: openOnly,
        closed_only: closedOnly,
        dateoccurred_start: dateStart,
        dateoccurred_end: dateEnd,
        pageSize: limit,
        pageNo: pageNo,
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
