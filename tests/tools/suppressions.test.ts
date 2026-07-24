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
  email: 'a@b.com',
  origin: 'bounce',
  source_id: 'em_1',
  created_at: '2026-01-01T00:00:00Z',
};

describe('suppression tools', () => {
  it('registers the six suppression tools', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('add-suppression');
    expect(names).toContain('list-suppressions');
    expect(names).toContain('get-suppression');
    expect(names).toContain('remove-suppression');
    expect(names).toContain('batch-add-suppressions');
    expect(names).toContain('batch-remove-suppressions');
  });

  it('requires user confirmation in the removal tool descriptions', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    for (const name of ['remove-suppression', 'batch-remove-suppressions']) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.description).toContain('double-check with the user');
    }
  });
});

describe('add-suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    add.mockResolvedValue({ data: { object: 'suppression', id: 'sup_1' } });
  });

  it('adds an email and returns the suppression ID', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'add-suppression',
      arguments: { email: 'a@b.com' },
    });
    expect(add).toHaveBeenCalledWith({ email: 'a@b.com' });
    const text = textOf(result as never);
    expect(text).toContain('Suppression added successfully.');
    expect(text).toContain('ID: sup_1');
  });

  it('rejects an invalid email', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'add-suppression',
      arguments: { email: 'not-an-email' },
    });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it('surfaces SDK errors', async () => {
    add.mockResolvedValueOnce({ error: { message: 'nope' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'add-suppression',
      arguments: { email: 'a@b.com' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to add suppression');
  });
});

describe('list-suppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes origin and limit, and shows a has_more hint', async () => {
    list.mockResolvedValue({ data: { has_more: true, data: [entry] } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: { origin: 'bounce', limit: 5 },
    });
    expect(list).toHaveBeenCalledWith({ limit: 5, origin: 'bounce' });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 suppression:');
    expect(text).toContain('Email: a@b.com');
    expect(text).toContain('Origin: bounce');
    expect(text).toContain('Source ID: em_1');
    expect(text).toContain('There are more suppressions available');
  });

  it('reports when none are found', async () => {
    list.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: {},
    });
    expect(list).toHaveBeenCalledWith(undefined);
    expect(textOf(result as never)).toContain('No suppressions found.');
  });

  it('omits source_id when null', async () => {
    list.mockResolvedValue({
      data: {
        has_more: false,
        data: [{ ...entry, origin: 'manual', source_id: null }],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: {},
    });
    expect(textOf(result as never)).not.toContain('Source ID');
  });

  it('forwards the after cursor', async () => {
    list.mockResolvedValue({ data: { has_more: false, data: [entry] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-suppressions',
      arguments: { after: 'sup_1', limit: 10 },
    });
    expect(list).toHaveBeenCalledWith({ limit: 10, after: 'sup_1' });
  });

  it('forwards the before cursor', async () => {
    list.mockResolvedValue({ data: { has_more: false, data: [entry] } });
    const client = await makeClient();
    await client.callTool({
      name: 'list-suppressions',
      arguments: { before: 'sup_9' },
    });
    expect(list).toHaveBeenCalledWith({ limit: undefined, before: 'sup_9' });
  });

  it('rejects using both after and before', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-suppressions',
      arguments: { after: 'a', before: 'b' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Cannot use both');
    expect(list).not.toHaveBeenCalled();
  });
});

describe('get-suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: entry });
  });

  it('gets by ID or email and formats the entry', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-suppression',
      arguments: { idOrEmail: 'a@b.com' },
    });
    expect(get).toHaveBeenCalledWith('a@b.com');
    const text = textOf(result as never);
    expect(text).toContain('Email: a@b.com');
    expect(text).toContain('ID: sup_1');
    expect(text).toContain('Origin: bounce');
    expect(text).toContain('Created at: 2026-01-01T00:00:00Z');
  });
});

describe('remove-suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue({
      data: { object: 'suppression', id: 'sup_1', deleted: true },
    });
  });

  it('removes by ID or email', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-suppression',
      arguments: { idOrEmail: 'sup_1' },
    });
    expect(remove).toHaveBeenCalledWith('sup_1');
    const text = textOf(result as never);
    expect(text).toContain('Suppression removed successfully.');
    expect(text).toContain('ID: sup_1');
  });

  it('surfaces SDK errors', async () => {
    remove.mockResolvedValueOnce({ error: { message: 'not found' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-suppression',
      arguments: { idOrEmail: 'sup_404' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to remove suppression');
  });
});

describe('batch-add-suppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchAdd.mockResolvedValue({
      data: {
        data: [
          { object: 'suppression', id: 'sup_1' },
          { object: 'suppression', id: 'sup_2' },
        ],
      },
    });
  });

  it('adds multiple emails and lists the resulting IDs', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'batch-add-suppressions',
      arguments: { emails: ['a@b.com', 'c@d.com'] },
    });
    expect(batchAdd).toHaveBeenCalledWith({ emails: ['a@b.com', 'c@d.com'] });
    const text = textOf(result as never);
    expect(text).toContain('Added 2 suppressions successfully.');
    expect(text).toContain('Email: a@b.com\nID: sup_1');
    expect(text).toContain('Email: c@d.com\nID: sup_2');
  });

  it('rejects an empty emails array', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'batch-add-suppressions',
      arguments: { emails: [] },
    });
    expect(result.isError).toBe(true);
    expect(batchAdd).not.toHaveBeenCalled();
  });
});

describe('batch-remove-suppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchRemove.mockResolvedValue({
      data: {
        data: [{ object: 'suppression', id: 'sup_1', deleted: true }],
      },
    });
  });

  it('removes by emails', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'batch-remove-suppressions',
      arguments: { emails: ['a@b.com'] },
    });
    expect(batchRemove).toHaveBeenCalledWith({ emails: ['a@b.com'] });
    const text = textOf(result as never);
    expect(text).toContain('Removed 1 suppression successfully.');
    expect(text).toContain('ID: sup_1');
  });

  it('removes by ids', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'batch-remove-suppressions',
      arguments: { ids: ['sup_1'] },
    });
    expect(batchRemove).toHaveBeenCalledWith({ ids: ['sup_1'] });
  });

  it('rejects using both emails and ids', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'batch-remove-suppressions',
      arguments: { emails: ['a@b.com'], ids: ['sup_1'] },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Cannot use both');
    expect(batchRemove).not.toHaveBeenCalled();
  });

  it('rejects when neither emails nor ids is provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'batch-remove-suppressions',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Either "emails" or "ids" must be provided.',
    );
    expect(batchRemove).not.toHaveBeenCalled();
  });
});
