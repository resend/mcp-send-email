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
    await expect(
      runHttp({ replierEmailAddresses: [] }, 0),
    ).resolves.toBeUndefined();
  });
});
