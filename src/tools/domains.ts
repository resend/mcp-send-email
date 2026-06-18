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

function formatClaimRecord(record: {
  type: string;
  name: string;
  value: string;
  ttl: string;
}): string {
  return `${record.type}:\n  Name: ${record.name}\n  Value: ${record.value}\n  TTL: ${record.ttl}`;
}

export function addDomainTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-domain',
    {
      title: 'Create Domain',
      description:
        'Create a new domain in Resend. Returns DNS records that must be configured with your DNS provider for verification. You MUST display the DNS records to the user so they can set them up.',
      inputSchema: {
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
          .describe(
            'Subdomain for the Return-Path address. Defaults to "send".',
          ),
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
        trackingSubdomain: z
          .string()
          .optional()
          .describe(
            'Custom subdomain for tracking links (e.g., "track" for track.example.com). When set, click and open tracking URLs will use this subdomain instead of the default.',
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
    },
    async ({
      name,
      region,
      customReturnPath,
      openTracking,
      clickTracking,
      tls,
      trackingSubdomain,
      capabilities,
    }) => {
      const response = await resend.domains.create({
        name,
        ...(region && { region }),
        ...(customReturnPath && { customReturnPath }),
        ...(openTracking !== undefined && { openTracking }),
        ...(clickTracking !== undefined && { clickTracking }),
        ...(tls && { tls }),
        ...(trackingSubdomain && { trackingSubdomain }),
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
            text: `Name: ${created.name}\nID: ${created.id}\nStatus: ${created.status}\nRegion: ${created.region}\nOpen Tracking: ${created.open_tracking ?? false}\nClick Tracking: ${created.click_tracking ?? false}${created.tracking_subdomain ? `\nTracking Subdomain: ${created.tracking_subdomain}` : ''}`,
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

  server.registerTool(
    'list-domains',
    {
      title: 'List Domains',
      description:
        "List all domains from Resend. Returns domain names, statuses, regions, and capabilities. Don't bother telling the user the IDs unless they ask for them.",
      inputSchema: {
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
            text: `Name: ${domain.name}\nID: ${domain.id}\nStatus: ${domain.status}\nRegion: ${domain.region}\nSending: ${domain.capabilities?.sending ?? 'unknown'}\nReceiving: ${domain.capabilities?.receiving ?? 'unknown'}\nOpen Tracking: ${domain.open_tracking ?? false}\nClick Tracking: ${domain.click_tracking ?? false}${domain.tracking_subdomain ? `\nTracking Subdomain: ${domain.tracking_subdomain}` : ''}\nCreated at: ${domain.created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more domains available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'get-domain',
    {
      title: 'Get Domain',
      description:
        'Get a domain by ID from Resend. Returns full domain details including DNS records needed for verification.',
      inputSchema: {
        id: z.string().nonempty().describe('Domain ID'),
      },
    },
    async ({ id }) => {
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
            text: `Name: ${domain.name}\nID: ${domain.id}\nStatus: ${domain.status}\nRegion: ${domain.region}\nSending: ${domain.capabilities?.sending ?? 'unknown'}\nReceiving: ${domain.capabilities?.receiving ?? 'unknown'}\nOpen Tracking: ${domain.open_tracking ?? false}\nClick Tracking: ${domain.click_tracking ?? false}${domain.tracking_subdomain ? `\nTracking Subdomain: ${domain.tracking_subdomain}` : ''}\nCreated at: ${domain.created_at}`,
          },
          {
            type: 'text',
            text: `DNS Records:\n\n${formatDnsRecords(domain.records)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'update-domain',
    {
      title: 'Update Domain',
      description:
        'Update an existing domain in Resend. Allows changing tracking settings, TLS mode, and capabilities.',
      inputSchema: {
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
        trackingSubdomain: z
          .string()
          .optional()
          .describe(
            'Custom subdomain for tracking links (e.g., "track" for track.example.com). When set, click and open tracking URLs will use this subdomain instead of the default.',
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
    },
    async ({
      id,
      clickTracking,
      openTracking,
      tls,
      trackingSubdomain,
      capabilities,
    }) => {
      const response = await resend.domains.update({
        id,
        ...(clickTracking !== undefined && { clickTracking }),
        ...(openTracking !== undefined && { openTracking }),
        ...(tls && { tls }),
        ...(trackingSubdomain && { trackingSubdomain }),
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

  server.registerTool(
    'remove-domain',
    {
      title: 'Remove Domain',
      description:
        'Remove a domain by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this domain. Reference the NAME of the domain when double-checking, and warn the user that removing a domain is irreversible and will stop all email sending/receiving for that domain. You may only use this tool if the user explicitly confirms they want to remove the domain after you double-check.',
      inputSchema: {
        id: z.string().nonempty().describe('Domain ID'),
      },
    },
    async ({ id }) => {
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

  server.registerTool(
    'verify-domain',
    {
      title: 'Verify Domain',
      description:
        'Trigger domain verification in Resend. This starts an asynchronous verification process that checks if the DNS records are correctly configured. The domain status will temporarily show as "pending" during verification.',
      inputSchema: {
        id: z.string().nonempty().describe('Domain ID'),
      },
    },
    async ({ id }) => {
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

  server.registerTool(
    'create-domain-claim',
    {
      title: 'Create Domain Claim',
      description:
        'Start a claim for a domain another Resend account has already verified. The domain is recreated under your account with brand-new DKIM keys, so the previous account\'s DNS records cannot be reused. Returns a TXT record that MUST be added to your DNS to prove ownership. You MUST display the TXT record to the user. After they add it, use verify-domain-claim, then poll get-domain-claim until status is "completed".',
      inputSchema: {
        name: z
          .string()
          .nonempty()
          .describe('The domain name to claim (e.g., example.com)'),
        region: z
          .enum(['us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1'])
          .optional()
          .describe('Deployment region. Defaults to "us-east-1".'),
        customReturnPath: z
          .string()
          .optional()
          .describe(
            'Subdomain for the Return-Path address. Defaults to "send".',
          ),
        openTracking: z
          .boolean()
          .optional()
          .describe('Enable email open rate tracking.'),
        clickTracking: z
          .boolean()
          .optional()
          .describe('Enable click tracking in HTML emails.'),
        trackingSubdomain: z
          .string()
          .optional()
          .describe(
            'Custom subdomain for tracking links (e.g., "track" for track.example.com).',
          ),
      },
    },
    async ({
      name,
      region,
      customReturnPath,
      openTracking,
      clickTracking,
      trackingSubdomain,
    }) => {
      const response = await resend.domains.claims.create({
        name,
        ...(region && { region }),
        ...(customReturnPath && { customReturnPath }),
        ...(openTracking !== undefined && { openTracking }),
        ...(clickTracking !== undefined && { clickTracking }),
        ...(trackingSubdomain && { trackingSubdomain }),
      });
      if (response.error) {
        throw new Error(
          `Failed to create domain claim: ${JSON.stringify(response.error)}`,
        );
      }
      const claim = response.data;
      return {
        content: [
          { type: 'text', text: 'Domain claim started.' },
          {
            type: 'text',
            text: `Name: ${claim.name}\nClaim ID: ${claim.id}\nDomain ID: ${claim.domain_id}\nStatus: ${claim.status}\nRegion: ${claim.region}\nExpires: ${claim.expires_at}`,
          },
          {
            type: 'text',
            text: `Add this TXT record at your DNS provider to prove ownership:\n\n${formatClaimRecord(claim.record)}`,
          },
          {
            type: 'text',
            text: 'IMPORTANT: Display the TXT record above to the user. After they add it to DNS, use verify-domain-claim with the Domain ID, then poll get-domain-claim until status is "completed". The transferred domain will then have NEW DKIM records that must also be added (get-domain) before sending.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'get-domain-claim',
    {
      title: 'Get Domain Claim',
      description:
        'Retrieve the latest claim for a domain by its placeholder Domain ID (the domain_id from create-domain-claim). Returns claim status and the TXT record needed to prove ownership. Poll until status is "completed".',
      inputSchema: {
        id: z
          .string()
          .nonempty()
          .describe('The placeholder Domain ID created by the claim'),
      },
    },
    async ({ id }) => {
      const response = await resend.domains.claims.get(id);
      if (response.error) {
        throw new Error(
          `Failed to get domain claim: ${JSON.stringify(response.error)}`,
        );
      }
      const claim = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Name: ${claim.name}\nClaim ID: ${claim.id}\nDomain ID: ${claim.domain_id}\nStatus: ${claim.status}\nRegion: ${claim.region}${claim.blocked_reason ? `\nBlocked reason: ${claim.blocked_reason}` : ''}${claim.failure_reason ? `\nFailure reason: ${claim.failure_reason}` : ''}\nExpires: ${claim.expires_at}`,
          },
          {
            type: 'text',
            text: `TXT record:\n\n${formatClaimRecord(claim.record)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'verify-domain-claim',
    {
      title: 'Verify Domain Claim',
      description:
        'Trigger asynchronous DNS verification and ownership transfer for a domain claim, using the placeholder Domain ID. The claim stays "pending" while verification runs; poll get-domain-claim for status. Once "completed", the transferred domain has NEW DKIM records — fetch them with get-domain, add them to DNS, then run verify-domain.',
      inputSchema: {
        id: z
          .string()
          .nonempty()
          .describe('The placeholder Domain ID created by the claim'),
      },
    },
    async ({ id }) => {
      const response = await resend.domains.claims.verify(id);
      if (response.error) {
        throw new Error(
          `Failed to verify domain claim: ${JSON.stringify(response.error)}`,
        );
      }
      const claim = response.data;
      return {
        content: [
          {
            type: 'text',
            text: 'Domain claim verification started. The claim status will update asynchronously.',
          },
          {
            type: 'text',
            text: `Domain ID: ${claim.domain_id}\nStatus: ${claim.status}`,
          },
        ],
      };
    },
  );
}
