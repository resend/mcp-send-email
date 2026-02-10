import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Resend } from 'resend';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';

export async function runStdio(
  resend: Resend,
  options: ServerOptions,
): Promise<void> {
  const server = createMcpServer(resend, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Email sending service MCP Server running on stdio');
}
