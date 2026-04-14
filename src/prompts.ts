// MCP Prompt Handlers for HaloPSA MCP Server
// Exposes pre-baked prompt templates via ListPrompts and GetPrompt handlers

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export function registerPromptHandlers(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'queue-triage',
        description: 'Review and prioritize the current HaloPSA ticket queue',
        arguments: [
          {
            name: 'team_name',
            description: 'Filter to a specific team (optional)',
            required: false,
          },
        ],
      },
      {
        name: 'sla-breach-alert',
        description: 'Find tickets that are about to breach their SLA',
        arguments: [
          {
            name: 'hours_ahead',
            description: 'How many hours ahead to look for upcoming SLA breaches (optional, default 4)',
            required: false,
          },
        ],
      },
      {
        name: 'client-ticket-summary',
        description: "Summarize a client's recent ticket history",
        arguments: [
          {
            name: 'client_name',
            description: 'The client to summarize tickets for',
            required: true,
          },
          {
            name: 'days',
            description: 'Number of days of history to include (optional, default 30)',
            required: false,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'queue-triage':
        return {
          description: 'Review and prioritize the current ticket queue',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Review and prioritize the current HaloPSA ticket queue${args?.team_name ? ` for the ${args.team_name} team` : ''}.`,
                  '',
                  'Use the available HaloPSA tools to:',
                  '1. Navigate to the tickets domain and list all open/active tickets,',
                  '2. Group tickets by priority (critical, high, medium, low),',
                  '3. Within each priority group, sort by age (oldest first),',
                  '4. Flag any tickets that are unassigned,',
                  '5. Flag any tickets that have not been updated in more than 8 business hours,',
                  '6. Recommend the top 5 tickets to action immediately.',
                  '',
                  'Present as a triage dashboard: summary counts, then prioritized action list.',
                ].join('\n'),
              },
            },
          ],
        };

      case 'sla-breach-alert': {
        const hoursAhead = args?.hours_ahead ?? '4';
        return {
          description: 'Find tickets approaching SLA breach',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Identify all HaloPSA tickets that will breach their SLA within the next ${hoursAhead} hours.`,
                  '',
                  'Use the available HaloPSA tools to:',
                  '1. Navigate to the tickets domain and retrieve open tickets with SLA due dates,',
                  `2. Filter to those due within the next ${hoursAhead} hours,`,
                  '3. For each at-risk ticket, show: ticket ID, title, client, assigned agent, time remaining,',
                  '4. Also list any tickets that have already breached SLA but are still open.',
                  '',
                  'Present as an urgent alert list, ordered by time remaining (most urgent first).',
                  'Include a count of already-breached tickets at the top.',
                ].join('\n'),
              },
            },
          ],
        };
      }

      case 'client-ticket-summary': {
        const days = args?.days ?? '30';
        return {
          description: "Summary of a client's recent ticket history",
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Summarize the recent ticket history for ${args?.client_name} over the last ${days} days.`,
                  '',
                  'Use the available HaloPSA tools to:',
                  '1. Navigate to the clients domain to find and confirm the client,',
                  '2. Navigate to the tickets domain and retrieve tickets for this client in that period,',
                  '3. Provide: total tickets opened, resolved, and still open,',
                  '4. Break down by priority and category/type,',
                  '5. Calculate average resolution time for closed tickets,',
                  '6. List the top 3 most common issue categories,',
                  '7. Note any recurring issues or problem areas.',
                  '',
                  'Format as a client-facing summary suitable for a monthly review meeting.',
                ].join('\n'),
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });
}
