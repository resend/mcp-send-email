import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DashboardClient } from '../lib/dashboard-client.js';
import type { ResendEditorClient } from '../lib/resend-editor-client.js';
import { extractIdFromUrl } from '../lib/url-parser.js';

interface EditorConnection {
  resource_type: 'broadcast' | 'template';
  resource_id: string;
  agent_name?: string;
}

export function addEditorTools(
  server: McpServer,
  dashboard: DashboardClient,
  apiClient: ResendEditorClient,
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
    'get-tiptap-json-content',
    {
      title: 'Get TipTap JSON Content',
      description: `**Purpose:** Retrieve the existing TipTap JSON content of a broadcast or template, optionally bundled with the TipTap schema reference.

**When to use:**
- **Always call this before compose-broadcast or compose-template** to fetch the current document state — even if you expect it to be empty, the resource may have content set via the dashboard
- When the user asks to edit, tweak, or modify existing email content
- To inspect the current TipTap structure of a resource

**Returns:** The TipTap JSON content object for the resource, and optionally the TipTap schema. Use the content as the base for modifications, then pass the updated JSON to compose-broadcast or compose-template.

**Tip:** Set include_schema to true to get both the existing content and the schema in one call.`,
      inputSchema: {
        resource_type: z
          .enum(['broadcast', 'template'])
          .describe('Type of resource to fetch content for'),
        resource_id: z
          .string()
          .nonempty()
          .describe(
            'The broadcast ID (UUID), template identifier (UUID or alias), or Resend dashboard URL (e.g. https://resend.com/broadcasts/<id> or https://resend.com/templates/<id>)',
          ),
        include_schema: z
          .boolean()
          .default(true)
          .describe(
            'Returns the TipTap schema reference alongside the content. Required for producing valid TipTap JSON. Set to false only if you already have the schema.',
          ),
      },
    },
    async ({ resource_type, resource_id: rawResourceId, include_schema }) => {
      const resource_id = extractIdFromUrl(
        rawResourceId,
        resource_type === 'broadcast' ? 'broadcasts' : 'templates',
      );
      const contentParts: Array<{ type: 'text'; text: string }> = [];

      const result = await apiClient.getEditorContent(
        resource_type,
        resource_id,
      );

      contentParts.push({
        type: 'text',
        text: `Existing TipTap JSON content:\n\n${JSON.stringify(result.content, null, 2)}`,
      });

      if (include_schema) {
        try {
          const { data, version } = await dashboard.getTiptapSchema();
          contentParts.push({
            type: 'text',
            text: `\n\nTipTap Schema Reference (version: ${version}):\n\n${data}`,
          });
        } catch (err) {
          contentParts.push({
            type: 'text',
            text: `\n\n**Warning:** Failed to fetch TipTap schema: ${err instanceof Error ? err.message : String(err)}. The content above is still valid — retry get-tiptap-json-content with include_schema: true if you need the schema.`,
          });
        }
      }

      return { content: contentParts };
    },
  );

  server.registerTool(
    'connect-to-editor',
    {
      title: 'Connect to Editor',
      description: `**Purpose:** Show agent presence in the Resend dashboard editor. Users will see an agent avatar while connected.

**When to use:**
- To signal to dashboard users that an AI agent is working on the content
- **Not needed before compose-broadcast or compose-template** — those tools handle editor connection automatically. Only call this for manual editor presence outside of compose workflows.

**Returns:** Connection token and room ID.`,
      inputSchema: {
        resource_type: z
          .enum(['broadcast', 'template'])
          .describe('Type of resource to connect to'),
        resource_id: z
          .string()
          .nonempty()
          .describe(
            'ID of the resource or Resend dashboard URL (e.g. https://resend.com/broadcasts/<id> or https://resend.com/templates/<id>)',
          ),
        agent_name: z
          .string()
          .optional()
          .describe('Display name for the agent avatar'),
      },
    },
    async ({ resource_type, resource_id: rawResourceId, agent_name }) => {
      if (!apiClient) {
        throw new Error('API client not configured. Provide a Resend API key.');
      }

      const resource_id = extractIdFromUrl(
        rawResourceId,
        resource_type === 'broadcast' ? 'broadcasts' : 'templates',
      );

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
