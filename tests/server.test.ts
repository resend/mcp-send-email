import type { Resend } from 'resend';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

describe('createMcpServer', () => {
  it('returns an MCP server with connect method', () => {
    const resend = {} as Resend;
    const server = createMcpServer(resend, {
      senderEmailAddress: 'from@test.dev',
      replierEmailAddresses: ['reply@test.dev'],
    });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });

  it('accepts empty sender and repliers', () => {
    const resend = {} as Resend;
    const server = createMcpServer(resend, {
      replierEmailAddresses: [],
    });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });
});
