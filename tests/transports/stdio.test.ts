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
    await runStdio(resend, { replierEmailAddresses: [] }, 're_test_key');
    const { createMcpServer } = await import('../../src/server.js');
    expect(createMcpServer).toHaveBeenCalledWith(
      resend,
      { senderEmailAddress: undefined, replierEmailAddresses: [] },
      're_test_key',
    );
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('passes sender and repliers to server', async () => {
    const resend = {} as Resend;
    await runStdio(
      resend,
      {
        senderEmailAddress: 'x@r.dev',
        replierEmailAddresses: ['a@x.com', 'b@x.com'],
      },
      're_test_key',
    );
    const { createMcpServer } = await import('../../src/server.js');
    expect(createMcpServer).toHaveBeenCalledWith(
      resend,
      {
        senderEmailAddress: 'x@r.dev',
        replierEmailAddresses: ['a@x.com', 'b@x.com'],
      },
      're_test_key',
    );
  });

  it('rejects when server.connect rejects', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connect failed'));
    const resend = {} as Resend;
    await expect(
      runStdio(resend, { replierEmailAddresses: [] }, 're_test_key'),
    ).rejects.toThrow('connect failed');
  });
});
