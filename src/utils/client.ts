/**
 * Lazy-loaded HaloPSA client with per-request credential isolation.
 *
 * In gateway (HTTP) mode, each inbound request stores its credentials in
 * AsyncLocalStorage so concurrent requests never share or overwrite each
 * other's credentials via process.env.
 *
 * In stdio mode the client falls back to environment variables as before.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { HaloPsaClient } from "@wyre-technology/node-halopsa";

export interface HaloPsaCredentials {
  clientId: string;
  clientSecret: string;
  tenant?: string;
  baseUrl?: string;
}

/**
 * Per-request credential store.
 * Gateway HTTP handler calls `runWithCredentials` to bind credentials
 * to the current async context.
 */
export const credentialStore = new AsyncLocalStorage<HaloPsaCredentials>();

/**
 * Run a callback with per-request credentials bound to the async context.
 */
export function runWithCredentials<T>(
  creds: HaloPsaCredentials,
  fn: () => T
): T {
  return credentialStore.run(creds, fn);
}

/**
 * Get credentials — first from AsyncLocalStorage (gateway mode),
 * then from environment variables (stdio / env mode).
 */
export function getCredentials(): HaloPsaCredentials | null {
  // Prefer per-request credentials from async context
  const perRequest = credentialStore.getStore();
  if (perRequest) {
    return perRequest;
  }

  // Fall back to environment variables
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
 * Client cache keyed by credential fingerprint so different tenants
 * get separate client instances, but the same tenant reuses its client.
 */
const clientCache = new Map<string, HaloPsaClient>();

function credentialKey(creds: HaloPsaCredentials): string {
  return `${creds.clientId}:${creds.tenant ?? ""}:${creds.baseUrl ?? ""}`;
}

/**
 * Get or create the HaloPSA client (lazy initialization).
 * Uses the current request's credentials (AsyncLocalStorage) or env vars.
 */
export async function getClient(): Promise<HaloPsaClient> {
  const creds = getCredentials();

  if (!creds) {
    throw new Error(
      "No API credentials provided. Please configure HALOPSA_CLIENT_ID, HALOPSA_CLIENT_SECRET, and either HALOPSA_TENANT or HALOPSA_BASE_URL environment variables."
    );
  }

  const key = credentialKey(creds);
  let client = clientCache.get(key);

  if (!client) {
    const { HaloPsaClient } = await import("@wyre-technology/node-halopsa");
    client = new HaloPsaClient({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      tenant: creds.tenant,
      baseUrl: creds.baseUrl,
    });
    clientCache.set(key, client);
  }

  return client;
}

/**
 * Clear all cached clients (useful for testing)
 */
export function clearClient(): void {
  clientCache.clear();
}
