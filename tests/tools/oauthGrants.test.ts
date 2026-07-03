import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addOAuthGrantTools } from '../../src/tools/oauthGrants.js';

const list = vi.fn();
const revoke = vi.fn();

const resend = {
  oauthGrants: { list, revoke },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addOAuthGrantTools(server, resend);
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

const grant = {
  id: 'grant_1',
  client_id: 'client_1',
  scopes: ['emails:send'],
  created_at: '2026-01-01T00:00:00.000Z',
  revoked_at: null,
  revoked_reason: null,
  client: { name: 'Resend CLI', logo_uri: null },
};

describe('oauth grant tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers both tools', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('list-oauth-grants');
    expect(names).toContain('revoke-oauth-grant');
  });
});

describe('list-oauth-grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          grant,
          {
            ...grant,
            id: 'grant_2',
            scopes: ['emails:send', 'domains:read'],
            revoked_at: '2026-01-02T00:00:00.000Z',
            revoked_reason: 'revoked_from_api',
          },
        ],
      },
      error: null,
    });
  });

  it('lists grants with client, scopes, and status', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-oauth-grants',
      arguments: {},
    });

    expect(list).toHaveBeenCalledTimes(1);
    const text = textOf(result as never);
    expect(text).toContain('Found 2 OAuth grants');
    expect(text).toContain('App: Resend CLI');
    expect(text).toContain('emails:send, domains:read');
    expect(text).toContain('active');
    expect(text).toContain('revoked (2026-01-02T00:00:00.000Z)');
  });

  it('forwards the limit to the SDK', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'list-oauth-grants',
      arguments: { limit: 25 },
    });
    expect(list).toHaveBeenCalledWith({ limit: 25 });
  });

  it('errors when both after and before are provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-oauth-grants',
      arguments: { after: 'a', before: 'b' },
    });
    expect(result.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });

  it('errors when a cursor is an empty string', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-oauth-grants',
      arguments: { after: '' },
    });
    expect(result.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });

  it('reports when there are no grants', async () => {
    list.mockResolvedValueOnce({
      data: { object: 'list', has_more: false, data: [] },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-oauth-grants',
      arguments: {},
    });
    expect(textOf(result as never)).toContain('No OAuth grants found.');
  });

  it('surfaces SDK errors', async () => {
    list.mockResolvedValueOnce({ error: { message: 'nope' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-oauth-grants',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to list OAuth grants');
  });
});

describe('revoke-oauth-grant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revoke.mockResolvedValue({
      data: {
        object: 'oauth_grant',
        id: 'grant_1',
        revoked_at: '2026-01-02T00:00:00.000Z',
        revoked_reason: 'revoked_from_api',
      },
      error: null,
    });
  });

  it('revokes a grant by id', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'revoke-oauth-grant',
      arguments: { id: 'grant_1' },
    });

    expect(revoke).toHaveBeenCalledWith('grant_1');
    expect(textOf(result as never)).toContain('OAuth grant revoked');
  });

  it('surfaces SDK errors', async () => {
    revoke.mockResolvedValueOnce({ error: { message: 'not found' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'revoke-oauth-grant',
      arguments: { id: 'grant_1' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to revoke OAuth grant');
  });
});
