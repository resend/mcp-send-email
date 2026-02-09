import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addSegmentTools(server: McpServer, resend: Resend) {
  server.tool(
    'create-segment',
    'Create a new segment in Resend. A segment is a group of contacts that can be used to target specific broadcasts.',
    {
      name: z.string().nonempty().describe('Name for the new segment'),
    },
    async ({ name }) => {
      console.error(`Debug - Creating segment with name: ${name}`);

      const response = await resend.segments.create({ name });

      if (response.error) {
        throw new Error(
          `Failed to create segment: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Segment created successfully.' },
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
    'list-segments',
    "List all segments from Resend. This tool is useful for getting the segment ID to help the user find the segment they want to use for other tools. If you need a segment ID, you MUST use this tool to get all available segments and then ask the user to select the segment they want to use. Don't bother telling the user the IDs or creation dates unless they ask for them.",
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of segments to retrieve. Default: 20, Max: 100, Min: 1',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'Segment ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
        ),
      before: z
        .string()
        .optional()
        .describe(
          'Segment ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
        ),
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing segments with limit: ${limit}, after: ${after}, before: ${before}`,
      );

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.segments.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list segments: ${JSON.stringify(response.error)}`,
        );
      }

      const segments = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (segments.length === 0) {
        return {
          content: [{ type: 'text', text: 'No segments found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${segments.length} segment${segments.length === 1 ? '' : 's'}:`,
          },
          ...segments.map(({ name, id, created_at }) => ({
            type: 'text' as const,
            text: `Name: ${name}\nID: ${id}\nCreated at: ${created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more segments available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
          {
            type: 'text' as const,
            text: "Don't bother telling the user the IDs or creation dates unless they ask for them.",
          },
        ],
      };
    },
  );

  server.tool(
    'get-segment',
    'Get a segment by ID from Resend.',
    {
      id: z.string().nonempty().describe('Segment ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Getting segment with id: ${id}`);

      const response = await resend.segments.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get segment: ${JSON.stringify(response.error)}`,
        );
      }

      const segment = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Name: ${segment.name}\nID: ${segment.id}\nCreated at: ${segment.created_at}`,
          },
        ],
      };
    },
  );

  server.tool(
    'remove-segment',
    'Remove a segment by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this segment. Reference the NAME of the segment when double-checking, and warn the user that removing a segment is irreversible. You may only use this tool if the user explicitly confirms they want to remove the segment after you double-check.',
    {
      id: z.string().nonempty().describe('Segment ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Removing segment with id: ${id}`);

      const response = await resend.segments.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove segment: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Segment removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
