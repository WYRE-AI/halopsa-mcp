/**
 * Tests for credential resolution on the gateway / Workers transports.
 *
 * `buildCredentials` is the shared ingress for both the gateway header path
 * (`resolveGatewayCredentials`) and the Workers env path, so testing it directly
 * covers every non-stdio credential source.
 */

import { describe, it, expect } from "vitest";
import { buildCredentials, buildStatusToolResult } from "../mcp-server.js";

describe("buildCredentials", () => {
  it("returns an error when the client id or secret is missing", () => {
    expect(buildCredentials(undefined, "secret", "acme", undefined).error).toMatch(
      /Missing credentials/
    );
    expect(buildCredentials("id", undefined, "acme", undefined).error).toMatch(
      /Missing credentials/
    );
  });

  it("returns creds when a valid tenant is provided", () => {
    const { creds, error } = buildCredentials("id", "secret", "acme", undefined);
    expect(error).toBeUndefined();
    expect(creds).toEqual({
      clientId: "id",
      clientSecret: "secret",
      tenant: "acme",
      baseUrl: undefined,
    });
  });

  // Regression: issue #73. A blank optional Base URL field arrives as the literal
  // "${user_config.halopsa_base_url}". It must be dropped so the truthy placeholder
  // does not defeat the `!tenant && !baseUrl` guard and reach the SDK.
  it("drops an unresolved base URL placeholder and keeps the tenant", () => {
    const { creds, error } = buildCredentials(
      "id",
      "secret",
      "acme",
      "${user_config.halopsa_base_url}"
    );
    expect(error).toBeUndefined();
    expect(creds).toEqual({
      clientId: "id",
      clientSecret: "secret",
      tenant: "acme",
      baseUrl: undefined,
    });
  });

  it("drops an unresolved tenant placeholder and keeps the base URL", () => {
    const { creds, error } = buildCredentials(
      "id",
      "secret",
      "${user_config.halopsa_tenant}",
      "https://api.halopsa.com"
    );
    expect(error).toBeUndefined();
    expect(creds).toEqual({
      clientId: "id",
      clientSecret: "secret",
      tenant: undefined,
      baseUrl: "https://api.halopsa.com",
    });
  });

  it("errors when both tenant and base URL are unresolved placeholders", () => {
    const { creds, error } = buildCredentials(
      "id",
      "secret",
      "${user_config.halopsa_tenant}",
      "${user_config.halopsa_base_url}"
    );
    expect(creds).toBeUndefined();
    expect(error).toMatch(/Missing tenant/);
  });
});

describe("buildStatusToolResult", () => {
  it("fails when credentials are missing — not a green skip", () => {
    const result = buildStatusToolResult({ configured: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/NOT CONFIGURED/);
    expect(result.content[0].text).toMatch(/Token mint: skipped/);
  });

  it("fails when token mint fails — presence is not credentials OK", () => {
    const result = buildStatusToolResult({
      configured: true,
      healthy: false,
      target: "wyretechnology",
      error: "AUTH_FAILED: HaloPSA token mint failed HTTP 500.",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Token mint: FAILED/);
    expect(result.content[0].text).toMatch(/AUTH_FAILED/);
    expect(result.content[0].text).not.toMatch(/credentials OK/i);
    expect(result.content[0].text).not.toMatch(/Credentials: Configured/);
  });

  it("reports token mint OK only after a successful probe", () => {
    const result = buildStatusToolResult({
      configured: true,
      healthy: true,
      target: "wyretechnology",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Token mint: OK/);
    expect(result.content[0].text).toMatch(/wyretechnology/);
  });
});
