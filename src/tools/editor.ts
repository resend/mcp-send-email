import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DashboardClient } from '../lib/dashboard-client.js';
import type { ResendApiClient } from '../lib/resend-api-client.js';

interface EditorConnection {
  resource_type: 'broadcast' | 'template';
  resource_id: string;
  agent_name?: string;
}

export function addEditorTools(
  server: McpServer,
  dashboard: DashboardClient,
  apiClient: ResendApiClient,
) {
  let activeConnection: EditorConnection | null = null;

  /**
   * Connect to the editor for a resource, perform an async action, then
   * disconnect. Used internally by broadcast tools so the AI avatar shows
   * up automatically whenever content is pushed.
   */
  async function withEditorSession<T>(
    conn: EditorConnection,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!apiClient) {
      return fn();
    }

    try {
      await apiClient.createEditorConnection(conn);
      activeConnection = conn;
    } catch {
      // best-effort — proceed even if connect fails
    }

    try {
      return await fn();
    } finally {
      try {
        await apiClient.deleteEditorConnection(conn);
      } catch {
        // best-effort
      }
      activeConnection = null;
    }
  }

  server.registerTool(
    'get-tiptap-schema',
    {
      title: 'Get TipTap Email Schema',
      description: `**Purpose:** Retrieve the TipTap JSON schema reference for creating editable email content that works in the Resend dashboard editor.

**When to use:**
- Before using create-broadcast or update-broadcast with the \`content\` parameter
- When you need to understand the available TipTap node types and structure

**Returns:** A prompt describing the full TipTap JSON schema, including all node types, marks, and attributes.`,
      inputSchema: {},
    },
    async () => {
      if (!dashboard) {
        throw new Error(
          'Dashboard integration not configured. Provide a Resend API key to enable TipTap schema access.',
        );
      }

      const { data, version } = await dashboard.getTiptapSchema();

      return {
        content: [
          {
            type: 'text',
            text: `TipTap Schema Reference (version: ${version}):\n\n${data}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'connect-to-editor',
    {
      title: 'Connect to Editor',
      description: `**Purpose:** Show agent presence in the Resend dashboard editor. Users will see an agent avatar while connected.

**When to use:**
- Before making edits to a broadcast or template via the dashboard API
- To signal to dashboard users that an AI agent is working on the content

**Returns:** Connection token and room ID.`,
      inputSchema: {
        resource_type: z
          .enum(['broadcast', 'template'])
          .describe('Type of resource to connect to'),
        resource_id: z.string().nonempty().describe('ID of the resource'),
        agent_name: z
          .string()
          .optional()
          .describe('Display name for the agent avatar'),
      },
    },
    async ({ resource_type, resource_id, agent_name }) => {
      if (!apiClient) {
        throw new Error('API client not configured. Provide a Resend API key.');
      }

      const result = await apiClient.createEditorConnection({
        resource_type,
        resource_id,
        agent_name,
      });

      activeConnection = { resource_type, resource_id, agent_name };

      return {
        content: [
          { type: 'text', text: 'Connected to editor successfully.' },
          { type: 'text', text: `Room ID: ${result.room_id}` },
          { type: 'text', text: `Token: ${result.apiKeyId}` },
        ],
      };
    },
  );

  server.registerTool(
    'disconnect-from-editor',
    {
      title: 'Disconnect from Editor',
      description:
        'Remove agent presence from the Resend dashboard editor. Call this when done editing.',
      inputSchema: {},
    },
    async () => {
      if (!apiClient) {
        throw new Error('API client not configured. Provide a Resend API key.');
      }

      if (!activeConnection) {
        return {
          content: [
            {
              type: 'text',
              text: 'No active editor connection to disconnect.',
            },
          ],
        };
      }

      await apiClient.deleteEditorConnection({
        resource_type: activeConnection.resource_type,
        resource_id: activeConnection.resource_id,
        agent_name: activeConnection.agent_name,
      });

      activeConnection = null;

      return {
        content: [
          { type: 'text', text: 'Disconnected from editor successfully.' },
        ],
      };
    },
  );

  return { getActiveConnection: () => activeConnection, withEditorSession };
}
