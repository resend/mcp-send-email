import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addSuppressionTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-suppression',
    {
      title: 'Create Suppression',
      description: `**Purpose:** Suppress an email address so Resend stops delivering to it. Once suppressed, any send to that address is blocked at send time.

**NOT for:** Managing topic subscription preferences (use update-contact topic subscriptions or topics tools). Not for deleting contacts (use remove-contact).

**When to use:**
- User asks to "block", "suppress", or "stop sending to" an address
- Manually honoring an unsubscribe/complaint request

Suppressions created here have origin "manual". Bounce and complaint suppressions are added automatically by Resend.`,
      inputSchema: {
        email: z.string().nonempty().describe('Email address to suppress'),
      },
    },
    async ({ email }) => {
      const response = await resend.suppressions.add({ email });

      if (response.error) {
        throw new Error(
          `Failed to create suppression: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Suppression created successfully.' },
          { type: 'text', text: `Email: ${email}\nID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-suppressions',
    {
      title: 'List Suppressions',
      description: `**Purpose:** List suppressed email addresses with their origin (bounce, complaint, or manual) and when they were suppressed.

**Returns:** Paginated list with email, origin, source_id, created_at, and ID per suppression.

**When to use:**
- User asks "what addresses are suppressed?", "why isn't this address receiving email?"
- Finding a suppression ID or confirming an address is blocked (then use get-suppression or remove-suppression)`,
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
          .describe('Filter suppressions by how they were created'),
      },
    },
    async ({ limit, after, before, origin }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      // Resend SDK requires mutually exclusive after/before; origin is orthogonal
      const listOptions = after
        ? { limit, after, ...(origin && { origin }) }
        : before
          ? { limit, before, ...(origin && { origin }) }
          : {
              ...(limit !== undefined && { limit }),
              ...(origin && { origin }),
            };
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

      const summaries = suppressions
        .map(
          (s) =>
            `- Email: ${s.email} | Origin: ${s.origin} | Source: ${s.source_id ?? '(none)'} | Created: ${s.created_at} | ID: ${s.id}`,
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${suppressions.length} suppression(s)${hasMore ? ' (more available)' : ''}:\n\n${summaries}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'get-suppression',
    {
      title: 'Get Suppression',
      description:
        'Get a suppression by its ID or by the suppressed email address.',
      inputSchema: {
        idOrEmail: z
          .string()
          .nonempty()
          .describe('Suppression ID or the suppressed email address'),
      },
    },
    async ({ idOrEmail }) => {
      const response = await resend.suppressions.get(idOrEmail);

      if (response.error) {
        throw new Error(
          `Failed to get suppression: ${JSON.stringify(response.error)}`,
        );
      }

      const s = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Email: ${s.email}\nID: ${s.id}\nOrigin: ${s.origin}\nSource: ${s.source_id ?? '(none)'}\nCreated at: ${s.created_at}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-suppression',
    {
      title: 'Remove Suppression',
      description:
        'Remove a suppression by its ID or by the suppressed email address, re-enabling delivery to that address. Before using this tool, warn the user that removing a suppression means Resend will resume sending to an address that may have previously bounced or complained, which can hurt deliverability. Reference the EMAIL when double-checking, and only proceed if the user explicitly confirms.',
      inputSchema: {
        idOrEmail: z
          .string()
          .nonempty()
          .describe('Suppression ID or the suppressed email address'),
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
          {
            type: 'text',
            text: `ID: ${response.data.id}\nDeleted: ${response.data.deleted}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'create-batch-suppressions',
    {
      title: 'Create Batch Suppressions',
      description:
        'Suppress multiple email addresses in a single request. Use instead of create-suppression when blocking several addresses at once.',
      inputSchema: {
        emails: z
          .array(z.string().nonempty())
          .nonempty()
          .describe('Email addresses to suppress'),
      },
    },
    async ({ emails }) => {
      const response = await resend.suppressions.batch.add({ emails });

      if (response.error) {
        throw new Error(
          `Failed to create batch suppressions: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data?.data ?? [];
      return {
        content: [
          {
            type: 'text',
            text: `Suppressed ${created.length} address(es).`,
          },
          {
            type: 'text',
            text: created.map((s) => `ID: ${s.id}`).join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-batch-suppressions',
    {
      title: 'Remove Batch Suppressions',
      description:
        'Remove multiple suppressions in a single request, re-enabling delivery to those addresses. Provide either emails or ids, not both. Before using this tool, warn the user that Resend will resume sending to addresses that may have previously bounced or complained, which can hurt deliverability, and only proceed if the user explicitly confirms.',
      inputSchema: {
        emails: z
          .array(z.string().nonempty())
          .nonempty()
          .optional()
          .describe(
            'Suppressed email addresses to remove. Cannot be used with "ids".',
          ),
        ids: z
          .array(z.string().nonempty())
          .nonempty()
          .optional()
          .describe('Suppression IDs to remove. Cannot be used with "emails".'),
      },
    },
    async ({ emails, ids }) => {
      if ((emails && ids) || (!emails && !ids)) {
        throw new Error(
          'Provide exactly one of "emails" or "ids" to remove suppressions.',
        );
      }

      const response = await resend.suppressions.batch.remove(
        emails ? { emails } : { ids: ids as string[] },
      );

      if (response.error) {
        throw new Error(
          `Failed to remove batch suppressions: ${JSON.stringify(response.error)}`,
        );
      }

      const removed = response.data?.data ?? [];
      return {
        content: [
          {
            type: 'text',
            text: `Removed ${removed.length} suppression(s).`,
          },
          {
            type: 'text',
            text: removed
              .map((s) => `ID: ${s.id} | Deleted: ${s.deleted}`)
              .join('\n'),
          },
        ],
      };
    },
  );
}
