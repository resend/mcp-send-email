import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import packageJson from '../package.json' with { type: 'json' };
import { DashboardClient } from './lib/dashboard-client.js';
import { ResendApiClient } from './lib/resend-api-client.js';
import {
  addApiKeyTools,
  addBroadcastTools,
  addContactPropertyTools,
  addContactTools,
  addDomainTools,
  addEditorTools,
  addEmailTools,
  addLogTools,
  addSegmentTools,
  addTemplateTools,
  addTopicTools,
  addWebhookTools,
} from './tools/index.js';
import type { ServerOptions } from './types.js';

export type { ServerOptions } from './types.js';

export function createMcpServer(
  resend: Resend,
  options: ServerOptions,
  apiKey: string,
): McpServer {
  const { senderEmailAddress, replierEmailAddresses } = options;
  const server = new McpServer({
    name: 'resend',
    version: packageJson.version,
  });

  const dashboard = new DashboardClient();
  const apiClient = new ResendApiClient(apiKey);

  addEditorTools(server, dashboard, apiClient);
  addApiKeyTools(server, resend);
  addBroadcastTools(server, resend, apiClient, {
    senderEmailAddress,
    replierEmailAddresses,
  });
  addContactPropertyTools(server, resend);
  addContactTools(server, resend);
  addDomainTools(server, resend);
  addEmailTools(server, resend, { senderEmailAddress, replierEmailAddresses });
  addLogTools(server, resend);
  addSegmentTools(server, resend);
  addTemplateTools(server, resend, apiClient);
  addTopicTools(server, resend);
  addWebhookTools(server, resend);
  return server;
}
