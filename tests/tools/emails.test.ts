import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEmailTools } from '../../src/tools/emails.js';

const send = vi.fn();

const resend = {
  emails: { send },
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
    );
    expect(textOf(result)).toContain('Email sent successfully');
  });
});
