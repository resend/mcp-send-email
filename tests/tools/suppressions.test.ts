import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSuppressionTools } from '../../src/tools/suppressions.js';

const add = vi.fn();
const list = vi.fn();
const get = vi.fn();
const remove = vi.fn();
const batchAdd = vi.fn();
const batchRemove = vi.fn();

const resend = {
  suppressions: {
    add,
    list,
    get,
    remove,
    batch: { add: batchAdd, remove: batchRemove },
  },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addSuppressionTools(server, resend);
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

const entry = {
  object: 'suppression',
  id: 'sup_1',
  email: 'blocked@test.dev',
  origin: 'manual',
  source_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('suppression tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all tools', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('create-suppression');
    expect(names).toContain('list-suppressions');
    expect(names).toContain('get-suppression');
    expect(names).toContain('remove-suppression');
    expect(names).toContain('create-batch-suppressions');
    expect(names).toContain('remove-batch-suppressions');
  });
});

describe('create-suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    add.mockResolvedValue({
      data: { object: 'suppression', id: 'sup_1' },
      error: null,
    });
  });

  it('suppresses an email', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-suppression',
      arguments: { email: 'blocked@test.dev' },
    });
    expect(add).toHaveBeenCalledWith({ email: 'blocked@test.dev' });
    expect(textOf(result as never)).toContain('Suppression created');
    expect(textOf(result as never)).toContain('sup_1');
  });

  it('surfaces SDK errors', async () => {
    add.mockResolvedValueOnce({ error: { message: 'nope' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-suppression',
      arguments: { email: 'blocked@test.dev' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to create suppression');
  });
});

describe('list-suppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({
      data: { object: 'list', has_more: false, data: [entry] },
      error: null,
    });
  });

  it('lists suppressions with origin and email', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: {},
    });
    expect(list).toHaveBeenCalledTimes(1);
    const text = textOf(result as never);
    expect(text).toContain('Found 1 suppression(s)');
    expect(text).toContain('blocked@test.dev');
    expect(text).toContain('manual');
  });

  it('forwards limit and origin filter to the SDK', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'list-suppressions',
      arguments: { limit: 25, origin: 'bounce' },
    });
    expect(list).toHaveBeenCalledWith({ limit: 25, origin: 'bounce' });
  });

  it('errors when both after and before are provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: { after: 'a', before: 'b' },
    });
    expect(result.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });

  it('reports when there are no suppressions', async () => {
    list.mockResolvedValueOnce({
      data: { object: 'list', has_more: false, data: [] },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: {},
    });
    expect(textOf(result as never)).toContain('No suppressions found.');
  });
});

describe('get-suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: entry, error: null });
  });

  it('gets a suppression by id or email', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-suppression',
      arguments: { idOrEmail: 'blocked@test.dev' },
    });
    expect(get).toHaveBeenCalledWith('blocked@test.dev');
    expect(textOf(result as never)).toContain('blocked@test.dev');
  });
});

describe('remove-suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue({
      data: { object: 'suppression', id: 'sup_1', deleted: true },
      error: null,
    });
  });

  it('removes a suppression by id or email', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-suppression',
      arguments: { idOrEmail: 'sup_1' },
    });
    expect(remove).toHaveBeenCalledWith('sup_1');
    expect(textOf(result as never)).toContain('Suppression removed');
  });
});

describe('create-batch-suppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchAdd.mockResolvedValue({
      data: {
        data: [
          { object: 'suppression', id: 'sup_1' },
          { object: 'suppression', id: 'sup_2' },
        ],
      },
      error: null,
    });
  });

  it('suppresses multiple emails', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-batch-suppressions',
      arguments: { emails: ['a@test.dev', 'b@test.dev'] },
    });
    expect(batchAdd).toHaveBeenCalledWith({
      emails: ['a@test.dev', 'b@test.dev'],
    });
    expect(textOf(result as never)).toContain('Suppressed 2 address(es).');
  });
});

describe('remove-batch-suppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchRemove.mockResolvedValue({
      data: {
        data: [{ object: 'suppression', id: 'sup_1', deleted: true }],
      },
      error: null,
    });
  });

  it('removes by emails', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-batch-suppressions',
      arguments: { emails: ['a@test.dev'] },
    });
    expect(batchRemove).toHaveBeenCalledWith({ emails: ['a@test.dev'] });
    expect(textOf(result as never)).toContain('Removed 1 suppression(s).');
  });

  it('removes by ids', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'remove-batch-suppressions',
      arguments: { ids: ['sup_1'] },
    });
    expect(batchRemove).toHaveBeenCalledWith({ ids: ['sup_1'] });
  });

  it('errors when both emails and ids are provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-batch-suppressions',
      arguments: { emails: ['a@test.dev'], ids: ['sup_1'] },
    });
    expect(result.isError).toBe(true);
    expect(batchRemove).not.toHaveBeenCalled();
  });

  it('errors when neither emails nor ids are provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-batch-suppressions',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(batchRemove).not.toHaveBeenCalled();
  });
});
