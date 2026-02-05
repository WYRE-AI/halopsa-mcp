/**
 * Agents domain handler
 *
 * Provides tools for agent (technician/user) operations in HaloPSA.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";

/**
 * Get agent domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "halopsa_agents_list",
      description: "List agents (technicians) in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          team_id: {
            type: "number",
            description: "Filter agents by team ID",
          },
          inactive: {
            type: "boolean",
            description: "Include inactive agents",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "halopsa_agents_get",
      description: "Get details for a specific agent by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          agent_id: {
            type: "number",
            description: "The agent ID",
          },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "halopsa_teams_list",
      description: "List teams in HaloPSA",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
  ];
}

/**
 * Handle an agent domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "halopsa_agents_list": {
      const limit = (args.limit as number) || 50;
      const response = await client.agents.list({
        team_id: args.team_id as number | undefined,
        inactive: args.inactive as boolean | undefined,
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                agents: response.agents,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "halopsa_agents_get": {
      const agentId = args.agent_id as number;
      const agent = await client.agents.get(agentId);

      return {
        content: [{ type: "text", text: JSON.stringify(agent, null, 2) }],
      };
    }

    case "halopsa_teams_list": {
      const limit = (args.limit as number) || 50;
      const response = await client.teams.list({
        pageSize: limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                record_count: response.record_count,
                teams: response.teams,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown agent tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const agentsHandler: DomainHandler = {
  getTools,
  handleCall,
};
