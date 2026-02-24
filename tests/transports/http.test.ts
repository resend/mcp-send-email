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
});
