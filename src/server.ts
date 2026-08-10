import { McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import packageJson from '../package.json' with { type: 'json' };
import { DashboardClient } from './lib/dashboard-client.js';
import { ResendEditorClient } from './lib/resend-editor-client.js';
import {
  addApiKeyTools,
  addAutomationTools,
  addBroadcastTools,
  addContactImportTools,
  addContactPropertyTools,
  addContactTools,
  addDomainTools,
  addEditorTools,
  addEmailApprovalTools,
  addEmailTools,
  addEventTools,
  addLogTools,
  addOAuthGrantTools,
  addSegmentTools,
  addSuppressionTools,
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
  {
    sharedEmailApprovalStore = false,
  }: { sharedEmailApprovalStore?: boolean } = {},
): McpServer {
  const { senderEmailAddress, replierEmailAddresses = [] } = options;
  const server = new McpServer({
    name: 'resend',
    version: packageJson.version,
  });

  const dashboard = new DashboardClient();
  const apiClient = new ResendEditorClient(apiKey);

  const { withEditorSession } = addEditorTools(server, dashboard, apiClient);
  addApiKeyTools(server, resend);
  addAutomationTools(server, resend);
  addBroadcastTools(server, resend, apiClient, {
    senderEmailAddress,
    replierEmailAddresses,
    withEditorSession,
  });
  addContactImportTools(server, resend);
  addContactPropertyTools(server, resend);
  addContactTools(server, resend);
  addDomainTools(server, resend);
  addEmailApprovalTools(server, resend, {
    senderEmailAddress,
    replierEmailAddresses,
    sharedStoreKey: sharedEmailApprovalStore ? apiKey : undefined,
  });
  addEmailTools(server, resend, { senderEmailAddress, replierEmailAddresses });
  addEventTools(server, resend);
  addLogTools(server, resend);
  addOAuthGrantTools(server, resend);
  addSegmentTools(server, resend);
  addSuppressionTools(server, resend);
  addTemplateTools(server, resend, apiClient, { withEditorSession });
  addTopicTools(server, resend);
  addWebhookTools(server, resend);
  return server;
}
