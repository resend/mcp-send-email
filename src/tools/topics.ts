import type { McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { z } from 'zod';

const CREATE_TOPIC_TOOL = {
  title: 'Create Topic',
  description:
    'Create a new topic in Resend. Topics allow contacts to manage their subscription preferences for different types of emails.',
  inputSchema: {
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
} as const;

const LIST_TOPICS_TOOL = {
  title: 'List Topics',
  annotations: { readOnlyHint: true },
  description:
    'List all topics from Resend. This tool is useful for getting topic IDs to use with other tools like send-email.',
  inputSchema: {},
} as const;

const GET_TOPIC_TOOL = {
  title: 'Get Topic',
  annotations: { readOnlyHint: true },
  description: 'Get a topic by ID from Resend.',
  inputSchema: {
    id: z.string().nonempty().describe('Topic ID'),
  },
} as const;

const UPDATE_TOPIC_TOOL = {
  title: 'Update Topic',
  description:
    'Update an existing topic in Resend. Note: defaultSubscription cannot be modified after creation.',
  inputSchema: {
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
} as const;

const REMOVE_TOPIC_TOOL = {
  title: 'Remove Topic',
  description:
    'Remove a topic by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this topic. Reference the NAME of the topic when double-checking, and warn the user that removing a topic is irreversible. You may only use this tool if the user explicitly confirms they want to remove the topic after you double-check.',
  inputSchema: {
    id: z.string().nonempty().describe('Topic ID'),
  },
} as const;

export function addTopicTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-topic',
    CREATE_TOPIC_TOOL,
    async ({ name, defaultSubscription, description }) => {
      const response = await resend.topics.create({
        name,
        defaultSubscription,
        ...(description !== undefined && { description }),
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
        ],
      };
    },
  );

  server.registerTool('list-topics', LIST_TOPICS_TOOL, async (_args, _ctx) => {
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
            visibility?: string;
          };
          const defaultSub = topic.default_subscription;
          const visibility = t.visibility;
          return {
            type: 'text' as const,
            text: `Name: ${topic.name}\nID: ${topic.id}\nDescription: ${topic.description || '(none)'}\nDefault subscription: ${defaultSub}\nVisibility: ${visibility ?? '(unknown)'}`,
          };
        }),
      ],
    };
  });

  server.registerTool('get-topic', GET_TOPIC_TOOL, async ({ id }) => {
    const response = await resend.topics.get(id);

    if (response.error) {
      throw new Error(`Failed to get topic: ${JSON.stringify(response.error)}`);
    }

    const topic = response.data;
    const t = topic as unknown as {
      visibility?: string;
    };
    const defaultSub = topic.default_subscription;
    const visibility = t.visibility;
    return {
      content: [
        {
          type: 'text',
          text: `Name: ${topic.name}\nID: ${topic.id}\nDescription: ${topic.description || '(none)'}\nDefault subscription: ${defaultSub}\nVisibility: ${visibility ?? '(unknown)'}\nCreated at: ${topic.created_at}`,
        },
      ],
    };
  });

  server.registerTool(
    'update-topic',
    UPDATE_TOPIC_TOOL,
    async ({ id, name, description }) => {
      const response = await resend.topics.update({
        id,
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
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

  server.registerTool('remove-topic', REMOVE_TOPIC_TOOL, async ({ id }) => {
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
  });
}
