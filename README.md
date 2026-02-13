# HaloPSA MCP Server

A Model Context Protocol (MCP) server for interacting with HaloPSA, featuring a decision tree architecture for efficient tool loading.

## One-Click Deployment

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/wyre-technology/halopsa-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wyre-technology/halopsa-mcp)

## Architecture

This MCP server uses a **hierarchical tool loading approach** instead of exposing all tools upfront:

1. **Navigation Phase**: Initially exposes only a navigation tool (`halopsa_navigate`)
2. **Domain Selection**: User selects a domain (tickets, clients, assets, agents, invoices)
3. **Domain Tools**: Server exposes domain-specific tools after selection
4. **Lazy Loading**: Domain handlers and the HaloPSA client are loaded on-demand

This architecture provides:
- Reduced cognitive load (fewer tools to choose from)
- Faster initial load times
- Better organization of related operations
- Clear navigation state

## Installation

```bash
npm install @wyre-technology/halopsa-mcp
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `HALOPSA_CLIENT_ID` | Yes | OAuth 2.0 Client ID |
| `HALOPSA_CLIENT_SECRET` | Yes | OAuth 2.0 Client Secret |
| `HALOPSA_TENANT` | One of | Tenant name (e.g., `yourcompany`) |
| `HALOPSA_BASE_URL` | these | Explicit base URL (e.g., `https://yourcompany.halopsa.com`) |

## Usage

### Running Standalone

```bash
# Set credentials
export HALOPSA_CLIENT_ID="your-client-id"
export HALOPSA_CLIENT_SECRET="your-client-secret"
export HALOPSA_TENANT="yourcompany"

# Run the server
npx @wyre-technology/halopsa-mcp
```

### Claude Desktop Configuration

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "halopsa": {
      "command": "npx",
      "args": ["@wyre-technology/halopsa-mcp"],
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

```bash
docker build -t halopsa-mcp .
docker run -e HALOPSA_CLIENT_ID=xxx -e HALOPSA_CLIENT_SECRET=xxx -e HALOPSA_TENANT=yourcompany halopsa-mcp
```

## Available Domains

### Tickets
Manage support tickets, create new tickets, update status, add actions/notes.

Tools:
- `halopsa_tickets_list` - List tickets with filters
- `halopsa_tickets_get` - Get ticket details
- `halopsa_tickets_create` - Create a new ticket
- `halopsa_tickets_update` - Update an existing ticket
- `halopsa_tickets_add_action` - Add a note/action to a ticket

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
