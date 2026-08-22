import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEmailTools } from '../../src/tools/emails.js';

const send = vi.fn();
const batchSend = vi.fn();
const share = vi.fn();
const metrics = vi.fn();

const resend = {
  emails: { send, share, metrics },
  batch: { send: batchSend },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addEmailTools(server, resend, {
    replierEmailAddresses: [],
  });
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

describe('send-email from address format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({
      data: { id: 'email_1' },
      error: null,
    });
  });

  it('accepts bare email addresses in from', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'onboarding@resend.dev',
      }),
      undefined,
    );
    expect(textOf(result)).toContain('Email sent successfully');
  });

  it('accepts RFC 5322 display-name from addresses', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'Acme <onboarding@resend.dev>',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Acme <onboarding@resend.dev>',
      }),
      undefined,
    );
    expect(textOf(result)).toContain('Email sent successfully');
  });
});

describe('replyTo address format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({
      data: { id: 'email_1' },
      error: null,
    });
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'email_1' }] },
      error: null,
    });
  });

  it.each([
    'support@example.com',
    'Support Team <support@example.com>',
  ])('passes replyTo through send-email: %s', async (replyTo) => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: ['delivered@resend.dev'],
        replyTo: [replyTo],
        subject: 'hello',
        text: 'world',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: [replyTo] }),
      undefined,
    );
  });

  it.each([
    'support@example.com',
    'Support Team <support@example.com>',
  ])('passes replyTo through send-batch-emails: %s', async (replyTo) => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-batch-emails',
      arguments: {
        emails: [
          {
            from: 'onboarding@resend.dev',
            to: ['delivered@resend.dev'],
            replyTo: [replyTo],
            subject: 'hello',
            text: 'world',
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    expect(batchSend).toHaveBeenCalledWith(
      [expect.objectContaining({ replyTo: [replyTo] })],
      undefined,
    );
  });
});

describe('send-email idempotency key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({
      data: { id: 'email_1' },
      error: null,
    });
  });

  it('passes idempotencyKey as the SDK options argument', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'Acme <onboarding@resend.dev>',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
        idempotencyKey: 'welcome-user/123456789',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Acme <onboarding@resend.dev>',
        to: ['delivered@resend.dev'],
      }),
      { idempotencyKey: 'welcome-user/123456789' },
    );
  });

  it('omits SDK options when idempotencyKey is not provided', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
      },
    });

    expect(send).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it('rejects an empty idempotencyKey before calling the SDK', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
        idempotencyKey: '',
      },
    });

    expect(result.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('send-batch-emails idempotency key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'email_1' }, { id: 'email_2' }] },
      error: null,
    });
  });

  it('passes idempotencyKey as the SDK options argument', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-batch-emails',
      arguments: {
        emails: [
          {
            from: 'Acme <onboarding@resend.dev>',
            to: ['foo@example.com'],
            subject: 'hello',
            text: 'one',
          },
          {
            from: 'Acme <onboarding@resend.dev>',
            to: ['bar@example.com'],
            subject: 'hello',
            text: 'two',
          },
        ],
        idempotencyKey: 'team-quota/123456789',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(batchSend).toHaveBeenCalledWith(expect.any(Array), {
      idempotencyKey: 'team-quota/123456789',
    });
    expect(textOf(result)).toContain('Batch sent successfully');
  });

  it('omits SDK options when idempotencyKey is not provided', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'send-batch-emails',
      arguments: {
        emails: [
          {
            from: 'onboarding@resend.dev',
            to: ['foo@example.com'],
            subject: 'hello',
            text: 'one',
          },
        ],
      },
    });

    expect(batchSend).toHaveBeenCalledWith(expect.any(Array), undefined);
  });

  it('rejects an empty idempotencyKey before calling the SDK', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-batch-emails',
      arguments: {
        emails: [
          {
            from: 'onboarding@resend.dev',
            to: ['foo@example.com'],
            subject: 'hello',
            text: 'one',
          },
        ],
        idempotencyKey: '',
      },
    });

    expect(result.isError).toBe(true);
    expect(batchSend).not.toHaveBeenCalled();
  });
});

describe('send-email custom headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({
      data: { id: 'email_1' },
      error: null,
    });
  });

  it('passes headers through to the SDK email payload', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'Acme <onboarding@resend.dev>',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
        headers: {
          'List-Unsubscribe': '<https://example.com/unsubscribe>',
          'X-Entity-Ref-ID': 'order-123',
        },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'List-Unsubscribe': '<https://example.com/unsubscribe>',
          'X-Entity-Ref-ID': 'order-123',
        },
      }),
      undefined,
    );
  });

  it('omits headers from the SDK payload when not provided', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
      },
    });

    const [payload] = send.mock.calls[0];
    expect(payload).not.toHaveProperty('headers');
  });
});

describe('send-batch-emails custom headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'email_1' }, { id: 'email_2' }] },
      error: null,
    });
  });

  it('passes per-email headers through to the SDK batch payload', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-batch-emails',
      arguments: {
        emails: [
          {
            from: 'Acme <onboarding@resend.dev>',
            to: ['foo@example.com'],
            subject: 'hello',
            text: 'one',
            headers: {
              'X-Entity-Ref-ID': 'batch-1',
            },
          },
          {
            from: 'Acme <onboarding@resend.dev>',
            to: ['bar@example.com'],
            subject: 'hello',
            text: 'two',
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    expect(batchSend).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          to: ['foo@example.com'],
          headers: {
            'X-Entity-Ref-ID': 'batch-1',
          },
        }),
        expect.objectContaining({
          to: ['bar@example.com'],
        }),
      ],
      undefined,
    );
    const [, secondEmail] = batchSend.mock.calls[0][0];
    expect(secondEmail).not.toHaveProperty('headers');
  });
});

describe('share-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    share.mockResolvedValue({
      data: {
        object: 'email',
        id: 'email_1',
        url: 'https://resend.com/share/abc123',
      },
      error: null,
    });
  });

  it('shares an email and returns the share URL', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'share-email',
      arguments: { id: 'email_1' },
    });

    expect(result.isError).toBeFalsy();
    expect(share).toHaveBeenCalledWith('email_1', undefined);
    expect(textOf(result)).toContain('https://resend.com/share/abc123');
  });

  it('passes expiresIn through to the SDK when provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'share-email',
      arguments: { id: 'email_1', expiresIn: '1h 30m' },
    });

    expect(result.isError).toBeFalsy();
    expect(share).toHaveBeenCalledWith('email_1', { expiresIn: '1h 30m' });
  });

  it('passes an empty expiresIn through to the SDK instead of dropping it', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'share-email',
      arguments: { id: 'email_1', expiresIn: '' },
    });

    expect(share).toHaveBeenCalledWith('email_1', { expiresIn: '' });
  });

  it('surfaces SDK errors', async () => {
    share.mockResolvedValue({
      data: null,
      error: { name: 'not_found', message: 'Email not found' },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'share-email',
      arguments: { id: 'missing_email' },
    });

    expect(result.isError).toBe(true);
  });
});

describe('email-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metrics.mockResolvedValue({
      data: {
        object: 'metrics',
        start_date: '2026-07-01T00:00:00.000Z',
        end_date: '2026-07-08T00:00:00.000Z',
        metrics: ['sent', 'delivered'],
        dimensions: [],
        granularity: 'daily',
        totals: { sent: 100, delivered: 95 },
      },
      error: null,
    });
  });

  it('retrieves metrics with no options', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'email-metrics',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(metrics).toHaveBeenCalledWith({
      startDate: undefined,
      endDate: undefined,
      timezone: undefined,
      granularity: undefined,
      metrics: undefined,
      dimensions: undefined,
      domainId: undefined,
      emailId: undefined,
      broadcastId: undefined,
    });
    expect(textOf(result)).toContain('sent: 100');
  });

  it('passes filters and dimensions through to the SDK', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'email-metrics',
      arguments: {
        startDate: '2026-07-01',
        endDate: '2026-07-08',
        dimensions: ['period', 'broadcast'],
        broadcastId: ['b1'],
      },
    });

    expect(metrics).toHaveBeenCalledWith({
      startDate: '2026-07-01',
      endDate: '2026-07-08',
      timezone: undefined,
      granularity: undefined,
      metrics: undefined,
      dimensions: ['period', 'broadcast'],
      domainId: undefined,
      emailId: undefined,
      broadcastId: ['b1'],
    });
  });

  it('rejects the email and broadcast dimensions combined, without calling the SDK', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'email-metrics',
      arguments: { dimensions: ['email', 'broadcast'] },
    });

    expect(result.isError).toBeTruthy();
    expect(metrics).not.toHaveBeenCalled();
  });

  it('rejects the broadcast dimension combined with emailId, without calling the SDK', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'email-metrics',
      arguments: { dimensions: ['broadcast'], emailId: ['e1'] },
    });

    expect(result.isError).toBeTruthy();
    expect(metrics).not.toHaveBeenCalled();
  });

  it('rejects emailId and broadcastId combined, without calling the SDK', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'email-metrics',
      arguments: { emailId: ['e1'], broadcastId: ['b1'] },
    });

    expect(result.isError).toBeTruthy();
    expect(metrics).not.toHaveBeenCalled();
  });

  it('includes the breakdown rows when dimensions are requested', async () => {
    metrics.mockResolvedValue({
      data: {
        object: 'metrics',
        start_date: '2026-07-01T00:00:00.000Z',
        end_date: '2026-07-08T00:00:00.000Z',
        metrics: ['sent'],
        dimensions: ['broadcast'],
        granularity: 'daily',
        totals: { sent: 100 },
        data: [
          {
            broadcast_id: 'b1',
            broadcast_name: 'July Newsletter',
            sent: 100,
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'email-metrics',
      arguments: { dimensions: ['broadcast'] },
    });

    expect(textOf(result)).toContain('July Newsletter');
    expect(textOf(result)).toContain('sent: 100');
  });

  it('surfaces SDK errors', async () => {
    metrics.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid start_date' },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'email-metrics',
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });
});
