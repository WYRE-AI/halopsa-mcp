/**
 * Tickets domain handler
 *
 * Provides tools for ticket operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { elicitSelection } from "../utils/elicitation.js";
import { buildTicketCard, TICKET_CARD_META } from "../card.builder.js";

/**
 * Get ticket domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_tickets_list",
      description:
        "List tickets with optional filters by client, status, agent, open/closed state, date occurred range, or full-text search. " +
        "Results are one page. record_count is the total number of matching tickets, not the number of tickets in this page. " +
        "page_no and page_size in the result identify that page.",
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
            description:
              "ISO-8601 start of the date-occurred window (e.g. 2026-04-06T00:00:00Z). Tickets outside the window are excluded.",
          },
          dateoccurred_end: {
            type: "string",
            description:
              "ISO-8601 end of the date-occurred window. Tickets outside the window are excluded.",
          },
          search: {
            type: "string",
            description: "Full-text search across tickets, in place of a multi-page sweep",
          },
          limit: {
            type: "number",
            description:
              "Page size (default 50). Applied on every page, including the first.",
          },
          page_no: {
            type: "number",
            description:
              "Page number, starting at 1 (default 1). The next page continues directly after this page.",
          },
        },
      },
    },
    {
      name: "halopsa_tickets_get",
      description: "Get ticket details by ID",
      _meta: TICKET_CARD_META,
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
      _meta: TICKET_CARD_META,
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
      // HaloPSA ignores page_size unless page_no is on the same request, and
      // then uses its own page size (50) for that implicit first page. A
      // later page_no=2 starts at offset (page_no-1)*limit, so the records
      // between the short first page and that offset are never returned.
      // Defaulting to page 1 makes `limit` apply on the first call too.
      // count=true asks Halo for the total match count; without it,
      // record_count is the number of tickets in this page on calls where
      // pagination is not fully active, and the total on calls where it is.
      const pageNo = resolvePageNo(args.page_no);
      if (typeof pageNo !== "number") {
        return {
          content: [{ type: "text", text: pageNo.error }],
          isError: true,
        };
      }
      const dateStart = args.dateoccurred_start as string | undefined;
      const dateEnd = args.dateoccurred_end as string | undefined;
      const search = args.search as string | undefined;
      let openOnly = args.open_only as boolean | undefined;
      const closedOnly = args.closed_only as boolean | undefined;

      const hasFilters =
        args.client_id || args.status_id || args.agent_id ||
        args.open_only !== undefined || args.closed_only !== undefined ||
        dateStart || dateEnd || search;

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
        // Forwarded for the Halo client to translate into
        // datesearch=dateoccured plus startdate/enddate. The wrapper names
        // are not Halo query parameters; sending them unchanged is accepted
        // and then ignored.
        dateoccurred_start: dateStart,
        dateoccurred_end: dateEnd,
        search: search,
        pageSize: limit,
        pageNo: pageNo,
        count: true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                page_no: pageNo,
                page_size: limit,
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

      const payload: Record<string, unknown> = includeActions
        ? { ...ticket, actions }
        : { ...ticket };

      // MCP Apps: attach the normalized card payload the ui:// ticket card
      // renders from. Best-effort — a null card just means no UI surface.
      const card = await buildTicketCard(payload, client);
      if (card) payload._card = card;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
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

/**
 * Page 1 is the default. Any other value must be a whole number of at least 1.
 * Zero, fractions, and non-numbers are rejected here so they never become a
 * Halo request.
 */
function resolvePageNo(
  value: unknown
): number | { error: string } {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return {
      error: "page_no must be an integer greater than or equal to 1",
    };
  }
  return value;
}

export const ticketsHandler: DomainHandler = {
  getTools,
  handleCall,
};
