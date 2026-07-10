import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addOAuthGrantTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'list-oauth-grants',
    {
      title: 'List OAuth Grants',
      description:
        "List OAuth grants for the team — the apps authorized to act on the team's behalf. Returns every grant, active and revoked; a grant with a non-null revoked_at is no longer active. Each grant includes the client (app) name, scopes, and creation date. Don't bother telling the user the IDs unless they ask for them.",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of OAuth grants to retrieve. Max: 100, Min: 1'),
        after: z
          .string()
          .optional()
          .describe(
            'OAuth grant ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'OAuth grant ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
      },
    },
    async ({ limit, after, before }) => {
      if (after !== undefined && before !== undefined) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      if (after === '' || before === '') {
        throw new Error(
          '"after" and "before" must be non-empty when provided.',
        );
      }

      const paginationOptions =
        after !== undefined
          ? { limit, after }
          : before !== undefined
            ? { limit, before }
            : limit !== undefined
              ? { limit }
              : undefined;

      const response = await resend.oauthGrants.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list OAuth grants: ${JSON.stringify(response.error)}`,
        );
      }

      const grants = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (grants.length === 0) {
        return {
          content: [{ type: 'text', text: 'No OAuth grants found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${grants.length} OAuth grant${grants.length === 1 ? '' : 's'}:`,
          },
          ...grants.map((grant) => ({
            type: 'text' as const,
            text: `App: ${grant.client.name}\nID: ${grant.id}\nScopes: ${grant.scopes.join(', ')}\nCreated at: ${grant.created_at}\nStatus: ${
              grant.revoked_at ? `revoked (${grant.revoked_at})` : 'active'
            }`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more OAuth grants available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'revoke-oauth-grant',
    {
      title: 'Revoke OAuth Grant',
      description:
        'Revoke an OAuth grant by ID. Before using this tool, you MUST double-check with the user that they want to revoke this grant. Reference the NAME of the app (client) when double-checking, and warn the user that revocation is immediate and irreversible — every access and refresh token issued under the grant stops working, and the app would need to be re-authorized to regain access. You may only use this tool if the user explicitly confirms they want to revoke the grant after you double-check.',
      inputSchema: {
        id: z.string().nonempty().describe('OAuth grant ID'),
      },
    },
    async ({ id }) => {
      const response = await resend.oauthGrants.revoke(id);

      if (response.error) {
        throw new Error(
          `Failed to revoke OAuth grant: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [{ type: 'text', text: 'OAuth grant revoked successfully.' }],
      };
    },
  );
}
