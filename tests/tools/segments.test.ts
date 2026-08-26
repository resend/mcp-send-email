import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSegmentTools } from '../../src/tools/segments.js';

const create = vi.fn();
const list = vi.fn();
const get = vi.fn();
const update = vi.fn();
const remove = vi.fn();

const resend = {
  segments: { create, list, get, update, remove },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addSegmentTools(server, resend);
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

describe('segment tools', () => {
  it('registers the five segment tools', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('create-segment');
    expect(names).toContain('list-segments');
    expect(names).toContain('get-segment');
    expect(names).toContain('update-segment');
    expect(names).toContain('remove-segment');
  });

  it('requires user confirmation in the removal tool description', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'remove-segment');
    expect(tool?.description).toContain('double-check with the user');
  });
});

describe('update-segment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames a segment and returns the ID', async () => {
    update.mockResolvedValue({
      data: { object: 'segment', id: 'seg_1' },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-segment',
      arguments: { id: 'seg_1', name: 'New name' },
    });

    expect(update).toHaveBeenCalledWith('seg_1', { name: 'New name' });
    const text = textOf(result as never);
    expect(text).toContain('Segment updated successfully.');
    expect(text).toContain('ID: seg_1');
  });

  it('rejects a missing name', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-segment',
      arguments: { id: 'seg_1', name: '' },
    });

    expect(result.isError).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('surfaces API errors', async () => {
    update.mockResolvedValueOnce({
      error: { message: 'segment not found' },
      data: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-segment',
      arguments: { id: 'seg_1', name: 'New name' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to update segment');
  });
});
