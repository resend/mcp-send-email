import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHttp } from '../../src/transports/http.js';

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

  it('binds to 127.0.0.1 by default', async () => {
    const server = await runHttp({ replierEmailAddresses: [] }, 0);
    const address = server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
    server.close();
  });

  it('returns 401 with consistent auth error shape when missing Bearer token', async () => {
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
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
    expect(body).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32002,
        message: 'Unauthorized: provide Authorization: Bearer <resend-api-key>',
        data: { type: 'auth_error', status: 401 },
      },
      id: null,
    });

    server.close();
  });

  it('returns 403 for disallowed Origin before auth processing', async () => {
    const server = await runHttp(
      { replierEmailAddresses: [] },
      0,
      '127.0.0.1',
      ['https://allowed.example.com'],
    );
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://blocked.example.com',
        Authorization: 'Bearer re_test',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32003,
        message: 'Forbidden: origin is not allowed',
        data: { type: 'forbidden', status: 403 },
      },
      id: null,
    });

    server.close();
  });

  it('handles CORS preflight for allowed Origin', async () => {
    const server = await runHttp(
      { replierEmailAddresses: [] },
      0,
      '127.0.0.1',
      ['https://allowed.example.com'],
    );
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://allowed.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://allowed.example.com',
    );

    server.close();
  });
});
