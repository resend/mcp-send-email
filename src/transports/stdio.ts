import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { Resend } from 'resend';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';

export async function runStdio(
  resend: Resend,
  options: ServerOptions,
  apiKey: string,
): Promise<void> {
  serveStdio(() => createMcpServer(resend, options, apiKey), {
    legacy: 'serve',
    onerror: (error) => console.error('stdio connection error:', error),
  });
  console.error('Resend MCP Server running on stdio');
}
