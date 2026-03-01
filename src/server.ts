import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import packageJson from '../package.json' with { type: 'json' };
import {
  addApiKeyTools,
  addBroadcastTools,
  addCodeModeTools,
  addContactPropertyTools,
  addContactTools,
  addDomainTools,
  addEmailTools,
  addSegmentTools,
  addTopicTools,
  addWebhookTools,
} from './tools/index.js';
import type { ServerOptions } from './types.js';

export type { ServerOptions } from './types.js';

export function createMcpServer(
  resend: Resend,
  options: ServerOptions,
): McpServer {
  const { apiKey, senderEmailAddress, replierEmailAddresses, codeModeOnly } =
    options;
  const server = new McpServer({
    name: 'resend',
    version: packageJson.version,
  });
  addCodeModeTools(server, {
    apiKey,
    senderEmailAddress,
    replierEmailAddresses,
  });
  if (!codeModeOnly) {
    addApiKeyTools(server, resend);
    addBroadcastTools(server, resend, {
      senderEmailAddress,
      replierEmailAddresses,
    });
    addContactPropertyTools(server, resend);
    addContactTools(server, resend);
    addDomainTools(server, resend);
    addEmailTools(server, resend, {
      senderEmailAddress,
      replierEmailAddresses,
    });
    addSegmentTools(server, resend);
    addTopicTools(server, resend);
    addWebhookTools(server, resend);
  }
  return server;
}
