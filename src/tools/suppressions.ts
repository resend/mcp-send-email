import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend, SuppressionListEntry } from 'resend';
import { z } from 'zod';

function formatSuppression(suppression: SuppressionListEntry) {
  return [
    `Email: ${suppression.email}`,
    `ID: ${suppression.id}`,
    `Origin: ${suppression.origin}`,
    ...(suppression.source_id ? [`Source ID: ${suppression.source_id}`] : []),
    `Created at: ${suppression.created_at}`,
  ].join('\n');
}

export function addSuppressionTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'add-suppression',
    {
      title: 'Add Suppression',
      description:
        'Add an email address to the suppression list in Resend. Suppressed addresses never receive emails from the account, even when included as recipients. Hard bounces and spam complaints are added to the suppression list automatically; use this tool to manually suppress an address when needed, e.g. to honor a do-not-contact request. To suppress many addresses at once, use batch-add-suppressions instead.',
      inputSchema: {
        email: z.email().describe('Email address to suppress'),
      },
    },
    async ({ email }) => {
      const response = await resend.suppressions.add({ email });

      if (response.error) {
        throw new Error(
          `Failed to add suppression: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Suppression added successfully.' },
          { type: 'text', text: `Email: ${email}\nID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-suppressions',
    {
      title: 'List Suppressions',
      annotations: { readOnlyHint: true },
      description: `**Purpose:** List email addresses on the suppression list. Suppressed addresses never receive emails from the account. Optionally filter by origin: "bounce" (added automatically after a hard bounce), "complaint" (added automatically after a spam complaint), or "manual" (added via the API or dashboard).

**NOT for:** Checking a single address (use get-suppression). Not for listing contacts (use list-contacts).

**Returns:** For each suppression: email, id, origin, source_id (when present), created_at. Use pagination (limit, after/before) for large lists.

**When to use:** User says "show my suppression list", "who is suppressed?", or "why isn't this person receiving emails?" combined with a broad look at suppressed addresses.`,
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of suppressions to retrieve. Default: 20, Max: 100, Min: 1',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Suppression ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Suppression ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
        origin: z
          .enum(['bounce', 'complaint', 'manual'])
          .optional()
          .describe(
            'Only return suppressions with this origin: "bounce", "complaint", or "manual".',
          ),
      },
    },
    async ({ limit, after, before, origin }) => {
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

      const listOptions =
        origin !== undefined
          ? { ...paginationOptions, origin }
          : paginationOptions;

      const response = await resend.suppressions.list(listOptions);

      if (response.error) {
        throw new Error(
          `Failed to list suppressions: ${JSON.stringify(response.error)}`,
        );
      }

      const suppressions = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (suppressions.length === 0) {
        return {
          content: [{ type: 'text', text: 'No suppressions found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${suppressions.length} suppression${suppressions.length === 1 ? '' : 's'}:`,
          },
          ...suppressions.map((suppression) => ({
            type: 'text' as const,
            text: formatSuppression(suppression),
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more suppressions available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'get-suppression',
    {
      title: 'Get Suppression',
      annotations: { readOnlyHint: true },
      description:
        'Get a suppression list entry by ID or email address from Resend. Use this to check whether a specific address is suppressed and why (origin: bounce, complaint, or manual).',
      inputSchema: {
        idOrEmail: z
          .string()
          .nonempty()
          .describe('Suppression ID or email address'),
      },
    },
    async ({ idOrEmail }) => {
      const response = await resend.suppressions.get(idOrEmail);

      if (response.error) {
        throw new Error(
          `Failed to get suppression: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [{ type: 'text', text: formatSuppression(response.data) }],
      };
    },
  );

  server.registerTool(
    'remove-suppression',
    {
      title: 'Remove Suppression',
      description:
        'Remove an entry by ID or email address from the suppression list in Resend, allowing the address to receive emails again. Before using this tool, you MUST double-check with the user that they want to remove this suppression. Reference the EMAIL ADDRESS when double-checking, and warn the user that the address will start receiving emails again — if it was suppressed due to a bounce or complaint, sending to it may hurt deliverability. You may only use this tool if the user explicitly confirms they want to remove the suppression after you double-check.',
      inputSchema: {
        idOrEmail: z
          .string()
          .nonempty()
          .describe('Suppression ID or email address'),
      },
    },
    async ({ idOrEmail }) => {
      const response = await resend.suppressions.remove(idOrEmail);

      if (response.error) {
        throw new Error(
          `Failed to remove suppression: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Suppression removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'batch-add-suppressions',
    {
      title: 'Batch Add Suppressions',
      description:
        'Add multiple email addresses to the suppression list in Resend in a single call. Suppressed addresses never receive emails from the account. Hard bounces and spam complaints are added to the suppression list automatically; use this tool to manually suppress addresses when needed, e.g. to honor do-not-contact requests. For a single address, use add-suppression instead.',
      inputSchema: {
        emails: z
          .array(z.email())
          .nonempty()
          .describe('Email addresses to suppress'),
      },
    },
    async ({ emails }) => {
      const response = await resend.suppressions.batch.add({ emails });

      if (response.error) {
        throw new Error(
          `Failed to batch add suppressions: ${JSON.stringify(response.error)}`,
        );
      }

      const added = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Added ${added.length} suppression${added.length === 1 ? '' : 's'} successfully.`,
          },
          ...added.map(({ id }, index) => ({
            type: 'text' as const,
            text: `Email: ${emails[index]}\nID: ${id}`,
          })),
        ],
      };
    },
  );

  server.registerTool(
    'batch-remove-suppressions',
    {
      title: 'Batch Remove Suppressions',
      description:
        'Remove multiple entries from the suppression list in Resend in a single call, by email addresses or by suppression IDs (provide exactly one of the two). The addresses will start receiving emails again. Before using this tool, you MUST double-check with the user that they want to remove these suppressions. Reference the EMAIL ADDRESSES (or IDs) when double-checking, and warn the user that addresses suppressed due to a bounce or complaint may hurt deliverability if emailed again. You may only use this tool if the user explicitly confirms they want to remove the suppressions after you double-check.',
      inputSchema: {
        emails: z
          .array(z.email())
          .nonempty()
          .optional()
          .describe(
            'Email addresses to remove from the suppression list. Cannot be used with "ids".',
          ),
        ids: z
          .array(z.string().nonempty())
          .nonempty()
          .optional()
          .describe(
            'Suppression IDs to remove from the suppression list. Cannot be used with "emails".',
          ),
      },
    },
    async ({ emails, ids }) => {
      if (emails && ids) {
        throw new Error(
          'Cannot use both "emails" and "ids" parameters. Provide only one.',
        );
      }
      if (!emails && !ids) {
        throw new Error('Either "emails" or "ids" must be provided.');
      }

      const response = await resend.suppressions.batch.remove(
        emails ? { emails } : { ids: ids as [string, ...string[]] },
      );

      if (response.error) {
        throw new Error(
          `Failed to batch remove suppressions: ${JSON.stringify(response.error)}`,
        );
      }

      const removed = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Removed ${removed.length} suppression${removed.length === 1 ? '' : 's'} successfully.`,
          },
          ...removed.map(({ id }) => ({
            type: 'text' as const,
            text: `ID: ${id}`,
          })),
        ],
      };
    },
  );
}
