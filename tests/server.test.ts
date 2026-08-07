import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Resend } from 'resend';
import { afterEach, describe, expect, it } from 'vitest';
import { stopSharedEmailApprovalStoresForTest } from '../src/lib/shared-email-approval-store.js';
import { createMcpServer } from '../src/server.js';

afterEach(async () => {
  await stopSharedEmailApprovalStoresForTest();
});

async function connectUiClient(server: ReturnType<typeof createMcpServer>) {
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    {
      capabilities: {
        extensions: {
          'io.modelcontextprotocol/ui': {
            mimeTypes: ['text/html;profile=mcp-app'],
          },
        },
      },
    },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe('createMcpServer', () => {
  it('returns an MCP server with connect method', () => {
    const resend = {} as Resend;
    const server = createMcpServer(resend, {
      senderEmailAddress: 'from@test.dev',
      replierEmailAddresses: ['reply@test.dev'],
    });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });

  it('accepts empty sender and repliers', () => {
    const resend = {} as Resend;
    const server = createMcpServer(resend, {
      replierEmailAddresses: [],
    });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });

  it('registers Email Studio through the server factory', async () => {
    const server = createMcpServer(
      {} as Resend,
      { senderEmailAddress: 'from@test.dev', replierEmailAddresses: [] },
      're_test',
    );
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('prepare-email-approval');
  });

  it('does not share Email Studio drafts between independent server sessions', async () => {
    const options = {
      senderEmailAddress: 'Acme <hello@acme.com>',
      replierEmailAddresses: ['support@acme.com'],
    };
    const firstClient = await connectUiClient(
      createMcpServer({} as Resend, options, 're_same_key'),
    );
    const secondClient = await connectUiClient(
      createMcpServer({} as Resend, options, 're_same_key'),
    );
    const prepared = await firstClient.callTool({
      name: 'prepare-email-approval',
      arguments: { to: ['ada@example.com'], subject: 'Private', text: 'Hi' },
    });
    const draft = prepared.structuredContent as {
      draftId: string;
      revisionId: string;
    };

    const result = await secondClient.callTool({
      name: 'approve-email-approval',
      arguments: { draftId: draft.draftId, revisionId: draft.revisionId },
    });

    expect(result.isError).toBe(true);
    expect(
      result.content
        .filter((content) => content.type === 'text')
        .map((content) => content.text)
        .join('\n'),
    ).toContain('not found');
  });
});
