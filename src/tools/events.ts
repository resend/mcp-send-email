import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addEventTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'send-event',
    {
      title: 'Send Event',
      description: `**Purpose:** Fire an event to trigger automations for a specific contact.

**When to use:**
- User wants to trigger an automation workflow for a contact
- Testing an automation by sending a test event

**Workflow:** create-event (if needed) → create-automation (if needed) → send-event

**Important:**
- The event name must match the trigger event name in an automation for it to fire.
- Identify the contact by either contactId OR email, not both.
- The payload is optional and can contain any key-value data that the automation steps can reference via event.* variables.`,
      inputSchema: {
        event: z
          .string()
          .nonempty()
          .describe('The event name (e.g., "user.created", "payment.failed")'),
        contactId: z
          .string()
          .optional()
          .describe(
            'The contact ID to associate with the event. Use either contactId or email, not both.',
          ),
        email: z
          .string()
          .optional()
          .describe(
            'The contact email to associate with the event. Use either contactId or email, not both.',
          ),
        payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            'Optional key-value data passed to the automation. Accessible in steps via event.* variables.',
          ),
      },
    },
    async ({ event, contactId, email, payload }) => {
      if (!contactId && !email) {
        throw new Error(
          'Either "contactId" or "email" must be provided to identify the contact.',
        );
      }
      if (contactId && email) {
        throw new Error('Provide either "contactId" or "email", not both.');
      }

      const options = contactId
        ? { event, contactId, payload }
        : { event, email: email!, payload };

      const response = await resend.events.send(options);

      if (response.error) {
        throw new Error(
          `Failed to send event: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: `Event "${event}" sent successfully.` },
          {
            type: 'text',
            text: `Contact: ${contactId ?? email}`,
          },
          ...(payload
            ? [
                {
                  type: 'text' as const,
                  text: `Payload: ${JSON.stringify(payload)}`,
                },
              ]
            : []),
          {
            type: 'text',
            text: 'Any enabled automations with a matching trigger will now execute.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'manage-events',
    {
      title: 'Manage Events',
      description: `**Purpose:** Create, list, get, update, or remove event definitions in Resend.

Events define named triggers that your application sends to start automations. Each event can have an optional schema that validates payload data.

**Actions:**
- \`create\`: Define a new event with a name and optional schema.
- \`list\`: List all event definitions (paginated).
- \`get\`: Get event details by ID or name.
- \`update\`: Update an event's schema.
- \`remove\`: Delete an event. You MUST confirm with the user before removing.

**Workflow:** manage-events (create) → create-automation → send-event

**Schema types:** string, number, boolean, date`,
      inputSchema: {
        action: z
          .enum(['create', 'list', 'get', 'update', 'remove'])
          .describe('The operation to perform.'),
        name: z
          .string()
          .optional()
          .describe(
            'Event name (for create). Use dot notation like "user.created". Cannot start with "resend:".',
          ),
        identifier: z
          .string()
          .optional()
          .describe('Event ID or name (for get, update, remove).'),
        schema: z
          .record(z.string(), z.enum(['string', 'number', 'boolean', 'date']))
          .nullable()
          .optional()
          .describe(
            'Event payload schema (for create, update). Maps field names to types. Pass null to remove the schema.',
          ),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of events to retrieve (for list). Default: 20.'),
        after: z
          .string()
          .optional()
          .describe('Cursor for forward pagination (for list).'),
        before: z
          .string()
          .optional()
          .describe('Cursor for backward pagination (for list).'),
      },
    },
    async ({ action, name, identifier, schema, limit, after, before }) => {
      switch (action) {
        case 'create': {
          if (!name) {
            throw new Error('The "name" field is required for create.');
          }

          const response = await resend.events.create({
            name,
            ...(schema ? { schema } : {}),
          });

          if (response.error) {
            throw new Error(
              `Failed to create event: ${JSON.stringify(response.error)}`,
            );
          }

          return {
            content: [
              { type: 'text', text: 'Event created successfully.' },
              {
                type: 'text',
                text: `Name: ${name}\nID: ${response.data.id}`,
              },
              {
                type: 'text',
                text: 'Next: Use this event name in create-automation triggers, or send it with send-event.',
              },
            ],
          };
        }

        case 'list': {
          if (after && before) {
            throw new Error(
              'Cannot use both "after" and "before". Use only one for pagination.',
            );
          }

          const options = after
            ? { limit, after }
            : before
              ? { limit, before }
              : limit !== undefined
                ? { limit }
                : undefined;

          const response = await resend.events.list(options);

          if (response.error) {
            throw new Error(
              `Failed to list events: ${JSON.stringify(response.error)}`,
            );
          }

          const events = response.data?.data ?? [];
          const hasMore = response.data?.has_more ?? false;

          if (events.length === 0) {
            return {
              content: [{ type: 'text', text: 'No events found.' }],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Found ${events.length} event${events.length === 1 ? '' : 's'}:`,
              },
              ...events.map((event) => ({
                type: 'text' as const,
                text: `Name: ${event.name}\nID: ${event.id}\nSchema: ${event.schema ? JSON.stringify(event.schema) : 'none'}\nCreated: ${event.created_at}`,
              })),
              ...(hasMore
                ? [
                    {
                      type: 'text' as const,
                      text: 'More events available. Use "after" with the last ID to paginate.',
                    },
                  ]
                : []),
            ],
          };
        }

        case 'get': {
          if (!identifier) {
            throw new Error(
              'The "identifier" field is required for get (event ID or name).',
            );
          }

          const response = await resend.events.get(identifier);

          if (response.error) {
            throw new Error(
              `Failed to get event: ${JSON.stringify(response.error)}`,
            );
          }

          const event = response.data;
          return {
            content: [
              {
                type: 'text',
                text: `Name: ${event.name}\nID: ${event.id}\nSchema: ${event.schema ? JSON.stringify(event.schema) : 'none'}\nCreated: ${event.created_at}\nUpdated: ${event.updated_at ?? 'never'}`,
              },
            ],
          };
        }

        case 'update': {
          if (!identifier) {
            throw new Error(
              'The "identifier" field is required for update (event ID or name).',
            );
          }
          if (schema === undefined) {
            throw new Error(
              'The "schema" field is required for update. Pass null to remove the schema.',
            );
          }

          const response = await resend.events.update(identifier, {
            schema: schema ?? null,
          });

          if (response.error) {
            throw new Error(
              `Failed to update event: ${JSON.stringify(response.error)}`,
            );
          }

          return {
            content: [
              { type: 'text', text: 'Event updated successfully.' },
              { type: 'text', text: `ID: ${response.data.id}` },
            ],
          };
        }

        case 'remove': {
          if (!identifier) {
            throw new Error(
              'The "identifier" field is required for remove (event ID or name).',
            );
          }

          const response = await resend.events.remove(identifier);

          if (response.error) {
            throw new Error(
              `Failed to remove event: ${JSON.stringify(response.error)}`,
            );
          }

          return {
            content: [
              { type: 'text', text: 'Event removed successfully.' },
              { type: 'text', text: `ID: ${response.data.id}` },
            ],
          };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  );
}
