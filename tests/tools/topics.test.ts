import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addTopicTools } from '../../src/tools/topics.js';

const update = vi.fn();

const resend = {
  topics: { update },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addTopicTools(server, resend);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe('topic tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({ data: { id: 'topic_1' }, error: null });
  });

  it('passes empty description through update-topic', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-topic',
      arguments: { id: 'topic_1', description: '' },
    });

    expect(result.isError).toBeFalsy();
    expect(update).toHaveBeenCalledWith({ id: 'topic_1', description: '' });
  });
});
