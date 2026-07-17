/**
 * Ticket-card payload builder for the MCP Apps (SEP-1865) UI surface.
 *
 * halopsa_tickets_get results get a normalized `_card` object attached
 * (see domains/tickets.ts) that the ui:// ticket card renders from. The card
 * is progressive enhancement: every step here is best-effort, and a null
 * return simply means the host renders no card while the JSON payload is
 * unchanged.
 */

import type { HaloPsaClient } from "@wyre-technology/node-halopsa";

export const TICKET_CARD_RESOURCE_URI = "ui://halopsa/ticket-card.html";

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = "text/html;profile=mcp-app";

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const TICKET_CARD_META = {
  "ui/resourceUri": TICKET_CARD_RESOURCE_URI,
  ui: { resourceUri: TICKET_CARD_RESOURCE_URI },
} as const;

/** Mirror of TicketCard in ui/ticket-card.ts — keep in sync. */
export interface TicketCard {
  id: number;
  summary: string;
  status?: string;
  priority?: string;
  client?: string;
  agent?: string;
  team?: string;
  dateOccurred?: string;
  deadline?: string;
  notes: Array<{ who?: string; note: string }>;
  noteDefaults?: { hidden_from_user: boolean };
}

const CARD_NOTE_LIMIT = 5;
const CARD_NOTE_MAX_LENGTH = 500;

/**
 * Resolve a display label for a HaloPSA field: the API returns resolved
 * `*_name` strings alongside ids, so prefer the name and fall back to `#id`.
 */
function label(name: unknown, id: unknown): string | undefined {
  if (typeof name === "string" && name) return name;
  if (id != null) return `#${id}`;
  return undefined;
}

/**
 * Build the renderable card from a halopsa_tickets_get payload. `ticket` may
 * already carry `actions` (when include_actions was set); otherwise recent
 * actions are fetched best-effort so the card has visible note context.
 */
export async function buildTicketCard(
  ticket: Record<string, unknown>,
  client: Pick<HaloPsaClient, "actions">
): Promise<TicketCard | null> {
  if (typeof ticket?.id !== "number" || typeof ticket.summary !== "string" || !ticket.summary) {
    return null;
  }

  const card: TicketCard = {
    id: ticket.id,
    summary: ticket.summary,
    notes: [],
    // HaloPSA's client-portal visibility control on an action is the universal
    // `hiddenfromuser` boolean (not a tenant-specific enum), so an internal-only
    // default is always safe. The card never guesses visibility itself.
    noteDefaults: { hidden_from_user: true },
  };

  const status = label(ticket.status_name, ticket.status_id);
  const priority = label(ticket.priority_name, ticket.priority_id);
  const clientName = label(ticket.client_name, ticket.client_id);
  const agent = label(ticket.agent_name, ticket.agent_id);
  const team = label(ticket.team_name, ticket.team_id);
  if (status) card.status = status;
  if (priority) card.priority = priority;
  if (clientName) card.client = clientName;
  if (agent) card.agent = agent;
  if (team) card.team = team;
  if (ticket.dateoccurred) card.dateOccurred = String(ticket.dateoccurred);
  if (ticket.deadlinedate) card.deadline = String(ticket.deadlinedate);

  // Recent actions give the card (and its add-note round-trip) visible context.
  try {
    let actions = ticket.actions;
    if (!Array.isArray(actions)) {
      const response = await client.actions.list({
        ticket_id: ticket.id,
        pageSize: CARD_NOTE_LIMIT,
      });
      actions = response.actions;
    }
    if (Array.isArray(actions)) {
      // HaloPSA returns actions oldest-first; the last entries are the recent ones.
      card.notes = actions
        .filter((a) => a && typeof a.note === "string" && a.note)
        .slice(-CARD_NOTE_LIMIT)
        .map((a) => {
          const note: TicketCard["notes"][number] = {
            note: String(a.note).slice(0, CARD_NOTE_MAX_LENGTH),
          };
          if (a.who) note.who = String(a.who);
          return note;
        });
    }
  } catch {
    // Best-effort: render the card without notes rather than failing the tool.
  }

  return card;
}
