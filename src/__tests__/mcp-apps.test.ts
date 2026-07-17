/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the ticket card:
 *   1. renderable tools advertise the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildTicketCard normalizes a HaloPSA ticket into the card payload
 *      the iframe renders from, with a safe internal-only note default
 */

import { describe, it, expect, vi } from "vitest";
import { getAvailableDomains, getDomainHandler } from "../domains/index.js";
import { listResources, readResource } from "../resources.js";
import {
  buildTicketCard,
  applyBrandInjection,
  TICKET_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from "../card.builder.js";
import { TICKET_CARD_HTML } from "../generated/ticket-card-html.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const RENDERABLE_TOOLS = ["halopsa_tickets_get", "halopsa_tickets_add_action"];

async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const domain of getAvailableDomains()) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }
  return tools;
}

describe("MCP Apps ticket card", () => {
  describe("tool _meta advertisement", () => {
    it.each(RENDERABLE_TOOLS)("%s links the card via _meta", async (name) => {
      const tool = (await getAllTools()).find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.["ui/resourceUri"]).toBe(TICKET_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        TICKET_CARD_RESOURCE_URI
      );
    });

    it("no other tools carry UI metadata", async () => {
      const others = (await getAllTools()).filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe("ui:// resource", () => {
    it("is listed with the MCP Apps MIME type", () => {
      const card = listResources().find((r) => r.uri === TICKET_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it("reads back as profile=mcp-app HTML containing the card app", () => {
      const content = readResource(TICKET_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(TICKET_CARD_HTML);
      expect(content.text).toContain("card__bar");
      expect(content.text).toContain("BRAND_INJECT");
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./ticket-card.ts"');
    });

    it("serves neutral defaults with no vendor identity", () => {
      const { text } = readResource(TICKET_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain("00c9db"); // WYRE cyan
      expect(text).not.toContain("ede947"); // WYRE yellow
      expect(text).not.toContain("fonts.googleapis.com"); // no external fetches
    });

    it("injects MCP_BRAND_* env vars into the served HTML", () => {
      vi.stubEnv("MCP_BRAND_NAME", "Acme MSP");
      vi.stubEnv("MCP_BRAND_PRIMARY_COLOR", "#ff0000");
      try {
        const { text } = readResource(TICKET_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain("BRAND_INJECT");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects unknown resource URIs", () => {
      expect(() => readResource("ui://halopsa/nope.html")).toThrow(/Unknown resource/);
    });
  });

  describe("applyBrandInjection", () => {
    const html = TICKET_CARD_HTML;

    it("replaces the marker with an inline window.__BRAND__ script", () => {
      const out = applyBrandInjection(html, { name: "Acme", primaryColor: "#123456" });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain("BRAND_INJECT");
    });

    it("escapes < so brand values cannot break out of the script tag", () => {
      const out = applyBrandInjection(html, { name: '</script><script>alert(1)' });
      expect(out).not.toContain("</script><script>alert(1)");
      expect(out).toContain("\\u003c/script>\\u003cscript>alert(1)");
    });

    it("returns the HTML unchanged for an empty brand", () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: "" })).toBe(html);
    });
  });

  describe("buildTicketCard", () => {
    const ticket = {
      id: 4821,
      summary: "VPN outage — main office",
      status_id: 1,
      status_name: "New",
      priority_id: 2,
      priority_name: "High",
      client_id: 12,
      client_name: "Acme Corp",
      agent_id: 7,
      agent_name: "Dana Ruiz",
      team_id: 3,
      team_name: "Service Desk",
      dateoccurred: "2026-07-17T09:00:00Z",
      deadlinedate: "2026-07-18T17:00:00Z",
    };

    const mockActionsList = vi.fn(async () => ({
      record_count: 1,
      actions: [{ id: 1, who: "Dana Ruiz", note: "Assigned to network team" }],
    }));
    const client = { actions: { list: mockActionsList } };

    it("normalizes labels, names, and notes into the card payload", async () => {
      const card = await buildTicketCard(ticket, client as never);
      expect(card).toMatchObject({
        id: 4821,
        summary: "VPN outage — main office",
        status: "New",
        priority: "High",
        client: "Acme Corp",
        agent: "Dana Ruiz",
        team: "Service Desk",
        dateOccurred: "2026-07-17T09:00:00Z",
        deadline: "2026-07-18T17:00:00Z",
        notes: [{ who: "Dana Ruiz", note: "Assigned to network team" }],
      });
    });

    it("defaults the add-note round-trip to internal-only visibility", async () => {
      const card = await buildTicketCard(ticket, client as never);
      expect(card?.noteDefaults).toEqual({ hidden_from_user: true });
    });

    it("falls back to #id labels when the API omits resolved names", async () => {
      const bare = { id: 1, summary: "Printer down", status_id: 4, priority_id: 9 };
      const card = await buildTicketCard(bare, client as never);
      expect(card?.status).toBe("#4");
      expect(card?.priority).toBe("#9");
      expect(card?.client).toBeUndefined();
    });

    it("uses already-fetched actions without refetching", async () => {
      mockActionsList.mockClear();
      const withActions = {
        ...ticket,
        actions: [
          { id: 1, who: "Bot", note: "x".repeat(600) },
          { id: 2, who: "Dana Ruiz", note: "Escalated" },
        ],
      };
      const card = await buildTicketCard(withActions, client as never);
      expect(mockActionsList).not.toHaveBeenCalled();
      expect(card?.notes).toHaveLength(2);
      // Long notes are truncated so the card payload stays small.
      expect(card?.notes[0].note).toHaveLength(500);
    });

    it("returns null for payloads that are not a ticket", async () => {
      expect(await buildTicketCard({ id: 1 }, client as never)).toBeNull();
      expect(
        await buildTicketCard({ summary: "no id" }, client as never)
      ).toBeNull();
    });

    it("survives action-fetch failures (card is best-effort)", async () => {
      const failing = {
        actions: {
          list: vi.fn(async () => {
            throw new Error("HaloPSA 500");
          }),
        },
      };
      const card = await buildTicketCard(ticket, failing as never);
      expect(card).toMatchObject({ id: 4821, notes: [] });
      expect(card?.status).toBe("New");
    });
  });
});
