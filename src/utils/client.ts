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

// An unresolved MCPB/DXT manifest placeholder, e.g. "${user_config.halopsa_base_url}".
// Desktop hosts inject the config template verbatim when its optional user_config
// field is left blank, so the literal string arrives in the env var / header.
const CONFIG_PLACEHOLDER = /^\$\{.*\}$/;

/**
 * Normalise a single credential value read from an env var or gateway header.
 *
 * Returns `undefined` for values that are effectively absent, so the auth layer
 * treats them as "no value" rather than a real setting:
 *   - undefined / empty / whitespace-only
 *   - an unresolved manifest placeholder like `${user_config.halopsa_base_url}`
 *
 * Root cause of issue #73: leaving the optional Base URL field blank left the
 * literal `${user_config.halopsa_base_url}` in HALOPSA_BASE_URL. That string is
 * truthy, so the `!tenant && !baseUrl` guard was defeated and the placeholder was
 * passed to the SDK, which took the baseUrl branch and threw on
 * `new URL("${user_config.halopsa_base_url}")` — breaking even a correct
 * tenant-only setup. Stripping the placeholder here lets the tenant path resolve.
 */
export function cleanCredential(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || CONFIG_PLACEHOLDER.test(trimmed)) return undefined;
  return trimmed;
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

  // Fall back to environment variables. tenant/baseUrl are cleaned so an
  // unresolved MCPB placeholder from a blank optional field is treated as absent.
  const clientId = process.env.HALOPSA_CLIENT_ID;
  const clientSecret = process.env.HALOPSA_CLIENT_SECRET;
  const tenant = cleanCredential(process.env.HALOPSA_TENANT);
  const baseUrl = cleanCredential(process.env.HALOPSA_BASE_URL);

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
 *
 * Bounded LRU: in gateway mode a new key can appear per distinct
 * tenant/credential set seen over the process lifetime, so the cache is
 * capped at MAX_CLIENT_CACHE_SIZE and evicts the least-recently-used entry
 * on overflow rather than growing without limit.
 */
const MAX_CLIENT_CACHE_SIZE = 500;
const clientCache = new Map<string, HaloPsaClient>();

function credentialKey(creds: HaloPsaCredentials): string {
  return `${creds.clientId}:${creds.tenant ?? ""}:${creds.baseUrl ?? ""}`;
}

/**
 * Touch a cache entry, bumping it to most-recently-used by re-inserting it
 * (Map iteration/insertion order puts it last).
 */
function touchCacheEntry(key: string, client: HaloPsaClient): void {
  clientCache.delete(key);
  clientCache.set(key, client);
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

  if (client) {
    touchCacheEntry(key, client);
    return client;
  }

  const { HaloPsaClient } = await import("@wyre-technology/node-halopsa");
  client = new HaloPsaClient({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    tenant: creds.tenant,
    baseUrl: creds.baseUrl,
  });

  if (clientCache.size >= MAX_CLIENT_CACHE_SIZE) {
    // Map preserves insertion order, so the first key is the
    // least-recently-used entry.
    const oldestKey = clientCache.keys().next().value;
    if (oldestKey !== undefined) clientCache.delete(oldestKey);
  }
  clientCache.set(key, client);

  return client;
}

/**
 * Clear all cached clients (useful for testing)
 */
export function clearClient(): void {
  clientCache.clear();
}
