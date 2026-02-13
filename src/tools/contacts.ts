import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  GetContactResponse,
  RemoveContactsResponse,
  Resend,
  UpdateContactResponse,
} from 'resend';
import { z } from 'zod';

export function addContactTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-contact',
    {
      title: 'Create Contact',
      description:
        'Create a new contact in Resend. Optionally assign to segments and configure topic subscriptions.',
      inputSchema: {
        email: z.email().describe('Contact email address'),
        firstName: z.string().optional().describe('Contact first name'),
        lastName: z.string().optional().describe('Contact last name'),
        unsubscribed: z
          .boolean()
          .optional()
          .describe('Whether the contact is unsubscribed from all broadcasts'),
        properties: z
          .record(z.string(), z.union([z.string(), z.number(), z.null()]))
          .optional()
          .describe(
            'Custom property key-value pairs for the contact (e.g. { "company_name": "Acme" })',
          ),
        segmentIds: z
          .array(z.string())
          .optional()
          .describe('Array of segment IDs to assign this contact to'),
        topics: z
          .array(
            z.object({
              id: z.string().describe('Topic ID'),
              subscription: z
                .enum(['opt_in', 'opt_out'])
                .describe('Subscription preference for this topic'),
            }),
          )
          .optional()
          .describe('Array of topic subscription configurations'),
      },
    },
    async ({
      email,
      firstName,
      lastName,
      unsubscribed,
      properties,
      segmentIds,
      topics,
    }) => {
      console.error(`Debug - Creating contact with email: ${email}`);

      const response = await resend.contacts.create({
        email,
        firstName,
        lastName,
        unsubscribed,
        properties,
        segments: segmentIds?.map((id) => ({ id })),
        topics,
      });

      if (response.error) {
        throw new Error(
          `Failed to create contact: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Contact created successfully.' },
          { type: 'text', text: `ID: ${created.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'list-contacts',
    {
      title: 'List Contacts',
      description: `**Purpose:** List contacts from Resend. Optionally filter by segment. Use to discover contact IDs or emails.

**NOT for:** Listing segments (use list-segments). Not for listing sent emails (use list-emails) or broadcasts (use list-broadcasts).

**Returns:** For each contact: id, email, first_name, last_name, unsubscribed, created_at.

**When to use:** User asks "who's in this list?", "show contacts", "who did I add?" Don't bother telling the user the IDs, unsubscribe statuses, or creation dates unless they ask for them.`,
      inputSchema: {
        segmentId: z
          .string()
          .optional()
          .describe(
            'Segment ID to filter by. If provided, only contacts in this segment will be returned.',
          ),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of contacts to retrieve. Default: 20, Max: 100, Min: 1',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Contact ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Contact ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
      },
    },
    async ({ segmentId, limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing contacts with segmentId: ${segmentId}, limit: ${limit}, after: ${after}, before: ${before}`,
      );

      const options: Record<string, unknown> = {};
      if (segmentId) options.segmentId = segmentId;
      if (limit !== undefined) options.limit = limit;
      if (after) options.after = after;
      if (before) options.before = before;

      const response = await resend.contacts.list(
        Object.keys(options).length > 0 ? options : undefined,
      );

      if (response.error) {
        throw new Error(
          `Failed to list contacts: ${JSON.stringify(response.error)}`,
        );
      }

      const contacts = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (contacts.length === 0) {
        return {
          content: [{ type: 'text', text: 'No contacts found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${contacts.length} contact${contacts.length === 1 ? '' : 's'}:`,
          },
          ...contacts.map((contact) => {
            const props = (contact as unknown as Record<string, unknown>)
              .properties as Record<string, unknown> | undefined;
            const propsLine =
              props && Object.keys(props).length > 0
                ? `Properties: ${JSON.stringify(props)}`
                : null;
            return {
              type: 'text' as const,
              text: [
                `ID: ${contact.id}`,
                `Email: ${contact.email}`,
                contact.first_name != null &&
                  `First name: ${contact.first_name}`,
                contact.last_name != null && `Last name: ${contact.last_name}`,
                `Unsubscribed: ${contact.unsubscribed}`,
                propsLine,
                `Created at: ${contact.created_at}`,
              ]
                .filter(Boolean)
                .join('\n'),
            };
          }),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more contacts available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
          {
            type: 'text' as const,
            text: "Don't bother telling the user the IDs, unsubscribe statuses, or creation dates unless they ask for them.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'get-contact',
    {
      title: 'Get Contact',
      description: 'Get a contact by ID or email from Resend.',
      inputSchema: {
        id: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
      },
    },
    async ({ id, email }) => {
      console.error(`Debug - Getting contact with id: ${id}, email: ${email}`);

      let response: GetContactResponse;
      if (id) {
        response = await resend.contacts.get({ id });
      } else if (email) {
        response = await resend.contacts.get({ email });
      } else {
        throw new Error(
          'You must provide either `id` or `email` to get a contact.',
        );
      }

      if (response.error) {
        throw new Error(
          `Failed to get contact: ${JSON.stringify(response.error)}`,
        );
      }

      const contact = response.data;
      const props = contact.properties;
      const propsLine =
        props && Object.keys(props).length > 0
          ? `Properties: ${JSON.stringify(props)}`
          : null;
      return {
        content: [
          {
            type: 'text',
            text: [
              `ID: ${contact.id}`,
              `Email: ${contact.email}`,
              contact.first_name != null && `First name: ${contact.first_name}`,
              contact.last_name != null && `Last name: ${contact.last_name}`,
              `Unsubscribed: ${contact.unsubscribed}`,
              propsLine,
              `Created at: ${contact.created_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    'update-contact',
    {
      title: 'Update Contact',
      description: 'Update a contact in Resend (by ID or email).',
      inputSchema: {
        id: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
        firstName: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Contact first name. Pass `null` to remove the contact's first name.",
          ),
        lastName: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Contact last name. Pass `null` to remove the contact's last name.",
          ),
        unsubscribed: z
          .boolean()
          .optional()
          .describe('Whether the contact is unsubscribed from all broadcasts'),
        properties: z
          .record(z.string(), z.union([z.string(), z.number(), z.null()]))
          .optional()
          .describe(
            'Custom property key-value pairs to update (e.g. { "company_name": "Acme" })',
          ),
      },
    },
    async ({ id, email, firstName, lastName, unsubscribed, properties }) => {
      console.error(`Debug - Updating contact with id: ${id}, email: ${email}`);

      const commonOptions = {
        firstName,
        lastName,
        unsubscribed,
        properties,
      };

      let response: UpdateContactResponse;
      if (id) {
        response = await resend.contacts.update({ id, ...commonOptions });
      } else if (email) {
        response = await resend.contacts.update({ email, ...commonOptions });
      } else {
        throw new Error(
          'You must provide either `id` or `email` to update a contact.',
        );
      }

      if (response.error) {
        throw new Error(
          `Failed to update contact: ${JSON.stringify(response.error)}`,
        );
      }

      const updated = response.data;
      return {
        content: [
          { type: 'text', text: 'Contact updated successfully.' },
          { type: 'text', text: `ID: ${updated.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-contact',
    {
      title: 'Remove Contact',
      description:
        "Remove a contact from Resend (by ID or email). Before using this tool, you MUST double-check with the user that they want to remove this contact. Reference the contact's name (if present) and email address when double-checking, and warn the user that removing a contact is irreversible. You may only use this tool if the user explicitly confirms they want to remove the contact after you double-check.",
      inputSchema: {
        id: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
      },
    },
    async ({ id, email }) => {
      console.error(`Debug - Removing contact with id: ${id}, email: ${email}`);

      let response: RemoveContactsResponse;
      if (id) {
        response = await resend.contacts.remove({ id });
      } else if (email) {
        response = await resend.contacts.remove({ email });
      } else {
        throw new Error(
          'You must provide either `id` or `email` to remove a contact.',
        );
      }

      if (response.error) {
        throw new Error(
          `Failed to remove contact: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Contact removed successfully.' },
          { type: 'text', text: `Contact: ${response.data.contact}` },
        ],
      };
    },
  );

  server.registerTool(
    'add-contact-to-segment',
    {
      title: 'Add Contact to Segment',
      description:
        'Add a contact to a segment in Resend (by contact ID or email).',
      inputSchema: {
        contactId: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
        segmentId: z
          .string()
          .nonempty()
          .describe('Segment ID to add the contact to'),
      },
    },
    async ({ contactId, email, segmentId }) => {
      console.error(
        `Debug - Adding contact (id: ${contactId}, email: ${email}) to segment: ${segmentId}`,
      );

      let response;
      if (contactId) {
        response = await resend.contacts.segments.add({ contactId, segmentId });
      } else if (email) {
        response = await resend.contacts.segments.add({ email, segmentId });
      } else {
        throw new Error(
          'You must provide either `contactId` or `email` to add a contact to a segment.',
        );
      }

      if (response.error) {
        throw new Error(
          `Failed to add contact to segment: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Contact added to segment successfully.' },
          { type: 'text', text: `Segment ID: ${response.data.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-contact-from-segment',
    {
      title: 'Remove Contact from Segment',
      description:
        'Remove a contact from a segment in Resend (by contact ID or email). Before using this tool, you MUST double-check with the user that they want to remove the contact from the segment.',
      inputSchema: {
        contactId: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
        segmentId: z
          .string()
          .nonempty()
          .describe('Segment ID to remove the contact from'),
      },
    },
    async ({ contactId, email, segmentId }) => {
      console.error(
        `Debug - Removing contact (id: ${contactId}, email: ${email}) from segment: ${segmentId}`,
      );

      let response;
      if (contactId) {
        response = await resend.contacts.segments.remove({
          contactId,
          segmentId,
        });
      } else if (email) {
        response = await resend.contacts.segments.remove({ email, segmentId });
      } else {
        throw new Error(
          'You must provide either `contactId` or `email` to remove a contact from a segment.',
        );
      }

      if (response.error) {
        throw new Error(
          `Failed to remove contact from segment: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Contact removed from segment successfully.' },
          { type: 'text', text: `Segment ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-contact-segments',
    {
      title: 'List Contact Segments',
      description:
        "List all segments a contact belongs to in Resend (by contact ID or email). Don't bother telling the user the IDs or creation dates unless they ask for them.",
      inputSchema: {
        contactId: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of segments to retrieve. Max: 100, Min: 1. If omitted, all segments are returned.',
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
    },
    async ({ contactId, email, limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      if (!contactId && !email) {
        throw new Error(
          'You must provide either `contactId` or `email` to list contact segments.',
        );
      }

      console.error(
        `Debug - Listing segments for contact (id: ${contactId}, email: ${email})`,
      );

      const contactField = contactId ? { contactId } : { email: email! };

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : {};

      const response = await resend.contacts.segments.list({
        ...contactField,
        ...paginationOptions,
      });

      if (response.error) {
        throw new Error(
          `Failed to list contact segments: ${JSON.stringify(response.error)}`,
        );
      }

      const segments = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (segments.length === 0) {
        return {
          content: [{ type: 'text', text: 'Contact is not in any segments.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Contact is in ${segments.length} segment${segments.length === 1 ? '' : 's'}:`,
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

  server.registerTool(
    'list-contact-topics',
    {
      title: 'List Contact Topics',
      description:
        "List all topic subscriptions for a contact in Resend (by contact ID or email). Don't bother telling the user the IDs unless they ask for them.",
      inputSchema: {
        id: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of topics to retrieve. Default: 20, Max: 100, Min: 1',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Topic ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Topic ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
      },
    },
    async ({ id, email, limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      if (!id && !email) {
        throw new Error(
          'You must provide either `id` or `email` to list contact topics.',
        );
      }

      console.error(
        `Debug - Listing topics for contact (id: ${id}, email: ${email})`,
      );

      const contactField = id ? { id } : { email: email! };

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : {};

      const response = await resend.contacts.topics.list({
        ...contactField,
        ...paginationOptions,
      });

      if (response.error) {
        throw new Error(
          `Failed to list contact topics: ${JSON.stringify(response.error)}`,
        );
      }

      const topics = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (topics.length === 0) {
        return {
          content: [
            { type: 'text', text: 'Contact has no topic subscriptions.' },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Contact has ${topics.length} topic subscription${topics.length === 1 ? '' : 's'}:`,
          },
          ...topics.map(({ name, id, description, subscription }) => ({
            type: 'text' as const,
            text: [
              `Name: ${name}`,
              `Subscription: ${subscription}`,
              description != null && `Description: ${description}`,
              `ID: ${id}`,
            ]
              .filter(Boolean)
              .join('\n'),
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more topics available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
          {
            type: 'text' as const,
            text: "Don't bother telling the user the IDs unless they ask for them.",
          },
        ],
      };
    },
  );

  server.registerTool(
    'update-contact-topics',
    {
      title: 'Update Contact Topics',
      description:
        'Update topic subscriptions for a contact in Resend (by contact ID or email).',
      inputSchema: {
        id: z.string().optional().describe('Contact ID'),
        email: z.email().optional().describe('Contact email address'),
        topics: z
          .array(
            z.object({
              id: z.string().describe('Topic ID'),
              subscription: z
                .enum(['opt_in', 'opt_out'])
                .describe('Subscription preference for this topic'),
            }),
          )
          .min(1)
          .describe('Array of topic subscription configurations to update'),
      },
    },
    async ({ id, email, topics }) => {
      if (!id && !email) {
        throw new Error(
          'You must provide either `id` or `email` to update contact topics.',
        );
      }

      console.error(
        `Debug - Updating topics for contact (id: ${id}, email: ${email})`,
      );

      const contactField = id ? { id } : { email: email! };

      const response = await resend.contacts.topics.update({
        ...contactField,
        topics,
      });

      if (response.error) {
        throw new Error(
          `Failed to update contact topics: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Contact topic subscriptions updated successfully.',
          },
          { type: 'text', text: `Contact ID: ${response.data.id}` },
          {
            type: 'text',
            text: "Don't bother telling the user the ID unless they ask for it.",
          },
        ],
      };
    },
  );
}
