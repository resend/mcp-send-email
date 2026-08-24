import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addBroadcastTools } from '../../src/tools/broadcasts.js';

const clickedLinks = vi.fn();

const resend = {
  broadcasts: { clickedLinks },
} as unknown as Resend;

const apiClient = {} as never;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addBroadcastTools(server, resend, apiClient, {
    replierEmailAddresses: [],
    withEditorSession: (_conn, fn) => fn(),
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

describe('list-broadcast-clicked-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clickedLinks.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          {
            id: 'b2Zmc2V0OjA',
            url: 'https://resend.com/pricing',
            clicks: 42,
            unique_clicks: 30,
          },
        ],
      },
      error: null,
    });
  });

  it('registers the tool as read-only', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'list-broadcast-clicked-links');
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it('lists clicked links for a broadcast', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1' },
    });

    expect(clickedLinks).toHaveBeenCalledWith('bc_1', undefined);
    expect(textOf(result as never)).toContain('https://resend.com/pricing');
    expect(textOf(result as never)).toContain('Clicks: 42');
    expect(textOf(result as never)).toContain('Unique clicks: 30');
  });

  it('extracts the id from a dashboard URL', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'https://resend.com/broadcasts/bc_1' },
    });

    expect(clickedLinks).toHaveBeenCalledWith('bc_1', undefined);
  });

  it('passes pagination options', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1', limit: 5, after: 'cursor-1' },
    });

    expect(clickedLinks).toHaveBeenCalledWith('bc_1', {
      limit: 5,
      after: 'cursor-1',
    });
  });

  it('passes before for backward pagination', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1', limit: 5, before: 'cursor-1' },
    });

    expect(clickedLinks).toHaveBeenCalledWith('bc_1', {
      limit: 5,
      before: 'cursor-1',
    });
  });

  it('hints at "after" for more results on a forward page', async () => {
    clickedLinks.mockResolvedValueOnce({
      data: {
        object: 'list',
        has_more: true,
        data: [
          {
            id: 'b2Zmc2V0OjA',
            url: 'https://resend.com/pricing',
            clicks: 42,
            unique_clicks: 30,
          },
        ],
      },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1', after: 'cursor-1' },
    });

    expect(textOf(result as never)).toContain('ID: b2Zmc2V0OjA');
    expect(textOf(result as never)).toContain(
      'Use the "after" parameter with the last cursor',
    );
  });

  it('hints at "before" for more results on a backward page', async () => {
    clickedLinks.mockResolvedValueOnce({
      data: {
        object: 'list',
        has_more: true,
        data: [
          {
            id: 'b2Zmc2V0OjA',
            url: 'https://resend.com/pricing',
            clicks: 42,
            unique_clicks: 30,
          },
        ],
      },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1', before: 'cursor-1' },
    });

    expect(textOf(result as never)).toContain(
      'Use the "before" parameter with the first cursor',
    );
  });

  it('rejects both after and before', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1', after: 'a', before: 'b' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Cannot use both "after" and "before"',
    );
  });

  it('reports when there are no clicked links', async () => {
    clickedLinks.mockResolvedValueOnce({
      data: { object: 'list', has_more: false, data: [] },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1' },
    });

    expect(textOf(result as never)).toContain('No clicked links found');
  });

  it('surfaces SDK errors', async () => {
    clickedLinks.mockResolvedValueOnce({
      data: null,
      error: { name: 'not_found', message: 'Broadcast not found' },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-clicked-links',
      arguments: { broadcastId: 'bc_1' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Failed to list broadcast clicked links',
    );
  });
});
