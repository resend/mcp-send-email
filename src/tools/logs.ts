import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addLogTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'list-logs',
    {
      title: 'List Logs',
      description: `**Purpose:** List API request logs for the account. Use to review recent API activity, debug issues, or audit API usage.

**Returns:** For each log: id, created_at, endpoint, method, response_status, user_agent. Use pagination (limit, after/before) for large lists.

**When to use:**
- User wants to see recent API activity
- Debugging API issues or checking request history
- User says "show my logs", "what API calls were made?", "check recent requests"`,
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of logs to retrieve. Default: 20, Max: 100, Min: 1',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Log ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Log ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
      },
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.logs.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list logs: ${JSON.stringify(response.error)}`,
        );
      }

      const logs = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (logs.length === 0) {
        return {
          content: [{ type: 'text', text: 'No logs found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${logs.length} log${logs.length === 1 ? '' : 's'}:`,
          },
          ...logs.map(
            ({
              id,
              created_at,
              endpoint,
              method,
              response_status,
              user_agent,
            }) => ({
              type: 'text' as const,
              text: `ID: ${id}\nEndpoint: ${method} ${endpoint}\nStatus: ${response_status}\nUser Agent: ${user_agent}\nCreated at: ${created_at}`,
            }),
          ),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more logs available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'get-log',
    {
      title: 'Get Log',
      description: `**Purpose:** Get detailed information about a specific API request log, including the full request and response bodies.

**Returns:** Log details: id, created_at, endpoint, method, response_status, user_agent, request_body, response_body.

**When to use:**
- User wants to inspect a specific API request
- Debugging a particular API call
- User says "show me that log", "what was in that request?"`,
      inputSchema: {
        logId: z.string().nonempty().describe('The Log ID to retrieve'),
      },
    },
    async ({ logId }) => {
      const response = await resend.logs.get(logId);

      if (response.error) {
        throw new Error(`Failed to get log: ${JSON.stringify(response.error)}`);
      }

      const log = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `ID: ${log.id}\nEndpoint: ${log.method} ${log.endpoint}\nStatus: ${log.response_status}\nUser Agent: ${log.user_agent}\nCreated at: ${log.created_at}`,
          },
          {
            type: 'text',
            text: `Request Body:\n${JSON.stringify(log.request_body, null, 2)}`,
          },
          {
            type: 'text',
            text: `Response Body:\n${JSON.stringify(log.response_body, null, 2)}`,
          },
        ],
      };
    },
  );
}
