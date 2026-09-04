import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addWebhookTools } from '../../src/tools/webhooks.js';

const listEvents = vi.fn();
const getEvent = vi.fn();
const replayEvent = vi.fn();
const listAttempts = vi.fn();

const resend = {
  webhooks: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    events: {
      list: listEvents,
      get: getEvent,
      replay: replayEvent,
      attempts: { list: listAttempts },
    },
  },
} as unknown as Resend;

const WEBHOOK_ID = '4dd369bc-aa82-4ff3-97de-514ae3000ee0';
const EVENT_ID = 'msg_1srOrx2ZWZBpBUvZwXKQmoEYga2';

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addWebhookTools(server, resend);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

describe('webhook event tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the three event tools as read-only', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(byName['list-webhook-events']?.annotations?.readOnlyHint).toBe(true);
    expect(byName['get-webhook-event']?.annotations?.readOnlyHint).toBe(true);
    expect(
      byName['list-webhook-event-attempts']?.annotations?.readOnlyHint,
    ).toBe(true);
  });

  it('list-webhook-events sends webhookId and pagination to the SDK', async () => {
    listEvents.mockResolvedValue({
      data: {
        object: 'list',
        has_more: true,
        data: [
          {
            id: EVENT_ID,
            type: 'email.sent',
            created_at: '2026-08-22T15:27:42.000Z',
            status: 'success',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-webhook-events',
      arguments: { webhookId: WEBHOOK_ID, limit: 50, after: EVENT_ID },
    });

    expect(listEvents).toHaveBeenCalledWith({
      webhookId: WEBHOOK_ID,
      limit: 50,
      after: EVENT_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('email.sent');
    expect(text).toContain(
      'There are more webhook events available. Use the "after" parameter with the last ID to retrieve more.',
    );
  });

  it('get-webhook-event renders next_attempt_at and the payload', async () => {
    getEvent.mockResolvedValue({
      data: {
        object: 'webhook_event',
        id: EVENT_ID,
        type: 'email.sent',
        created_at: '2026-08-22T15:28:00.000Z',
        status: 'attempting',
        next_attempt_at: '2026-08-22T15:33:00.000Z',
        payload: { type: 'email.sent' },
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-webhook-event',
      arguments: { webhookId: WEBHOOK_ID, eventId: EVENT_ID },
    });

    expect(getEvent).toHaveBeenCalledWith({
      webhookId: WEBHOOK_ID,
      eventId: EVENT_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('2026-08-22T15:33:00.000Z');
    expect(text).toContain('"type": "email.sent"');
  });

  it('get-webhook-event says so when no retry is scheduled', async () => {
    getEvent.mockResolvedValue({
      data: {
        object: 'webhook_event',
        id: EVENT_ID,
        type: 'email.sent',
        created_at: '2026-08-22T15:28:00.000Z',
        status: 'success',
        next_attempt_at: null,
        payload: {},
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-webhook-event',
      arguments: { webhookId: WEBHOOK_ID, eventId: EVENT_ID },
    });

    expect(textOf(result as never)).toContain('none scheduled');
  });

  it('replay-webhook-event sends webhookId and eventId to the SDK', async () => {
    replayEvent.mockResolvedValue({
      data: { object: 'webhook_event', id: EVENT_ID },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'replay-webhook-event',
      arguments: { webhookId: WEBHOOK_ID, eventId: EVENT_ID },
    });

    expect(replayEvent).toHaveBeenCalledWith({
      webhookId: WEBHOOK_ID,
      eventId: EVENT_ID,
    });
    expect(textOf(result as never)).toContain(EVENT_ID);
  });

  it('list-webhook-event-attempts surfaces what the endpoint returned', async () => {
    listAttempts.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          {
            id: 'atmpt_2ZbUCwvGmIT4mLIN6d3Yz0Ainbd',
            http_status_code: 500,
            response: 'Internal Server Error',
            sent_at: '2026-08-22T15:28:05.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-webhook-event-attempts',
      arguments: { webhookId: WEBHOOK_ID, eventId: EVENT_ID },
    });

    expect(listAttempts).toHaveBeenCalledWith({
      webhookId: WEBHOOK_ID,
      eventId: EVENT_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('500');
    expect(text).toContain('Internal Server Error');
  });

  it('surfaces the API error when a list fails', async () => {
    listEvents.mockResolvedValue({
      data: null,
      error: { message: 'Webhook endpoint not found', name: 'not_found' },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-webhook-events',
      arguments: { webhookId: WEBHOOK_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Webhook endpoint not found');
  });
});
