/**
 * Version reported as MCP serverInfo.version.
 *
 * The release image is tagged and labeled with the release version
 * (org.opencontainers.image.version). That same value is passed in as the
 * Docker build-arg VERSION and stored in MCP_SERVER_VERSION. Without this,
 * serverInfo stayed hardcoded at 1.0.0 while the image label was 1.7.x.
 *
 * The bundled constant is the Worker (and any other) fallback. That runtime
 * has no package.json on disk, so reading the file there returned 0.0.0.
 * A test keeps the constant equal to package.json.
 */

/**
 * package.json "version". The release pipeline does not commit its bump, so
 * this can lag the image tag. MCP_SERVER_VERSION wins when the image sets it.
 */
const BUNDLED_PACKAGE_VERSION = "1.2.2";

/**
 * Resolve the version reported on the MCP handshake.
 *
 * Precedence is the image stamp (`MCP_SERVER_VERSION`), then the bundled
 * package version. The bundled value is what the Worker reports.
 *
 * @returns The stamped version, the bundled package version, or `0.0.0`
 *   if the bundle constant is empty.
 */
export function mcpServerVersion(): string {
  const stamped = process.env.MCP_SERVER_VERSION?.trim();
  if (stamped) return stamped;
  const bundled = BUNDLED_PACKAGE_VERSION.trim();
  if (bundled) return bundled;
  return "0.0.0";
}
