import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';

export function addAudienceTools(server: McpServer, resend: Resend) {
  server.tool(
    'list-audiences',
    'List all audiences from Resend. This tool is useful for getting the audience ID to help the user find the audience they want to use for other tools. If you need an audience ID, you MUST use this tool to get all available audiences and then ask the user to select the audience they want to use.',
    {},
    async () => {
      console.error('Debug - Listing audiences');

      const response = await resend.audiences.list();

      if (response.error) {
        throw new Error(
          `Failed to list audiences: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Audiences found: ${JSON.stringify(response.data)}`,
          },
        ],
      };
    },
  );
}
