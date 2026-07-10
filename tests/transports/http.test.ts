import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
