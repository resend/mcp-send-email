import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

const webhookEventSchema = z.enum([
  'email.sent',
  'email.scheduled',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.received',
  'email.failed',
  'email.suppressed',
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'domain.created',
  'domain.updated',
  'domain.deleted',
]);

export function addWebhookTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-webhook',
    {
      title: 'Create Webhook',
      description:
        'Create a new webhook in Resend. A webhook allows you to receive notifications at a specified URL when certain events occur (e.g. email.sent, email.delivered, email.bounced).',
      inputSchema: {
        endpoint: z.url().describe('The URL where webhook events will be sent'),
        events: webhookEventSchema
          .array()
          .min(1)
          .describe('Array of event types to subscribe to'),
      },
    },
    async ({ endpoint, events }) => {
      console.error(
        `Debug - Creating webhook for endpoint: ${endpoint} with events: ${events.join(', ')}`,
      );

      const response = await resend.webhooks.create({ endpoint, events });

      if (response.error) {
        throw new Error(
          `Failed to create webhook: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Webhook created successfully.' },
          {
            type: 'text',
            text: `ID: ${created.id}\nSigning Secret: ${created.signing_secret}`,
          },
          {
            type: 'text',
            text: 'IMPORTANT: Make sure to tell the user the signing secret — they will need it to verify webhook payloads and it cannot be retrieved again later.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'list-webhooks',
    {
      title: 'List Webhooks',
      description:
        'List all webhooks from Resend. Use to get webhook IDs and see which endpoints and events are configured. Not for listing emails, segments, or broadcasts.',
      inputSchema: {},
    },
    async () => {
      console.error('Debug - Listing webhooks');

      const response = await resend.webhooks.list();

      if (response.error) {
        throw new Error(
          `Failed to list webhooks: ${JSON.stringify(response.error)}`,
        );
      }

      const webhooks = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${webhooks.length} webhook${webhooks.length === 1 ? '' : 's'}${webhooks.length === 0 ? '.' : ':'}`,
          },
          ...webhooks.map(({ id, endpoint, status, events, created_at }) => ({
            type: 'text' as const,
            text: `Endpoint: ${endpoint}\nStatus: ${status}\nEvents: ${events?.join(', ') ?? 'none'}\nID: ${id}\nCreated at: ${created_at}`,
          })),
          ...(webhooks.length === 0
            ? []
            : [
                {
                  type: 'text' as const,
                  text: "Don't bother telling the user the IDs or creation dates unless they ask for them.",
                },
              ]),
        ],
      };
    },
  );

  server.registerTool(
    'get-webhook',
    {
      title: 'Get Webhook',
      description: 'Get a webhook by ID from Resend.',
      inputSchema: {
        webhookId: z.string().nonempty().describe('Webhook ID'),
      },
    },
    async ({ webhookId }) => {
      console.error(`Debug - Getting webhook with id: ${webhookId}`);

      const response = await resend.webhooks.get(webhookId);

      if (response.error) {
        throw new Error(
          `Failed to get webhook: ${JSON.stringify(response.error)}`,
        );
      }

      const webhook = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Endpoint: ${webhook.endpoint}\nStatus: ${webhook.status}\nEvents: ${webhook.events?.join(', ') ?? 'none'}\nID: ${webhook.id}\nCreated at: ${webhook.created_at}\nSigning Secret: ${webhook.signing_secret}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'update-webhook',
    {
      title: 'Update Webhook',
      description:
        'Update an existing webhook in Resend. You can change the endpoint URL, subscribed events, or enable/disable the webhook.',
      inputSchema: {
        webhookId: z.string().nonempty().describe('Webhook ID'),
        endpoint: z
          .url()
          .optional()
          .describe('New URL where webhook events will be sent'),
        events: webhookEventSchema
          .array()
          .min(1)
          .optional()
          .describe('New array of event types to subscribe to'),
        status: z
          .enum(['enabled', 'disabled'])
          .optional()
          .describe('Webhook status'),
      },
    },
    async ({ webhookId, endpoint, events, status }) => {
      console.error(`Debug - Updating webhook with id: ${webhookId}`);

      const response = await resend.webhooks.update(webhookId, {
        endpoint,
        events,
        status,
      });

      if (response.error) {
        throw new Error(
          `Failed to update webhook: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Webhook updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-webhook',
    {
      title: 'Remove Webhook',
      description:
        'Remove a webhook by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this webhook. Reference the ENDPOINT of the webhook when double-checking, and warn the user that removing a webhook is irreversible. You may only use this tool if the user explicitly confirms they want to remove the webhook after you double-check.',
      inputSchema: {
        webhookId: z.string().nonempty().describe('Webhook ID'),
      },
    },
    async ({ webhookId }) => {
      console.error(`Debug - Removing webhook with id: ${webhookId}`);

      const response = await resend.webhooks.remove(webhookId);

      if (response.error) {
        throw new Error(
          `Failed to remove webhook: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Webhook removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
