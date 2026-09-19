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
import type { HaloPsaClient } from "@wyre-ai/node-halopsa";

export interface HaloPsaCredentials {
  clientId: string;
  clientSecret: string;
  tenant?: string;
  baseUrl?: string;
}

/**
 * Outcome of probing whether configured credentials can actually mint a token.
 *
 * `halopsa_status` used to report "Configured" from credential *presence*
 * alone, which is how WYREAI-370 looked green while every data tool returned
 * `Failed to acquire token: 500`.
 */
export type AuthProbeResult =
  | { configured: false }
  | {
      configured: true;
      healthy: boolean;
      target: string;
      error?: string;
      warning?: string;
    };

// An unresolved MCPB/DXT manifest placeholder, e.g. "${user_config.halopsa_base_url}".
// Desktop hosts inject the config template verbatim when its optional user_config
// field is left blank, so the literal string arrives in the env var / header.
const CONFIG_PLACEHOLDER = /^\$\{.*\}$/;

/**
 * Hosted Halo domains a tenant subdomain may be paired with.
 * Kept in lockstep with `@wyre-ai/node-halopsa` `HALO_HOSTED_DOMAINS` so we
 * can derive the OAuth `tenant` parameter from `https://{tenant}.halopsa.com`
 * when the operator supplied only a base URL.
 */
const HALO_HOSTED_DOMAINS = [
  "halopsa.com",
  "haloitsm.com",
  "haloservicedesk.com",
  "nethelpdesk.com",
];

const TOKEN_MINT_FAILED = /failed to acquire token/i;
const MAX_UPSTREAM_BODY_CHARS = 400;

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
 * Hosted Halo requires a `tenant` parameter on the client-credentials token
 * request (`POST /auth/token?tenant=…`, also accepted in the form body).
 *
 * `@wyre-ai/node-halopsa` only sends that parameter when `tenantId` is set.
 * This connector historically passed `tenant` solely to build
 * `https://{tenant}.halopsa.com` and never set `tenantId`, so hosted token
 * mints went out without the OAuth tenant selector.
 *
 * Returns the bare hosted subdomain when we can derive one, otherwise
 * undefined (custom-domain / on-prem instances omit the param).
 */
export function resolveOAuthTenantId(
  creds: Pick<HaloPsaCredentials, "tenant" | "baseUrl">
): string | undefined {
  if (creds.tenant) {
    return hostedTenantLabel(creds.tenant) ?? creds.tenant.trim();
  }
  if (creds.baseUrl) {
    try {
      return tenantFromHost(new URL(creds.baseUrl).hostname);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Extract a hosted Halo tenant label from a bare label or hosted URL. */
function hostedTenantLabel(tenant: string): string | undefined {
  const host = tenant.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!host.includes(".")) return host;
  return tenantFromHost(host);
}

/** Derive the tenant subdomain from a recognized Halo-hosted hostname. */
function tenantFromHost(host: string): string | undefined {
  const hostname = host.toLowerCase();
  const domain = HALO_HOSTED_DOMAINS.find(
    (d) => hostname === d || hostname.endsWith(`.${d}`)
  );
  if (!domain || hostname === domain) return undefined;
  return hostname.slice(0, -(domain.length + 1));
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

  const { HaloPsaClient } = await import("@wyre-ai/node-halopsa");
  const tenantId = resolveOAuthTenantId(creds);
  client = new HaloPsaClient({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    tenant: creds.tenant,
    baseUrl: creds.baseUrl,
    ...(tenantId ? { tenantId } : {}),
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
 * True when the thrown error is the SDK failing to mint an OAuth token,
 * including Halo's documented-odd 500 HTML page on unknown client ids.
 *
 * Duck-typed: `instanceof HaloPsaAuthenticationError` is unreliable across
 * the dynamic `import("@wyre-ai/node-halopsa")` used by `getClient()`.
 */
export function isTokenMintFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "HaloPsaAuthenticationError") return true;
  return TOKEN_MINT_FAILED.test(error.message);
}

/** Read a positive numeric HTTP status code from an SDK error-like value. */
function errorStatusCode(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" && status > 0 ? status : undefined;
}

/** Read the upstream response payload from an SDK error-like value. */
function errorResponse(error: unknown): unknown {
  return (error as { response?: unknown } | null)?.response;
}

/**
 * Collapse an upstream token-endpoint body into a short, secret-free snippet.
 * Halo's 500 path returns a ~280KB HTML error page whose visible text is
 * "Sorry, something went wrong" — that one line is the diagnosis, not the
 * markup.
 */
export function summarizeErrorBody(raw: unknown): string | undefined {
  if (raw == null) return undefined;

  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else {
    try {
      text = JSON.stringify(raw);
    } catch {
      return undefined;
    }
  }

  const trimmed = text.trim();
  if (!trimmed) return undefined;

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    const stripped = trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    text = stripped || "HTML error page (no JSON error body)";
  } else {
    text = trimmed;
  }

  if (text.length > MAX_UPSTREAM_BODY_CHARS) {
    return `${text.slice(0, MAX_UPSTREAM_BODY_CHARS)}…`;
  }
  return text;
}

/**
 * Render a thrown error as the text a tool call (or status probe) reports.
 *
 * Token-mint failures become a typed `AUTH_FAILED` block with the HTTP status
 * and upstream body. The SDK used to surface only
 * `Failed to acquire token: 500`, hiding Halo's HTML "Sorry, something went
 * wrong" page on `.response`.
 */
export function formatToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const body = summarizeErrorBody(errorResponse(error));
  const statusCode = errorStatusCode(error);

  if (isTokenMintFailure(error)) {
    const statusPart = statusCode ? ` HTTP ${statusCode}` : "";
    const parts = [
      `AUTH_FAILED: HaloPSA token mint failed${statusPart}.`,
      message.trim(),
    ];
    if (body && !message.includes(body)) {
      parts.push(`Upstream: ${body}`);
    }
    if (statusCode === 500) {
      parts.push(
        "Halo often returns HTTP 500 HTML (not 401 JSON) for an unknown client id, a client-credentials application with no login agent, or a hosted tenant missing the OAuth tenant parameter."
      );
    }
    return parts.join("\n");
  }

  const parts = [`Error: ${message}`];
  if (body && !message.includes(body)) {
    parts.push(body);
  }
  return parts.join("\n");
}

/**
 * Verify configured credentials can mint a token by making one cheap
 * authenticated call. Token acquisition is lazy inside the SDK, so constructing
 * `HaloPsaClient` is not enough — `halopsa_status` must actually hit `/auth/token`.
 */
export async function probeHaloAuth(): Promise<AuthProbeResult> {
  const creds = getCredentials();
  if (!creds) {
    return { configured: false };
  }

  const target = creds.tenant || creds.baseUrl || "unknown";

  try {
    const client = await getClient();
    await client.clients.list({ pageSize: 1, pageNo: 1 });
    return { configured: true, healthy: true, target };
  } catch (error) {
    if (isTokenMintFailure(error)) {
      return {
        configured: true,
        healthy: false,
        target,
        error: formatToolError(error),
      };
    }
    // Token mint succeeded (or was not the failure). Do not call credentials OK
    // on a later API error, but do not treat it as a mint failure either.
    return {
      configured: true,
      healthy: true,
      target,
      warning: formatToolError(error),
    };
  }
}

/**
 * Clear all cached clients (useful for testing)
 */
export function clearClient(): void {
  clientCache.clear();
}
