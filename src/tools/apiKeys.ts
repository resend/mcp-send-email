import type { McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { z } from 'zod';

// Tool schemas/metadata are built once at module load, not per request:
// createMcpServer() runs on every HTTP request, and rebuilding these Zod
// schema trees each time is expensive enough to matter under concurrent
// long-lived connections (e.g. subscriptions/listen streams held open for
// minutes to hours each retain their own copy for the connection's lifetime).
const CREATE_API_KEY_TOOL = {
  title: 'Create API Key',
  description:
    'Create a new API key in Resend. The token is only shown once upon creation, so you MUST display it to the user.',
  inputSchema: {
    name: z.string().nonempty().describe('API key name'),
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
} as const;

const LIST_API_KEYS_TOOL = {
  title: 'List API Keys',
  annotations: { readOnlyHint: true },
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
} as const;

const UPDATE_API_KEY_TOOL = {
  title: 'Update API Key',
  description: 'Rename an existing API key in Resend.',
  inputSchema: {
    id: z.string().nonempty().describe('API key ID'),
    name: z.string().nonempty().describe('New API key name'),
  },
} as const;

const REMOVE_API_KEY_TOOL = {
  title: 'Remove API Key',
  description:
    'Remove an API key by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this API key. Reference the NAME of the API key when double-checking, and warn the user that removing an API key is irreversible and any services using it will lose access. You may only use this tool if the user explicitly confirms they want to remove the API key after you double-check.',
  inputSchema: {
    id: z.string().nonempty().describe('API key ID'),
  },
} as const;

export function addApiKeyTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-api-key',
    CREATE_API_KEY_TOOL,
    async ({ name, permission, domainId }) => {
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
    LIST_API_KEYS_TOOL,
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
        ],
      };
    },
  );

  server.registerTool(
    'update-api-key',
    UPDATE_API_KEY_TOOL,
    async ({ id, name }) => {
      const response = await resend.apiKeys.update(id, { name });

      if (response.error) {
        throw new Error(
          `Failed to update API key: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'API key updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool('remove-api-key', REMOVE_API_KEY_TOOL, async ({ id }) => {
    const response = await resend.apiKeys.remove(id);

    if (response.error) {
      throw new Error(
        `Failed to remove API key: ${JSON.stringify(response.error)}`,
      );
    }

    return {
      content: [{ type: 'text', text: 'API key removed successfully.' }],
    };
  });
}
