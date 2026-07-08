import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEmailTools } from '../../src/tools/emails.js';

const get = vi.fn();
const list = vi.fn();
const receivingGet = vi.fn();
const receivingList = vi.fn();

const resend = {
  emails: {
    get,
    list,
    receiving: {
      get: receivingGet,
      list: receivingList,
    },
  },
} as unknown as Resend;

const messageId = '<lc2vu8.gpa9o4@email.example.com>';

const sentEmail = {
  object: 'email',
  id: '67d9bcdb-5a02-42d7-8da9-0d6feea18cff',
  message_id: messageId,
  to: ['zeno@resend.com'],
  from: 'bu@resend.com',
  created_at: '2023-04-07T23:13:52.669661+00:00',
  subject: 'Hello',
  last_event: 'delivered',
  text: 'hello',
  html: null,
  cc: null,
  bcc: null,
  reply_to: null,
  scheduled_at: null,
};

const receivedEmail = {
  object: 'email',
  id: 're_123',
  message_id: messageId,
  to: ['inbox@resend.dev'],
  from: 'sender@example.com',
  created_at: '2023-04-07T23:13:52.669661+00:00',
  subject: 'Reply',
  text: 'reply body',
  html: null,
  cc: null,
  bcc: null,
  reply_to: null,
  received_for: ['inbox@resend.dev'],
  headers: null,
  attachments: [],
};

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addEmailTools(server, resend, {
    senderEmailAddress: 'from@test.dev',
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

describe('email message_id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes message_id in get-email output', async () => {
    get.mockResolvedValueOnce({ data: sentEmail, error: null });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-email',
      arguments: { id: sentEmail.id },
    });
    const text = textOf(result);
    expect(text).toContain(`Message ID: ${messageId}`);
  });

  it('includes message_id in list-emails output', async () => {
    list.mockResolvedValueOnce({
      data: { data: [sentEmail], has_more: false, object: 'list' },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-emails',
      arguments: {},
    });
    const text = textOf(result);
    expect(text).toContain(`Message ID: ${messageId}`);
  });

  it('includes message_id in get-received-email output', async () => {
    receivingGet.mockResolvedValueOnce({ data: receivedEmail, error: null });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-received-email',
      arguments: { id: receivedEmail.id },
    });
    const text = textOf(result);
    expect(text).toContain(`Message ID: ${messageId}`);
  });

  it('includes message_id in list-received-emails output', async () => {
    receivingList.mockResolvedValueOnce({
      data: { data: [receivedEmail], has_more: false, object: 'list' },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-received-emails',
      arguments: {},
    });
    const text = textOf(result);
    expect(text).toContain(`Message ID: ${messageId}`);
  });
});
