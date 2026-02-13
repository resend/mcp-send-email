import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addApiKeyTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-api-key',
    {
      title: 'Create API Key',
      description:
        'Create a new API key in Resend. The token is only shown once upon creation, so you MUST display it to the user.',
      inputSchema: {
        name: z
          .string()
          .nonempty()
          .max(50)
          .describe('API key name (max 50 characters)'),
        permission: z
          .enum(['full_access', 'sending_access'])
          .optional()
          .describe(
            'Access level. "full_access" grants complete resource management. "sending_access" restricts to email delivery only.',
          ),
        domainId: z
          .string()
          .optional()
          .describe(
            'Restrict API key to send emails from a specific domain. Only applicable when permission is "sending_access".',
          ),
      },
    },
    async ({ name, permission, domainId }) => {
      console.error(`Debug - Creating API key with name: ${name}`);

      const response = await resend.apiKeys.create({
        name,
        ...(permission && { permission }),
        ...(domainId && { domain_id: domainId }),
      });

      if (response.error) {
        throw new Error(
          `Failed to create API key: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'API key created successfully.' },
          {
            type: 'text',
            text: `Name: ${name}\nID: ${created.id}\nToken: ${created.token}`,
          },
          {
            type: 'text',
            text: 'IMPORTANT: The token above is only shown once. You MUST display it to the user so they can save it.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'list-api-keys',
    {
      title: 'List API Keys',
      description:
        "List all API keys from Resend. Returns API key names, IDs, and creation dates. Don't bother telling the user the IDs or creation dates unless they ask for them.",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of API keys to retrieve. Max: 100, Min: 1'),
        after: z
          .string()
          .optional()
          .describe(
            'API key ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'API key ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
      },
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing API keys with limit: ${limit}, after: ${after}, before: ${before}`,
      );

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.apiKeys.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list API keys: ${JSON.stringify(response.error)}`,
        );
      }

      const apiKeys = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (apiKeys.length === 0) {
        return {
          content: [{ type: 'text', text: 'No API keys found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${apiKeys.length} API key${apiKeys.length === 1 ? '' : 's'}:`,
          },
          ...apiKeys.map(({ name, id, created_at }) => ({
            type: 'text' as const,
            text: `Name: ${name}\nID: ${id}\nCreated at: ${created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: `There are more API keys available. Use the "after" parameter with the last ID to retrieve more.`,
                },
              ]
            : []),
          {
            type: 'text' as const,
            text: "Don't bother telling the user the IDs or creation dates unless they ask for them.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-api-key',
    {
      title: 'Remove API Key',
      description:
        'Remove an API key by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this API key. Reference the NAME of the API key when double-checking, and warn the user that removing an API key is irreversible and any services using it will lose access. You may only use this tool if the user explicitly confirms they want to remove the API key after you double-check.',
      inputSchema: {
        id: z.string().nonempty().describe('API key ID'),
      },
    },
    async ({ id }) => {
      console.error(`Debug - Removing API key with id: ${id}`);

      const response = await resend.apiKeys.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove API key: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [{ type: 'text', text: 'API key removed successfully.' }],
      };
    },
  );
}
