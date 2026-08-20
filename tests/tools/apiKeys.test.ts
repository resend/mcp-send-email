import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addApiKeyTools } from '../../src/tools/apiKeys.js';

const create = vi.fn();
const list = vi.fn();
const update = vi.fn();
const remove = vi.fn();

const resend = {
  apiKeys: { create, list, update, remove },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addApiKeyTools(server, resend);
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

describe('api key tools', () => {
  it('registers the four api key tools', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('create-api-key');
    expect(names).toContain('list-api-keys');
    expect(names).toContain('update-api-key');
    expect(names).toContain('remove-api-key');
  });

  it('only marks list-api-keys as read-only', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName['list-api-keys']?.annotations?.readOnlyHint).toBe(true);
    expect(byName['create-api-key']?.annotations?.readOnlyHint).toBeFalsy();
    expect(byName['update-api-key']?.annotations?.readOnlyHint).toBeFalsy();
    expect(byName['remove-api-key']?.annotations?.readOnlyHint).toBeFalsy();
  });
});

describe('create-api-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({
      data: { id: 'key_1', name: 'My Key', token: 're_token_123' },
    });
  });

  it('creates an API key and returns the token', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-api-key',
      arguments: { name: 'My Key' },
    });
    expect(create).toHaveBeenCalledWith({ name: 'My Key' });
    const text = textOf(result as never);
    expect(text).toContain('API key created successfully.');
    expect(text).toContain('Token: re_token_123');
  });

  it('passes through permission and domainId', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'create-api-key',
      arguments: {
        name: 'Sending Key',
        permission: 'sending_access',
        domainId: 'dom_1',
      },
    });
    expect(create).toHaveBeenCalledWith({
      name: 'Sending Key',
      permission: 'sending_access',
      domain_id: 'dom_1',
    });
  });

  it('surfaces SDK errors', async () => {
    create.mockResolvedValueOnce({ error: { message: 'nope' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-api-key',
      arguments: { name: 'My Key' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to create API key');
  });
});

describe('list-api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists API keys', async () => {
    list.mockResolvedValue({
      data: {
        has_more: false,
        data: [{ name: 'My Key', id: 'key_1', created_at: '2026-01-01' }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-api-keys',
      arguments: {},
    });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 API key:');
    expect(text).toContain('Name: My Key');
    expect(text).toContain('ID: key_1');
  });

  it('reports when none are found', async () => {
    list.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-api-keys',
      arguments: {},
    });
    expect(textOf(result as never)).toContain('No API keys found.');
  });

  it('rejects using both after and before', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-api-keys',
      arguments: { after: 'key_1', before: 'key_2' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Cannot use both');
    expect(list).not.toHaveBeenCalled();
  });
});

describe('update-api-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({ data: { object: 'api_key', id: 'key_1' } });
  });

  it('renames an API key by ID', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-api-key',
      arguments: { id: 'key_1', name: 'Renamed Key' },
    });
    expect(update).toHaveBeenCalledWith('key_1', { name: 'Renamed Key' });
    const text = textOf(result as never);
    expect(text).toContain('API key updated successfully.');
    expect(text).toContain('ID: key_1');
  });

  it('rejects a missing name', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-api-key',
      arguments: { id: 'key_1', name: '' },
    });
    expect(result.isError).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('surfaces SDK errors', async () => {
    update.mockResolvedValueOnce({ error: { message: 'not found' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-api-key',
      arguments: { id: 'key_404', name: 'Renamed Key' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to update API key');
  });
});

describe('remove-api-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue({ data: null });
  });

  it('removes an API key by ID', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-api-key',
      arguments: { id: 'key_1' },
    });
    expect(remove).toHaveBeenCalledWith('key_1');
    expect(textOf(result as never)).toContain('API key removed successfully.');
  });

  it('surfaces SDK errors', async () => {
    remove.mockResolvedValueOnce({ error: { message: 'not found' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-api-key',
      arguments: { id: 'key_404' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to remove API key');
  });

  it('requires user confirmation in the tool description', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'remove-api-key');
    expect(tool?.description).toContain('double-check with the user');
  });
});
