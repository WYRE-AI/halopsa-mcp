/**
 * Lazy-loaded HaloPSA client
 *
 * This module provides lazy initialization of the HaloPSA client
 * to avoid loading the entire library upfront.
 */

import type { HaloPsaClient } from "@asachs01/node-halopsa";

export interface HaloPsaCredentials {
  clientId: string;
  clientSecret: string;
  tenant?: string;
  baseUrl?: string;
}

let _client: HaloPsaClient | null = null;
let _credentials: HaloPsaCredentials | null = null;

/**
 * Get credentials from environment variables
 */
export function getCredentials(): HaloPsaCredentials | null {
  const clientId = process.env.HALOPSA_CLIENT_ID;
  const clientSecret = process.env.HALOPSA_CLIENT_SECRET;
  const tenant = process.env.HALOPSA_TENANT;
  const baseUrl = process.env.HALOPSA_BASE_URL;

  if (!clientId || !clientSecret) {
    return null;
  }

  // Either tenant or baseUrl must be provided
  if (!tenant && !baseUrl) {
    return null;
  }

  return { clientId, clientSecret, tenant, baseUrl };
}

/**
 * Get or create the HaloPSA client (lazy initialization)
 */
export async function getClient(): Promise<HaloPsaClient> {
  const creds = getCredentials();

  if (!creds) {
    throw new Error(
      "No API credentials provided. Please configure HALOPSA_CLIENT_ID, HALOPSA_CLIENT_SECRET, and either HALOPSA_TENANT or HALOPSA_BASE_URL environment variables."
    );
  }

  // If credentials changed, invalidate the cached client
  if (
    _client &&
    _credentials &&
    (creds.clientId !== _credentials.clientId ||
      creds.clientSecret !== _credentials.clientSecret ||
      creds.tenant !== _credentials.tenant ||
      creds.baseUrl !== _credentials.baseUrl)
  ) {
    _client = null;
  }

  if (!_client) {
    // Lazy import the library
    const { HaloPsaClient } = await import("@asachs01/node-halopsa");
    _client = new HaloPsaClient({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      tenant: creds.tenant,
      baseUrl: creds.baseUrl,
    });
    _credentials = creds;
  }

  return _client;
}

/**
 * Clear the cached client (useful for testing)
 */
export function clearClient(): void {
  _client = null;
  _credentials = null;
}
