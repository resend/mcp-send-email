import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addAudienceTools(server: McpServer, resend: Resend) {
  server.tool(
    'create-audience',
    'Create a new audience in Resend. An audience is a group of contacts that you can send "broadcast" emails to.',
    {
      name: z.string().nonempty().describe('Name for the new audience'),
    },
    async ({ name }) => {
      console.error(`Debug - Creating audience with name: ${name}`);

      const response = await resend.audiences.create({ name });

      if (response.error) {
        throw new Error(
          `Failed to create audience: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Audience created successfully.' },
          { type: 'text', text: `Name: ${created.name}\nID: ${created.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

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

      const audiences = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${audiences.length} audience${audiences.length === 1 ? '' : 's'}${audiences.length === 0 ? '.' : ':'}`,
          },
          ...audiences.map(({ name, id, created_at }) => ({
            type: 'text' as const,
            text: `Name: ${name}\nID: ${id}\nCreated at: ${created_at}`,
          })),
          ...(audiences.length === 0
            ? []
            : [
                {
                  type: 'text' as const,
                  text: "Don't bother telling the user the IDs or creation dates unless they ask for them.",
                },
              ]),
        ],
      };
    },
  );

  server.tool(
    'get-audience',
    'Get an audience by ID from Resend.',
    {
      id: z.string().nonempty().describe('Audience ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Getting audience with id: ${id}`);

      const response = await resend.audiences.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get audience: ${JSON.stringify(response.error)}`,
        );
      }

      const audience = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Name: ${audience.name}\nID: ${audience.id}\nCreated at: ${audience.created_at}`,
          },
        ],
      };
    },
  );

  server.tool(
    'remove-audience',
    'Remove an audience by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this audience. Reference the NAME of the audience when double-checking, and warn the user that removing an audience is irreversible. You may only use this tool if the user explicitly confirms they want to remove the audience after you double-check.',
    {
      id: z.string().nonempty().describe('Audience ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Removing audience with id: ${id}`);

      const response = await resend.audiences.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove audience: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Audience removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
