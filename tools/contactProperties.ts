import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addContactPropertyTools(server: McpServer, resend: Resend) {
  server.tool(
    'create-contact-property',
    'Create a new contact property in Resend. A contact property is a custom attribute (e.g. "company_name", "plan_tier") that can be attached to contacts.',
    {
      key: z
        .string()
        .nonempty()
        .describe(
          'The property key. Max 50 characters, only alphanumeric characters and underscores allowed.',
        ),
      type: z
        .enum(['string', 'number'])
        .describe('The property type: "string" or "number".'),
      fallbackValue: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          'Default value when the property is not set for a contact. Must match the specified type.',
        ),
    },
    async ({ key, type, fallbackValue }) => {
      console.error(
        `Debug - Creating contact property with key: ${key}, type: ${type}`,
      );

      const response = await resend.contactProperties.create({
        key,
        type,
        fallbackValue,
      } as Parameters<typeof resend.contactProperties.create>[0]);

      if (response.error) {
        throw new Error(
          `Failed to create contact property: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Contact property created successfully.' },
          {
            type: 'text',
            text: `Key: ${key}\nType: ${type}\nID: ${created.id}`,
          },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.tool(
    'list-contact-properties',
    "List all contact properties from Resend. This tool is useful for getting property IDs and seeing which custom attributes are configured. If you need a contact property ID, you MUST use this tool to get all available properties and then ask the user to select the one they want. Don't bother telling the user the IDs or creation dates unless they ask for them.",
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of contact properties to retrieve. Default: 20, Max: 100, Min: 1',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'Contact property ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
        ),
      before: z
        .string()
        .optional()
        .describe(
          'Contact property ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
        ),
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing contact properties with limit: ${limit}, after: ${after}, before: ${before}`,
      );

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.contactProperties.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list contact properties: ${JSON.stringify(response.error)}`,
        );
      }

      const properties = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (properties.length === 0) {
        return {
          content: [{ type: 'text', text: 'No contact properties found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${properties.length} contact propert${properties.length === 1 ? 'y' : 'ies'}:`,
          },
          ...properties.map(({ key, type, fallbackValue, id, createdAt }) => ({
            type: 'text' as const,
            text: `Key: ${key}\nType: ${type}\nFallback value: ${fallbackValue ?? 'none'}\nID: ${id}\nCreated at: ${createdAt}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more contact properties available. Use the "after" parameter with the last ID to retrieve more.',
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
    'get-contact-property',
    'Get a contact property by ID from Resend.',
    {
      contactPropertyId: z.string().nonempty().describe('Contact property ID'),
    },
    async ({ contactPropertyId }) => {
      console.error(
        `Debug - Getting contact property with id: ${contactPropertyId}`,
      );

      const response = await resend.contactProperties.get(contactPropertyId);

      if (response.error) {
        throw new Error(
          `Failed to get contact property: ${JSON.stringify(response.error)}`,
        );
      }

      const property = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Key: ${property.key}\nType: ${property.type}\nFallback value: ${property.fallbackValue ?? 'none'}\nID: ${property.id}\nCreated at: ${property.createdAt}`,
          },
        ],
      };
    },
  );

  server.tool(
    'update-contact-property',
    'Update an existing contact property in Resend. Only the fallback value can be changed — the key and type cannot be modified after creation.',
    {
      contactPropertyId: z.string().nonempty().describe('Contact property ID'),
      fallbackValue: z
        .union([z.string(), z.number(), z.null()])
        .describe(
          'New default value for the property. Pass null to remove the fallback value. Must match the property type.',
        ),
    },
    async ({ contactPropertyId, fallbackValue }) => {
      console.error(
        `Debug - Updating contact property with id: ${contactPropertyId}`,
      );

      const response = await resend.contactProperties.update({
        id: contactPropertyId,
        fallbackValue,
      });

      if (response.error) {
        throw new Error(
          `Failed to update contact property: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Contact property updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.tool(
    'remove-contact-property',
    'Remove a contact property by ID from Resend. Before using this tool, you MUST double-check with the user that they want to remove this contact property. Reference the KEY of the property when double-checking, and warn the user that removing a contact property is irreversible and will remove the property from all contacts. You may only use this tool if the user explicitly confirms they want to remove the contact property after you double-check.',
    {
      contactPropertyId: z.string().nonempty().describe('Contact property ID'),
    },
    async ({ contactPropertyId }) => {
      console.error(
        `Debug - Removing contact property with id: ${contactPropertyId}`,
      );

      const response = await resend.contactProperties.remove(contactPropertyId);

      if (response.error) {
        throw new Error(
          `Failed to remove contact property: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Contact property removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
