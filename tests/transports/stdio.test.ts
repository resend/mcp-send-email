import type { Resend } from 'resend';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStdio } from '../../src/transports/stdio.js';

const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/server.js', () => ({
  createMcpServer: vi.fn(() => ({
    connect: mockConnect,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(() => ({})),
}));

describe('runStdio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates server and connects transport', async () => {
    const resend = {} as Resend;
    await runStdio(resend, { replierEmailAddresses: [] });
    const { createMcpServer } = await import('../../src/server.js');
    expect(createMcpServer).toHaveBeenCalledWith(resend, {
      senderEmailAddress: undefined,
      replierEmailAddresses: [],
    });
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('passes sender and repliers to server', async () => {
    const resend = {} as Resend;
    await runStdio(resend, {
      senderEmailAddress: 'x@r.dev',
      replierEmailAddresses: ['a@x.com', 'b@x.com'],
    });
    const { createMcpServer } = await import('../../src/server.js');
    expect(createMcpServer).toHaveBeenCalledWith(resend, {
      senderEmailAddress: 'x@r.dev',
      replierEmailAddresses: ['a@x.com', 'b@x.com'],
    });
  });

  it('rejects when server.connect rejects', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connect failed'));
    const resend = {} as Resend;
    await expect(
      runStdio(resend, { replierEmailAddresses: [] }),
    ).rejects.toThrow('connect failed');
  });
});
