/**
 * serverInfo.version must match the image label when the release stamps
 * MCP_SERVER_VERSION, and must not stay hardcoded at 1.0.0 otherwise.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mcpServerVersion } from "../server-version.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("mcpServerVersion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the image stamp when MCP_SERVER_VERSION is set", () => {
    vi.stubEnv("MCP_SERVER_VERSION", "1.7.9");
    expect(mcpServerVersion()).toBe("1.7.9");
  });

  it("uses the bundled package version when the image stamp is blank", () => {
    vi.stubEnv("MCP_SERVER_VERSION", "   ");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      version: string;
    };
    expect(mcpServerVersion()).toBe(pkg.version);
    expect(mcpServerVersion()).not.toBe("1.0.0");
    expect(mcpServerVersion()).not.toBe("0.0.0");
  });

  it("is wired from the Docker VERSION build-arg", () => {
    const dockerfile = readFileSync(resolve(root, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("ARG VERSION");
    expect(dockerfile).toContain("ENV MCP_SERVER_VERSION=${VERSION}");
  });
});
