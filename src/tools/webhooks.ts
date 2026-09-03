import type { McpServer } from '@modelcontextprotocol/server';
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
  'suppression.added',
  'suppression.removed',
]);

const CREATE_WEBHOOK_TOOL = {
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
} as const;

const LIST_WEBHOOKS_TOOL = {
  title: 'List Webhooks',
  annotations: { readOnlyHint: true },
  description:
    'List all webhooks from Resend. Use to get webhook IDs and see which endpoints and events are configured. Not for listing emails, segments, or broadcasts.',
  inputSchema: {},
} as const;

const GET_WEBHOOK_TOOL = {
  title: 'Get Webhook',
  annotations: { readOnlyHint: true },
  description: 'Get a webhook by ID from Resend.',
  inputSchema: {
    webhookId: z.string().nonempty().describe('Webhook ID'),
  },
} as const;

const UPDATE_WEBHOOK_TOOL = {
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
} as const;

const REMOVE_WEBHOOK_TOOL = {
  title: 'Remove Webhook',
  description:
    'Remove a webhook by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this webhook. Reference the ENDPOINT of the webhook when double-checking, and warn the user that removing a webhook is irreversible. You may only use this tool if the user explicitly confirms they want to remove the webhook after you double-check.',
  inputSchema: {
    webhookId: z.string().nonempty().describe('Webhook ID'),
  },
} as const;

const LIST_WEBHOOK_EVENTS_TOOL = {
  title: 'List Webhook Events',
  annotations: { readOnlyHint: true },
  description: `**Purpose:** List the events Resend delivered to one webhook, most recent first, with the delivery status of each.

**NOT for:** Listing the event types a webhook subscribes to (use get-webhook). Not for listing emails (use list-emails) or the Events product (use list-events).

**Returns:** For each event: id, type (e.g. email.sent), created_at, and status — one of pending, attempting, success, or failed.

**When to use:** User asks "did my webhook receive this?", "why is my endpoint missing events?", or wants the delivery history of a webhook. Use get-webhook-event next for the payload, and list-webhook-event-attempts for what their endpoint returned.`,
  inputSchema: {
    webhookId: z.string().nonempty().describe('Webhook ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of events to retrieve. Default: 20, Max: 100, Min: 1'),
    after: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Event ID to fetch the page after (forward pagination). This endpoint has no "before" cursor.',
      ),
  },
} as const;

const GET_WEBHOOK_EVENT_TOOL = {
  title: 'Get Webhook Event',
  annotations: { readOnlyHint: true },
  description: `**Purpose:** Get one event delivered to a webhook, including the exact payload Resend sent to the endpoint.

**Returns:** id, type, created_at, status, next_attempt_at (when the next retry is scheduled — null once the event reaches success or failed), and payload (the JSON body sent to the endpoint).

**When to use:** User wants to see what Resend actually sent for a specific event, or when the next retry is due. Get the event ID from list-webhook-events first.`,
  inputSchema: {
    webhookId: z.string().nonempty().describe('Webhook ID'),
    eventId: z.string().nonempty().describe('Webhook event ID'),
  },
} as const;

const REPLAY_WEBHOOK_EVENT_TOOL = {
  title: 'Replay Webhook Event',
  description: `**Purpose:** Queue one more delivery of a webhook event to its endpoint — the same action as the dashboard's Replay button.

**NOT for:** Inspecting an event (use get-webhook-event) or its past attempts (use list-webhook-event-attempts). A manual replay does not schedule further automatic retries.

**When to use:** User wants to resend a specific webhook event after fixing their endpoint, or re-trigger a delivery that failed or was missed. Get the event ID from list-webhook-events first.`,
  inputSchema: {
    webhookId: z.string().nonempty().describe('Webhook ID'),
    eventId: z.string().nonempty().describe('Webhook event ID'),
  },
} as const;

const LIST_WEBHOOK_EVENT_ATTEMPTS_TOOL = {
  title: 'List Webhook Event Attempts',
  annotations: { readOnlyHint: true },
  description: `**Purpose:** List the delivery attempts Resend made for one webhook event, most recent first, with what the endpoint returned each time.

**Returns:** For each attempt: id, http_status_code, response (the body the endpoint returned), and sent_at.

**When to use:** An event is in the failed or attempting status and the user wants to know why. This is the tool that shows the endpoint's own error response. Get the event ID from list-webhook-events first.`,
  inputSchema: {
    webhookId: z.string().nonempty().describe('Webhook ID'),
    eventId: z.string().nonempty().describe('Webhook event ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Number of attempts to retrieve. Default: 20, Max: 100, Min: 1',
      ),
    after: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Attempt ID to fetch the page after (forward pagination). This endpoint has no "before" cursor.',
      ),
  },
} as const;

export function addWebhookTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-webhook',
    CREATE_WEBHOOK_TOOL,
    async ({ endpoint, events }) => {
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
    LIST_WEBHOOKS_TOOL,
    async (_args, _ctx) => {
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
        ],
      };
    },
  );

  server.registerTool(
    'get-webhook',
    GET_WEBHOOK_TOOL,
    async ({ webhookId }) => {
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
    UPDATE_WEBHOOK_TOOL,
    async ({ webhookId, endpoint, events, status }) => {
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
        ],
      };
    },
  );

  server.registerTool(
    'list-webhook-events',
    LIST_WEBHOOK_EVENTS_TOOL,
    async ({ webhookId, limit, after }) => {
      const response = await resend.webhooks.events.list({
        webhookId,
        ...(limit !== undefined && { limit }),
        ...(after !== undefined && { after }),
      });

      if (response.error) {
        throw new Error(
          `Failed to list webhook events: ${JSON.stringify(response.error)}`,
        );
      }

      const events = response.data.data;
      if (events.length === 0) {
        return {
          content: [{ type: 'text', text: 'No webhook events found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${events.length} webhook event${events.length === 1 ? '' : 's'}:`,
          },
          ...events.map(({ id, type, status, created_at }) => ({
            type: 'text' as const,
            text: `Type: ${type}\nStatus: ${status}\nID: ${id}\nCreated at: ${created_at}`,
          })),
          ...(response.data.has_more
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more webhook events available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'get-webhook-event',
    GET_WEBHOOK_EVENT_TOOL,
    async ({ webhookId, eventId }) => {
      const response = await resend.webhooks.events.get({
        webhookId,
        eventId,
      });

      if (response.error) {
        throw new Error(
          `Failed to get webhook event: ${JSON.stringify(response.error)}`,
        );
      }

      const event = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Type: ${event.type}\nStatus: ${event.status}\nID: ${event.id}\nCreated at: ${event.created_at}\nNext attempt at: ${event.next_attempt_at ?? 'none scheduled'}`,
          },
          {
            type: 'text',
            text: `Payload:\n${JSON.stringify(event.payload, null, 2)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'replay-webhook-event',
    REPLAY_WEBHOOK_EVENT_TOOL,
    async ({ webhookId, eventId }) => {
      const response = await resend.webhooks.events.replay({
        webhookId,
        eventId,
      });

      if (response.error) {
        throw new Error(
          `Failed to replay webhook event: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Webhook event replay queued.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-webhook-event-attempts',
    LIST_WEBHOOK_EVENT_ATTEMPTS_TOOL,
    async ({ webhookId, eventId, limit, after }) => {
      const response = await resend.webhooks.events.attempts.list({
        webhookId,
        eventId,
        ...(limit !== undefined && { limit }),
        ...(after !== undefined && { after }),
      });

      if (response.error) {
        throw new Error(
          `Failed to list webhook event attempts: ${JSON.stringify(response.error)}`,
        );
      }

      const attempts = response.data.data;
      if (attempts.length === 0) {
        return {
          content: [{ type: 'text', text: 'No delivery attempts found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${attempts.length} delivery attempt${attempts.length === 1 ? '' : 's'}:`,
          },
          ...attempts.map(
            ({ id, http_status_code, response: body, sent_at }) => ({
              type: 'text' as const,
              text: `HTTP status: ${http_status_code}\nSent at: ${sent_at}\nID: ${id}\nResponse: ${body}`,
            }),
          ),
          ...(response.data.has_more
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more delivery attempts available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'remove-webhook',
    REMOVE_WEBHOOK_TOOL,
    async ({ webhookId }) => {
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
