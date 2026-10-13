# HaloPSA MCP Server

A Model Context Protocol (MCP) server for interacting with HaloPSA, featuring a decision tree architecture for efficient tool loading.

## One-Click Deployment

> [!IMPORTANT]
> **Before you click:** this server depends on `@wyre-technology/node-halopsa`,
> which is hosted on the **GitHub Packages** npm registry. GitHub Packages has no
> anonymous access — even though the package is public, every `npm install` needs a
> token. The cloud builder runs `npm install` for you, so you must give it one, or
> the build fails with `npm error 401 Unauthorized ... npm.pkg.github.com`.
>
> 1. Create a GitHub **Personal Access Token** with the `read:packages` scope
>    ([classic token](https://github.com/settings/tokens/new?scopes=read:packages&description=halopsa-mcp%20deploy)).
>    Any GitHub account works — you do **not** need to be a member of the
>    `wyre-technology` org to read its public packages.
> 2. Add it as a build variable when prompted by the deploy flow:
>    - **Cloudflare Workers** → set a build variable named **`NODE_AUTH_TOKEN`** to your PAT
>      (Workers → Settings → Build → Variables and Secrets).
>    - **DigitalOcean App Platform** → set an encrypted env var named **`GITHUB_TOKEN`**
>      with scope **Build Time** to your PAT (the `.do/app.yaml` already declares it).

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/WYRE-AI/halopsa-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WYRE-AI/halopsa-mcp)

> [!NOTE]
> The DigitalOcean target builds the full Docker image and runs the complete MCP
> server over HTTP — this is the recommended path for operators. The Cloudflare
> Workers target is currently a thin entrypoint (the `/mcp` route returns 501 until
> the Workers transport adapter lands) and is best suited to gateway-style
> deployments; for a full self-hosted server prefer DigitalOcean or the prebuilt
> container image (`ghcr.io/wyre-ai/halopsa-mcp`).

## Architecture

This MCP server uses a **hierarchical tool loading approach** instead of exposing all tools upfront:

1. **Navigation Phase**: Initially exposes only a navigation tool (`halopsa_navigate`)
2. **Domain Selection**: User selects a domain (tickets, clients, assets, agents, invoices, categories)
3. **Domain Tools**: Server exposes domain-specific tools after selection
4. **Lazy Loading**: Domain handlers and the HaloPSA client are loaded on-demand

This architecture provides:
- Reduced cognitive load (fewer tools to choose from)
- Faster initial load times
- Better organization of related operations
- Clear navigation state

### Interactive Ticket Card (MCP Apps)

`halopsa_tickets_get` renders as an interactive card in MCP Apps hosts
(Claude Desktop/web) with an in-card "Add note" round-trip via
`halopsa_tickets_add_action`; plain-JSON behavior is unchanged in other hosts.
The card is neutral by default and brandable via `window.__BRAND__` injection
or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`,
`MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`,
`MCP_BRAND_TEXT`) — no rebuild needed.

## Installation

This package is published to the **GitHub Packages** npm registry, which requires a
token even for public packages. Authenticate once, then install:

```bash
# Authenticate npm to GitHub Packages (token needs the read:packages scope)
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages

npm install @wyre-ai/halopsa-mcp
```

The repo's `.npmrc` already points the `@wyre-technology` scope at GitHub Packages and
reads the token from `NODE_AUTH_TOKEN`, so no further config is needed.

## Configuration

Copy [`.env.example`](.env.example) and set the variables below.

| Variable | Required | Description |
|----------|----------|-------------|
| `HALOPSA_CLIENT_ID` | For stdio and `AUTH_MODE=env` | OAuth 2.0 Client ID |
| `HALOPSA_CLIENT_SECRET` | For stdio and `AUTH_MODE=env` | OAuth 2.0 Client Secret |
| `HALOPSA_TENANT` | One of tenant or base URL | Tenant name (e.g., `yourcompany`) |
| `HALOPSA_BASE_URL` | One of tenant or base URL | Explicit base URL (e.g., `https://yourcompany.halopsa.com`) |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose default) or `env`. Gateway mode requires `X-Halo-Client-ID`, `X-Halo-Client-Secret`, and `X-Halo-Tenant` or `X-Halo-Base-URL` on each `/mcp` request and never falls back to `HALOPSA_*`. `env` uses those variables only after S2S auth succeeds. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `your-s2s-secret`, `placeholder`, `secret`, `replace-me`, `replace-with-a-real-secret`, and the other example values). Compose will not start without it. Never commit a real value. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning and does not enforce `X-Gateway-S2S`. The listener is forced to `127.0.0.1`. A non-loopback `MCP_HTTP_HOST` (including `0.0.0.0`) is overridden and that override is logged. A placeholder secret is still rejected. |
| `MCP_HTTP_HOST` | No | Bind address when a real `CONDUIT_S2S_SECRET` is set. Unset keeps `0.0.0.0`. The container image and Compose set `0.0.0.0` inside the container. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |

`/health` stays unauthenticated and does not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The value is `t=<unix seconds>,v1=<hex hmac-sha256>`, where the HMAC-SHA256 is computed over the ASCII string `t=<unix seconds>` using `CONDUIT_S2S_SECRET` as the key. A missing or invalid header returns 401. The secret is never written to logs.

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Halo-Client-ID` and `X-Halo-Client-Secret`, plus `X-Halo-Tenant` or `X-Halo-Base-URL`. Those headers are the only credential source for that request. Missing credential headers return 401 and do not fall back to `HALOPSA_*`.

## Usage

### Running Standalone

```bash
# Set credentials
export HALOPSA_CLIENT_ID="your-client-id"
export HALOPSA_CLIENT_SECRET="your-client-secret"
export HALOPSA_TENANT="yourcompany"

# Run the server
npx @wyre-ai/halopsa-mcp
```

### Claude Desktop Configuration

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "halopsa": {
      "command": "npx",
      "args": ["@wyre-ai/halopsa-mcp"],
      "env": {
        "HALOPSA_CLIENT_ID": "your-client-id",
        "HALOPSA_CLIENT_SECRET": "your-client-secret",
        "HALOPSA_TENANT": "yourcompany"
      }
    }
  }
}
```

### Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass the S2S secret. In gateway mode, HaloPSA credentials arrive on each request as headers; they are not read from the environment.

```bash
docker build -t halopsa-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  halopsa-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset, sets `AUTH_MODE=gateway`, does not inject `HALOPSA_*` credentials, and publishes `127.0.0.1:8080:8080`:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `HALOPSA_CLIENT_ID`, `HALOPSA_CLIENT_SECRET`, and `HALOPSA_TENANT`:

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e HALOPSA_CLIENT_ID=your-client-id \
  -e HALOPSA_CLIENT_SECRET=your-client-secret \
  -e HALOPSA_TENANT=yourcompany \
  -p 127.0.0.1:8080:8080 \
  halopsa-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` and logs a warning. A non-loopback `MCP_HTTP_HOST` is overridden to `127.0.0.1` and that override is logged:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm start
```

## Available Domains

### Tickets
Manage support tickets, create new tickets, update status, add actions/notes.

Tools:
- `halopsa_tickets_list` - List tickets with filters (`category_1` only; `category_2`–`category_4` are rejected)
- `halopsa_tickets_get` - Get ticket details
- `halopsa_tickets_create` - Create a new ticket (optional `category_1`–`category_4`)
- `halopsa_tickets_update` - Update an existing ticket (optional `category_1`–`category_4`)
- `halopsa_tickets_add_action` - Add a note/action to a ticket

### Categories
Look up Halo ticket categories so triage can assign `category_1`–`category_4` (the category name, matched to its level).

Tools:
- `halopsa_categories_list` - List one page of ticket categories (`limit` defaults to 50; `page_no` starts at 1)
- `halopsa_categories_get` - Get a category by ID

### Clients
Manage companies/clients in HaloPSA.

Tools:
- `halopsa_clients_list` - List clients
- `halopsa_clients_get` - Get client details
- `halopsa_clients_create` - Create a new client
- `halopsa_clients_search` - Search clients by name

### Assets
Manage configuration items/assets.

Tools:
- `halopsa_assets_list` - List assets with filters
- `halopsa_assets_get` - Get asset details
- `halopsa_assets_search` - Search assets
- `halopsa_assets_list_types` - List available asset types

### Agents
View technicians and teams.

Tools:
- `halopsa_agents_list` - List agents/technicians
- `halopsa_agents_get` - Get agent details
- `halopsa_teams_list` - List teams

### Invoices
View billing and invoices.

Tools:
- `halopsa_invoices_list` - List invoices with filters
- `halopsa_invoices_get` - Get invoice details

## Navigation Tools

Always available:
- `halopsa_navigate` - Select a domain to work with
- `halopsa_status` - Show current state and credential status
- `halopsa_back` - Return to main menu (when in a domain)

## Example Workflow

```
User: Check my tickets
Claude: [calls halopsa_navigate with domain="tickets"]
       -> Navigated to tickets domain. Available tools: ...

User: List open tickets
Claude: [calls halopsa_tickets_list with open_only=true]
       -> [ticket list results]

User: Now show me clients
Claude: [calls halopsa_back]
       -> Navigated back to main menu.
       [calls halopsa_navigate with domain="clients"]
       -> Navigated to clients domain.
```

## Rate Limiting

HaloPSA has a rate limit of 500 requests per 3-minute window. The underlying `@asachs01/node-halopsa` client handles this automatically with request throttling.

## License

Apache-2.0
