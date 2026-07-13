/**
 * Tests for credential resolution on the gateway / Workers transports.
 *
 * `buildCredentials` is the shared ingress for both the gateway header path
 * (`resolveGatewayCredentials`) and the Workers env path, so testing it directly
 * covers every non-stdio credential source.
 */

import { describe, it, expect } from "vitest";
import { buildCredentials } from "../mcp-server.js";

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
