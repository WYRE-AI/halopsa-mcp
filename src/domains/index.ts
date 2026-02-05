/**
 * Domain handlers index
 *
 * Lazy-loads domain handlers to avoid loading everything upfront.
 */

import type { DomainHandler } from "../utils/types.js";
import type { DomainName } from "../utils/types.js";

// Cache for loaded domain handlers
const domainCache = new Map<DomainName, DomainHandler>();

/**
 * Lazy-load a domain handler
 */
export async function getDomainHandler(
  domain: DomainName
): Promise<DomainHandler> {
  // Check cache first
  const cached = domainCache.get(domain);
  if (cached) {
    return cached;
  }

  // Dynamically import the domain handler
  let handler: DomainHandler;

  switch (domain) {
    case "tickets": {
      const { ticketsHandler } = await import("./tickets.js");
      handler = ticketsHandler;
      break;
    }
    case "clients": {
      const { clientsHandler } = await import("./clients.js");
      handler = clientsHandler;
      break;
    }
    case "assets": {
      const { assetsHandler } = await import("./assets.js");
      handler = assetsHandler;
      break;
    }
    case "agents": {
      const { agentsHandler } = await import("./agents.js");
      handler = agentsHandler;
      break;
    }
    case "invoices": {
      const { invoicesHandler } = await import("./invoices.js");
      handler = invoicesHandler;
      break;
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }

  // Cache the handler
  domainCache.set(domain, handler);
  return handler;
}

/**
 * Get all available domain names
 */
export function getAvailableDomains(): DomainName[] {
  return ["tickets", "clients", "assets", "agents", "invoices"];
}

/**
 * Clear the domain cache (useful for testing)
 */
export function clearDomainCache(): void {
  domainCache.clear();
}
