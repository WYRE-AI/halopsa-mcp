/**
 * Tests for shared types and utilities
 */

import { describe, it, expect } from "vitest";
import { isDomainName, type DomainName, type CallToolResult } from "../utils/types.js";

describe("Types", () => {
  describe("isDomainName", () => {
    it("should validate all known domain names", () => {
      const validDomains: DomainName[] = [
        "tickets",
        "clients",
        "assets",
        "agents",
        "invoices",
      ];

      for (const domain of validDomains) {
        expect(isDomainName(domain)).toBe(true);
      }
    });

    it("should reject invalid domain names", () => {
      const invalidDomains = [
        "",
        "ticket",
        "TICKETS",
        "Tickets",
        "users",
        "projects",
        "contracts",
        "unknown",
        "null",
        "undefined",
      ];

      for (const domain of invalidDomains) {
        expect(isDomainName(domain)).toBe(false);
      }
    });

    it("should handle edge cases", () => {
      expect(isDomainName(" tickets")).toBe(false);
      expect(isDomainName("tickets ")).toBe(false);
      expect(isDomainName(" tickets ")).toBe(false);
    });
  });

  describe("CallToolResult type", () => {
    it("should accept valid success result", () => {
      const result: CallToolResult = {
        content: [{ type: "text", text: "Success message" }],
      };

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Success message");
      expect(result.isError).toBeUndefined();
    });

    it("should accept valid error result", () => {
      const result: CallToolResult = {
        content: [{ type: "text", text: "Error message" }],
        isError: true,
      };

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Error message");
      expect(result.isError).toBe(true);
    });

    it("should accept multiple content items", () => {
      const result: CallToolResult = {
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ],
      };

      expect(result.content).toHaveLength(2);
    });
  });
});

describe("DomainName type", () => {
  it("should be exhaustive", () => {
    // This test verifies that the type guard covers all domain names
    function handleDomain(domain: DomainName): string {
      switch (domain) {
        case "tickets":
          return "tickets";
        case "clients":
          return "clients";
        case "assets":
          return "assets";
        case "agents":
          return "agents";
        case "invoices":
          return "invoices";
        default: {
          // This line should never be reached if DomainName is exhaustive
          const _exhaustiveCheck: never = domain;
          return _exhaustiveCheck;
        }
      }
    }

    // Verify the function handles all domains
    expect(handleDomain("tickets")).toBe("tickets");
    expect(handleDomain("clients")).toBe("clients");
    expect(handleDomain("assets")).toBe("assets");
    expect(handleDomain("agents")).toBe("agents");
    expect(handleDomain("invoices")).toBe("invoices");
  });
});
