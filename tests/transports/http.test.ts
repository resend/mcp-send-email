import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { runHttp } from '../../src/transports/http.js';

/**
 * GET a path with an explicit Host header. Uses node:http because fetch/undici
 * forbids overriding the Host header, which is exactly what we need to assert
 * the DNS-rebinding (Host) validation behaviour.
 */
function getWithHost(
  port: number,
  path: string,
  host: string,
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { host } },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

vi.mock('../../src/server.js', () => ({
  createMcpServer: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('runHttp', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts server and resolves when listening', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0);
    expect(server).toBeDefined();
    server.close();
  });

  it('GET /health returns 200 with status ok', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });

    server.close();
  });

  it('POST / without a Bearer token returns 401 (routes to MCP transport)', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      }),
    });

    expect(res.status).toBe(401);

    server.close();
  });

  it('POST /mcp without a Bearer token returns 401', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      }),
    });

    expect(res.status).toBe(401);

    server.close();
  });

  it('rejects a non-localhost Host header by default (localhost protection on)', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;

    const res = await getWithHost(port, '/health', 'evil.example.com');
    expect(res.status).toBe(403);

    server.close();
  });

  it("accepts any Host header when host is '0.0.0.0'", async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0, {
      host: '0.0.0.0',
    });
    const { port } = server.address() as AddressInfo;

    const res = await getWithHost(
      port,
      '/health',
      'remote-mcp.apps.example.com',
    );
    expect(res.status).toBe(200);

    server.close();
  });

  it('accepts only hosts in the allowedHosts list', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0, {
      allowedHosts: ['mcp.example.com'],
    });
    const { port } = server.address() as AddressInfo;

    const allowed = await getWithHost(port, '/health', 'mcp.example.com');
    expect(allowed.status).toBe(200);

    const denied = await getWithHost(port, '/health', 'other.example.com');
    expect(denied.status).toBe(403);

    server.close();
  });
});

describe('dual-era protocol support', () => {
  let runHttpWithPingTool: typeof runHttp;

  beforeAll(async () => {
    vi.doMock('../../src/server.js', () => ({
      createMcpServer: vi.fn(() => {
        const server = new McpServer({ name: 'test', version: '0.0.0' });
        server.registerTool('ping', { description: 'test tool' }, async () => ({
          content: [{ type: 'text', text: 'pong' }],
        }));
        return server;
      }),
    }));
    vi.resetModules();
    ({ runHttp: runHttpWithPingTool } = await import(
      '../../src/transports/http.js'
    ));
  });

  afterAll(() => {
    vi.doUnmock('../../src/server.js');
    vi.resetModules();
  });

  async function connectedClient(
    port: number,
    era: 'legacy' | 'modern',
  ): Promise<Client> {
    const client = new Client(
      { name: `test-client-${era}`, version: '0.0.0' },
      era === 'modern'
        ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
        : {},
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
      { requestInit: { headers: { Authorization: 'Bearer re_test_key' } } },
    );
    await client.connect(transport);
    return client;
  }

  it('a legacy client can list and call tools via the sessionful path', async () => {
    const server = await runHttpWithPingTool({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;
    const client = await connectedClient(port, 'legacy');

    expect(client.getProtocolEra()).toBe('legacy');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('ping');
    const result = await client.callTool({ name: 'ping', arguments: {} });
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);

    await client.close();
    server.close();
  });

  it('a modern (2026-07-28) client can list and call tools via the stateless path', async () => {
    const server = await runHttpWithPingTool({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;
    const client = await connectedClient(port, 'modern');

    expect(client.getProtocolEra()).toBe('modern');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('ping');
    const result = await client.callTool({ name: 'ping', arguments: {} });
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);

    await client.close();
    server.close();
  });

  it('a modern request issues no mcp-session-id (stateless)', async () => {
    const server = await runHttpWithPingTool({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/list',
        Authorization: 'Bearer re_test_key',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });

    expect(res.headers.get('mcp-session-id')).toBeNull();

    server.close();
  });

  it('a modern request without a Bearer token returns 401', async () => {
    const server = await runHttpWithPingTool({ replierEmailAddresses: [] }, 0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/list',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });

    expect(res.status).toBe(401);

    server.close();
  });
});
