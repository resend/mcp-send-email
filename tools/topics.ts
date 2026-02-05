import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addTopicTools(server: McpServer, resend: Resend) {
  server.tool(
    'create-topic',
    'Create a new topic in Resend. Topics allow contacts to manage their subscription preferences for different types of emails.',
    {
      name: z
        .string()
        .nonempty()
        .max(50)
        .describe('Topic name (max 50 characters)'),
      defaultSubscription: z
        .enum(['opt_in', 'opt_out'])
        .describe(
          'Default subscription preference for new contacts. Cannot be modified after creation.',
        ),
      description: z
        .string()
        .max(200)
        .optional()
        .describe('Topic description (max 200 characters)'),
    },
    async ({ name, defaultSubscription, description }) => {
      console.error(`Debug - Creating topic with name: ${name}`);

      const response = await resend.topics.create({
        name,
        defaultSubscription,
        ...(description && { description }),
      });

      if (response.error) {
        throw new Error(
          `Failed to create topic: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Topic created successfully.' },
          { type: 'text', text: `Name: ${name}\nID: ${created.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.tool(
    'list-topics',
    'List all topics from Resend. This tool is useful for getting topic IDs to use with other tools like send-email.',
    {},
    async () => {
      console.error('Debug - Listing topics');

      const response = await resend.topics.list();

      if (response.error) {
        throw new Error(
          `Failed to list topics: ${JSON.stringify(response.error)}`,
        );
      }

      const topics = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${topics.length} topic${topics.length === 1 ? '' : 's'}${topics.length === 0 ? '.' : ':'}`,
          },
          ...topics.map((topic) => {
            const t = topic as unknown as {
              default_subscription?: string;
              visibility?: string;
            };
            const defaultSub =
              topic.defaultSubscription ?? t.default_subscription;
            const visibility = t.visibility;
            return {
              type: 'text' as const,
              text: `Name: ${topic.name}\nID: ${topic.id}\nDescription: ${topic.description || '(none)'}\nDefault subscription: ${defaultSub}\nVisibility: ${visibility ?? '(unknown)'}`,
            };
          }),
          ...(topics.length === 0
            ? []
            : [
                {
                  type: 'text' as const,
                  text: "Don't bother telling the user the IDs unless they ask for them.",
                },
              ]),
        ],
      };
    },
  );

  server.tool(
    'get-topic',
    'Get a topic by ID from Resend.',
    {
      id: z.string().nonempty().describe('Topic ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Getting topic with id: ${id}`);

      const response = await resend.topics.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get topic: ${JSON.stringify(response.error)}`,
        );
      }

      const topic = response.data;
      const t = topic as unknown as {
        default_subscription?: string;
        visibility?: string;
      };
      const defaultSub = topic.defaultSubscription ?? t.default_subscription;
      const visibility = t.visibility;
      return {
        content: [
          {
            type: 'text',
            text: `Name: ${topic.name}\nID: ${topic.id}\nDescription: ${topic.description || '(none)'}\nDefault subscription: ${defaultSub}\nVisibility: ${visibility ?? '(unknown)'}\nCreated at: ${topic.created_at}`,
          },
        ],
      };
    },
  );

  server.tool(
    'update-topic',
    'Update an existing topic in Resend. Note: defaultSubscription cannot be modified after creation.',
    {
      id: z.string().nonempty().describe('Topic ID'),
      name: z
        .string()
        .nonempty()
        .max(50)
        .optional()
        .describe('New topic name (max 50 characters)'),
      description: z
        .string()
        .max(200)
        .optional()
        .describe('New topic description (max 200 characters)'),
    },
    async ({ id, name, description }) => {
      console.error(`Debug - Updating topic with id: ${id}`);

      const response = await resend.topics.update({
        id,
        ...(name && { name }),
        ...(description && { description }),
      });

      if (response.error) {
        throw new Error(
          `Failed to update topic: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Topic updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.tool(
    'remove-topic',
    'Remove a topic by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this topic. Reference the NAME of the topic when double-checking, and warn the user that removing a topic is irreversible. You may only use this tool if the user explicitly confirms they want to remove the topic after you double-check.',
    {
      id: z.string().nonempty().describe('Topic ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Removing topic with id: ${id}`);

      const response = await resend.topics.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove topic: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Topic removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
