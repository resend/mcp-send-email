import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResendEditorClient } from '../../src/lib/resend-editor-client.js';
import { addBroadcastTools } from '../../src/tools/broadcasts.js';

const clickedLinks = vi.fn();
const recipients = vi.fn();

const resend = {
  broadcasts: { clickedLinks, recipients },
} as unknown as Resend;

const apiClient = {} as ResendEditorClient;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addBroadcastTools(server, resend, apiClient, {
    replierEmailAddresses: [],
    withEditorSession: async (_conn, fn) => fn(),
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

describe('list-broadcast-recipients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a type and passes it through to the SDK', async () => {
    recipients.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'opened' },
    });
    expect(recipients).toHaveBeenCalledWith('bc_1', { type: 'opened' });
  });

  it('extracts the broadcast ID from a dashboard URL', async () => {
    recipients.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: {
        broadcastId: 'https://resend.com/broadcasts/bc_1',
        type: 'sent',
      },
    });
    expect(recipients).toHaveBeenCalledWith('bc_1', { type: 'sent' });
  });

  it('formats a plain recipient row', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: false,
        data: [{ id: 'rcp_1', contact_id: 'con_1', email: 'a@b.com' }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'delivered' },
    });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 recipient:');
    expect(text).toContain('Email: a@b.com');
    expect(text).toContain('ID: rcp_1');
    expect(text).toContain('Contact ID: con_1');
  });

  it('omits contact ID when null', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: false,
        data: [{ id: 'rcp_1', contact_id: null, email: 'a@b.com' }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent' },
    });
    expect(textOf(result as never)).not.toContain('Contact ID');
  });

  it('includes the count for opened recipients', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: false,
        data: [{ id: 'rcp_1', contact_id: null, email: 'a@b.com', count: 3 }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'opened' },
    });
    expect(textOf(result as never)).toContain('Count: 3');
  });

  it('includes bounce type for bounced recipients', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: false,
        data: [
          {
            id: 'rcp_1',
            contact_id: null,
            email: 'a@b.com',
            bounce_type: 'permanent',
          },
        ],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: {
        broadcastId: 'bc_1',
        type: 'bounced',
        bounceType: 'permanent',
      },
    });
    expect(recipients).toHaveBeenCalledWith('bc_1', {
      type: 'bounced',
      bounceType: 'permanent',
    });
    expect(textOf(result as never)).toContain('Bounce type: permanent');
  });

  it('omits bounce type when it is null', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: false,
        data: [
          {
            id: 'rcp_1',
            contact_id: null,
            email: 'a@b.com',
            bounce_type: null,
          },
        ],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'bounced' },
    });
    expect(textOf(result as never)).not.toContain('Bounce type:');
  });

  it('rejects bounceType when type is not bounced', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: {
        broadcastId: 'bc_1',
        type: 'sent',
        bounceType: 'permanent',
      },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      '"bounceType" is only valid when type is "bounced"',
    );
    expect(recipients).not.toHaveBeenCalled();
  });

  it('includes clicked links for clicked recipients', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: false,
        data: [
          {
            id: 'rcp_1',
            contact_id: null,
            email: 'a@b.com',
            count: 2,
            clicked_links: [{ url: 'https://example.com', clicks: 2 }],
          },
        ],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'clicked' },
    });
    const text = textOf(result as never);
    expect(text).toContain('Count: 2');
    expect(text).toContain('Clicked links: https://example.com (2 clicks)');
  });

  it('forwards the email filter', async () => {
    recipients.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent', email: 'a@b.com' },
    });
    expect(recipients).toHaveBeenCalledWith('bc_1', {
      type: 'sent',
      email: 'a@b.com',
    });
  });

  it('forwards the after cursor with limit', async () => {
    recipients.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: {
        broadcastId: 'bc_1',
        type: 'sent',
        after: 'rcp_1',
        limit: 10,
      },
    });
    expect(recipients).toHaveBeenCalledWith('bc_1', {
      limit: 10,
      after: 'rcp_1',
      type: 'sent',
    });
  });

  it('forwards the before cursor', async () => {
    recipients.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent', before: 'rcp_9' },
    });
    expect(recipients).toHaveBeenCalledWith('bc_1', {
      before: 'rcp_9',
      type: 'sent',
    });
  });

  it('rejects using both after and before', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: {
        broadcastId: 'bc_1',
        type: 'sent',
        after: 'a',
        before: 'b',
      },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Cannot use both');
    expect(recipients).not.toHaveBeenCalled();
  });

  it('rejects an empty-string after cursor', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent', after: '' },
    });
    expect(result.isError).toBe(true);
    expect(recipients).not.toHaveBeenCalled();
  });

  it('rejects an empty-string before cursor', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent', before: '' },
    });
    expect(result.isError).toBe(true);
    expect(recipients).not.toHaveBeenCalled();
  });

  it('reports when none are found', async () => {
    recipients.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent' },
    });
    expect(textOf(result as never)).toContain('No recipients found.');
  });

  it('shows a has_more hint', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: true,
        data: [{ id: 'rcp_1', contact_id: null, email: 'a@b.com' }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent' },
    });
    expect(textOf(result as never)).toContain('Use the "after" parameter');
  });

  it('shows a backward-pagination has_more hint when paging with before', async () => {
    recipients.mockResolvedValue({
      data: {
        has_more: true,
        data: [{ id: 'rcp_1', contact_id: null, email: 'a@b.com' }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_1', type: 'sent', before: 'rcp_9' },
    });
    expect(textOf(result as never)).toContain('Use the "before" parameter');
  });

  it('surfaces SDK errors', async () => {
    recipients.mockResolvedValueOnce({ error: { message: 'not found' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-broadcast-recipients',
      arguments: { broadcastId: 'bc_404', type: 'sent' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Failed to list broadcast recipients',
    );
  });
});
