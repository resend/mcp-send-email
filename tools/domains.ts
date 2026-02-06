import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

function formatDnsRecords(
  records: {
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }[],
): string {
  if (!records || records.length === 0) return 'No DNS records.';

  return records
    .map(
      (r) =>
        `${r.record} (${r.type}):\n  Name: ${r.name}\n  Value: ${r.value}\n  TTL: ${r.ttl}\n  Status: ${r.status}${r.priority !== undefined ? `\n  Priority: ${r.priority}` : ''}`,
    )
    .join('\n\n');
}

export function addDomainTools(server: McpServer, resend: Resend) {
  server.tool(
    'create-domain',
    'Create a new domain in Resend. Returns DNS records that must be configured with your DNS provider for verification. You MUST display the DNS records to the user so they can set them up.',
    {
      name: z
        .string()
        .nonempty()
        .describe('The domain name (e.g., example.com)'),
      region: z
        .enum(['us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1'])
        .optional()
        .describe('Deployment region. Defaults to "us-east-1".'),
      customReturnPath: z
        .string()
        .optional()
        .describe('Subdomain for the Return-Path address. Defaults to "send".'),
      openTracking: z
        .boolean()
        .optional()
        .describe('Enable email open rate tracking.'),
      clickTracking: z
        .boolean()
        .optional()
        .describe('Enable click tracking in HTML emails.'),
      tls: z
        .enum(['opportunistic', 'enforced'])
        .optional()
        .describe(
          'TLS mode. "opportunistic" attempts secure connection with fallback. "enforced" requires TLS or fails. Defaults to "opportunistic".',
        ),
      capabilities: z
        .object({
          sending: z
            .enum(['enabled', 'disabled'])
            .optional()
            .describe('Enable or disable sending. Defaults to "enabled".'),
          receiving: z
            .enum(['enabled', 'disabled'])
            .optional()
            .describe('Enable or disable receiving. Defaults to "disabled".'),
        })
        .optional()
        .describe('Domain capabilities configuration.'),
    },
    async ({
      name,
      region,
      customReturnPath,
      openTracking,
      clickTracking,
      tls,
      capabilities,
    }) => {
      console.error(`Debug - Creating domain: ${name}`);

      const response = await resend.domains.create({
        name,
        ...(region && { region }),
        ...(customReturnPath && { customReturnPath }),
        ...(openTracking !== undefined && { openTracking }),
        ...(clickTracking !== undefined && { clickTracking }),
        ...(tls && { tls }),
        ...(capabilities && { capabilities }),
      });

      if (response.error) {
        throw new Error(
          `Failed to create domain: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Domain created successfully.' },
          {
            type: 'text',
            text: `Name: ${created.name}\nID: ${created.id}\nStatus: ${created.status}\nRegion: ${created.region}`,
          },
          {
            type: 'text',
            text: `DNS Records to configure:\n\n${formatDnsRecords(created.records)}`,
          },
          {
            type: 'text',
            text: 'IMPORTANT: Display the DNS records above to the user so they can configure them with their DNS provider. After configuration, use verify-domain to start verification.',
          },
        ],
      };
    },
  );

  server.tool(
    'list-domains',
    "List all domains from Resend. Returns domain names, statuses, regions, and capabilities. Don't bother telling the user the IDs unless they ask for them.",
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of domains to retrieve. Default: 20, Max: 100, Min: 1',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'Domain ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
        ),
      before: z
        .string()
        .optional()
        .describe(
          'Domain ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
        ),
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing domains with limit: ${limit}, after: ${after}, before: ${before}`,
      );

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.domains.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list domains: ${JSON.stringify(response.error)}`,
        );
      }

      const domains = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (domains.length === 0) {
        return {
          content: [{ type: 'text', text: 'No domains found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${domains.length} domain${domains.length === 1 ? '' : 's'}:`,
          },
          ...domains.map((domain) => ({
            type: 'text' as const,
            text: `Name: ${domain.name}\nID: ${domain.id}\nStatus: ${domain.status}\nRegion: ${domain.region}\nSending: ${domain.capabilities?.sending ?? 'unknown'}\nReceiving: ${domain.capabilities?.receiving ?? 'unknown'}\nCreated at: ${domain.created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more domains available. Use the "after" parameter with the last ID to retrieve more.',
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

  server.tool(
    'get-domain',
    'Get a domain by ID from Resend. Returns full domain details including DNS records needed for verification.',
    {
      id: z.string().nonempty().describe('Domain ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Getting domain with id: ${id}`);

      const response = await resend.domains.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get domain: ${JSON.stringify(response.error)}`,
        );
      }

      const domain = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Name: ${domain.name}\nID: ${domain.id}\nStatus: ${domain.status}\nRegion: ${domain.region}\nSending: ${domain.capabilities?.sending ?? 'unknown'}\nReceiving: ${domain.capabilities?.receiving ?? 'unknown'}\nCreated at: ${domain.created_at}`,
          },
          {
            type: 'text',
            text: `DNS Records:\n\n${formatDnsRecords(domain.records)}`,
          },
        ],
      };
    },
  );

  server.tool(
    'update-domain',
    'Update an existing domain in Resend. Allows changing tracking settings, TLS mode, and capabilities.',
    {
      id: z.string().nonempty().describe('Domain ID'),
      clickTracking: z
        .boolean()
        .optional()
        .describe('Track clicks within the body of each HTML email.'),
      openTracking: z
        .boolean()
        .optional()
        .describe('Track the open rate of each email.'),
      tls: z
        .enum(['opportunistic', 'enforced'])
        .optional()
        .describe(
          'TLS mode. "opportunistic" attempts secure connection with fallback. "enforced" requires TLS or fails.',
        ),
      capabilities: z
        .object({
          sending: z
            .enum(['enabled', 'disabled'])
            .optional()
            .describe('Enable or disable sending.'),
          receiving: z
            .enum(['enabled', 'disabled'])
            .optional()
            .describe('Enable or disable receiving.'),
        })
        .optional()
        .describe(
          'Domain capabilities. At least one capability must remain enabled.',
        ),
    },
    async ({ id, clickTracking, openTracking, tls, capabilities }) => {
      console.error(`Debug - Updating domain with id: ${id}`);

      const response = await resend.domains.update({
        id,
        ...(clickTracking !== undefined && { clickTracking }),
        ...(openTracking !== undefined && { openTracking }),
        ...(tls && { tls }),
        ...(capabilities && { capabilities }),
      });

      if (response.error) {
        throw new Error(
          `Failed to update domain: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Domain updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.tool(
    'remove-domain',
    'Remove a domain by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this domain. Reference the NAME of the domain when double-checking, and warn the user that removing a domain is irreversible and will stop all email sending/receiving for that domain. You may only use this tool if the user explicitly confirms they want to remove the domain after you double-check.',
    {
      id: z.string().nonempty().describe('Domain ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Removing domain with id: ${id}`);

      const response = await resend.domains.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove domain: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Domain removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.tool(
    'verify-domain',
    'Trigger domain verification in Resend. This starts an asynchronous verification process that checks if the DNS records are correctly configured. The domain status will temporarily show as "pending" during verification.',
    {
      id: z.string().nonempty().describe('Domain ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Verifying domain with id: ${id}`);

      const response = await resend.domains.verify(id);

      if (response.error) {
        throw new Error(
          `Failed to verify domain: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Domain verification started. The domain status will update once DNS records are verified.',
          },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
