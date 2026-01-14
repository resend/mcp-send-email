import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  GetContactResponse,
  RemoveContactsResponse,
  Resend,
  UpdateContactResponse,
} from 'resend';
import { z } from 'zod';

export function addContactTools(server: McpServer, resend: Resend) {
  server.tool(
    'create-contact',
    'Create a new contact in an audience.',
    {
      audienceId: z
        .string()
        .nonempty()
        .describe('Audience ID to add the contact to'),
      email: z.string().email().describe('Contact email address'),
      firstName: z.string().optional().describe('Contact first name'),
      lastName: z.string().optional().describe('Contact last name'),
      unsubscribed: z
        .boolean()
        .optional()
        .describe('Whether the contact is unsubscribed'),
    },
    async ({ audienceId, email, firstName, lastName, unsubscribed }) => {
      console.error(
        `Debug - Creating contact in audience: ${audienceId} email: ${email}`,
      );

      const response = await resend.contacts.create({
        audienceId,
        email,
        firstName,
        lastName,
        unsubscribed,
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
        ],
      };
    },
  );

  server.tool(
    'list-contacts',
    'List contacts for an audience. Use this to discover contact IDs or emails.',
    {
      audienceId: z.string().nonempty().describe('Audience ID'),
    },
    async ({ audienceId }) => {
      console.error(`Debug - Listing contacts for audience: ${audienceId}`);

      const response = await resend.contacts.list({ audienceId });

      if (response.error) {
        throw new Error(
          `Failed to list contacts: ${JSON.stringify(response.error)}`,
        );
      }

      const contacts = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${contacts.length} contact${contacts.length === 1 ? '' : 's'}${contacts.length === 0 ? '.' : ':'}`,
          },
          ...contacts.map(
            ({
              id,
              email,
              first_name,
              last_name,
              unsubscribed,
              created_at,
            }) => ({
              type: 'text' as const,
              text: [
                `ID: ${id}`,
                `Email: ${email}`,
                first_name != null && `First name: ${first_name}`,
                last_name != null && `Last name: ${last_name}`,
                `Unsubscribed: ${unsubscribed}`,
                `Created at: ${created_at}`,
              ]
                .filter(Boolean)
                .join('\n'),
            }),
          ),
          ...(contacts.length === 0
            ? []
            : [
              {
                type: 'text' as const,
                text: "Don't bother telling the user the IDs, unsubscribe statuses, or creation dates unless they ask for them.",
              },
            ]),
        ],
      };
    },
  );

  server.tool(
    'get-contact',
    'Get a contact by ID or email from an audience',
    {
      audienceId: z.string().nonempty().describe('Audience ID'),
      id: z.string().optional().describe('Contact ID'),
      email: z.string().email().optional().describe('Contact email address'),
    },
    async ({ audienceId, id, email }) => {
      console.error(
        `Debug - Getting contact for audience: ${audienceId} id: ${id} email: ${email}`,
      );

      let response: GetContactResponse;
      if (id) {
        response = await resend.contacts.get({ audienceId, id });
      } else if (email) {
        response = await resend.contacts.get({ audienceId, email });
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
              `Created at: ${contact.created_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'update-contact',
    'Update a contact in an audience (by ID or email)',
    {
      audienceId: z.string().nonempty().describe('Audience ID'),
      id: z.string().optional().describe('Contact ID'),
      email: z.string().email().optional().describe('Contact email address'),
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
        .describe('Whether the contact is unsubscribed'),
    },
    async ({ audienceId, id, email, firstName, lastName, unsubscribed }) => {
      console.error(
        `Debug - Updating contact for audience: ${audienceId} id: ${id} email: ${email}`,
      );

      const commonOptions = {
        audienceId,
        firstName,
        lastName,
        unsubscribed,
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
        ],
      };
    },
  );

  server.tool(
    'remove-contact',
    "Remove a contact from an audience (by ID or email). Before using this tool, you MUST double-check with the user that they want to remove this contact. Reference the contact's name (if present) and email address when double-checking, and warn the user that removing a contact is irreversible. You may only use this tool if the user explicitly confirms they want to remove the contact after you double-check.",
    {
      audienceId: z.string().nonempty().describe('Audience ID'),
      id: z.string().optional().describe('Contact ID'),
      email: z.string().email().optional().describe('Contact email address'),
    },
    async ({ audienceId, id, email }) => {
      console.error(
        `Debug - Removing contact for audience: ${audienceId} id: ${id} email: ${email}`,
      );

      let response: RemoveContactsResponse;
      if (id) {
        response = await resend.contacts.remove({ audienceId, id });
      } else if (email) {
        response = await resend.contacts.remove({ audienceId, email });
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
}
