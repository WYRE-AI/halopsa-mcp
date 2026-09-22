/**
 * Version reported as MCP serverInfo.version.
 *
 * The release image is tagged and labeled with the release version
 * (org.opencontainers.image.version). That same value is passed in as the
 * Docker build-arg VERSION and stored in MCP_SERVER_VERSION. Without this,
 * serverInfo stayed hardcoded at 1.0.0 while the image label was 1.7.x.
 *
 * package.json is the fallback for local and unpackaged runs. The release
 * pipeline does not commit the version bump, so package.json can lag the
 * image tag; the env stamp is what matches the label customers see.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function packageVersion(): string | undefined {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    if (typeof version === "string" && version.trim()) return version.trim();
  } catch {
    // Workers and other bundles have no package.json beside the module.
  }
  return undefined;
}

export function mcpServerVersion(): string {
  const stamped = process.env.MCP_SERVER_VERSION?.trim();
  if (stamped) return stamped;
  return packageVersion() ?? "0.0.0";
}
