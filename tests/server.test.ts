import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Resend } from 'resend';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

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
});
