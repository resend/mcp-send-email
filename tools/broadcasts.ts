import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addBroadcastTools(
  server: McpServer,
  resend: Resend,
  {
    senderEmailAddress,
    replierEmailAddresses,
  }: {
    senderEmailAddress?: string;
    replierEmailAddresses: string[];
  },
) {
  server.tool(
    'create-broadcast',
    'Create a new broadcast email to an audience.',
    {
      name: z
        .string()
        .nonempty()
        .describe(
          'Name for the broadcast. If the user does not provide a name, go ahead and create a descriptive name for them, based on the email subject/content and the context of your conversation.',
        ),
      audienceId: z.string().nonempty().describe('Audience ID to send to'),
      subject: z.string().nonempty().describe('Email subject'),
      text: z
        .string()
        .nonempty()
        .describe(
          'Plain text version of the email content. The following placeholders may be used to personalize the email content: {{{FIRST_NAME|fallback}}}, {{{LAST_NAME|fallback}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}',
        ),
      html: z
        .string()
        .optional()
        .describe(
          'HTML version of the email content. The following placeholders may be used to personalize the email content: {{{FIRST_NAME|fallback}}}, {{{LAST_NAME|fallback}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}',
        ),
      previewText: z.string().optional().describe('Preview text for the email'),
      ...(!senderEmailAddress
        ? {
            from: z.string().email().nonempty().describe('From email address'),
          }
        : {}),
      ...(replierEmailAddresses.length === 0
        ? {
            replyTo: z
              .string()
              .email()
              .array()
              .optional()
              .describe('Reply-to email address(es)'),
          }
        : {}),
    },
    async ({
      name,
      audienceId,
      subject,
      text,
      html,
      previewText,
      from,
      replyTo,
    }) => {
      console.error(
        `Debug - Creating broadcast: ${name ?? '<no-name>'} to audience: ${audienceId}`,
      );

      const fromEmailAddress = from ?? senderEmailAddress;
      const replyToEmailAddresses = replyTo ?? replierEmailAddresses;

      // Type check on from, since "from" is optionally included in the arguments schema
      // This should never happen.
      if (typeof fromEmailAddress !== 'string') {
        throw new Error('from argument must be provided.');
      }

      // Similar type check for "reply-to" email addresses.
      if (
        typeof replyToEmailAddresses !== 'string' &&
        !Array.isArray(replyToEmailAddresses)
      ) {
        throw new Error('replyTo argument must be provided.');
      }

      const response = await resend.broadcasts.create({
        name,
        audienceId,
        subject,
        text,
        html,
        previewText,
        from: fromEmailAddress,
        replyTo: replyToEmailAddresses,
      });

      if (response.error) {
        throw new Error(
          `Failed to create broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast created successfully.' },
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
    'send-broadcast',
    'Send a broadcast email by ID. You may optionally schedule the send.',
    {
      id: z.string().nonempty().describe('Broadcast ID'),
      scheduledAt: z
        .string()
        .optional()
        .describe(
          'When to send the broadcast. Value may be in ISO 8601 format (e.g., 2024-08-05T11:52:01.858Z) or in natural language (e.g., "tomorrow at 10am", "in 2 hours", "next day at 9am PST", "Friday at 3pm ET"). If not provided, the broadcast will be sent immediately.',
        ),
    },
    async ({ id, scheduledAt }) => {
      console.error(`Debug - Sending broadcast with id: ${id}`);

      const response = await resend.broadcasts.send(id, { scheduledAt });

      if (response.error) {
        throw new Error(
          `Failed to send broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast sent successfully.' },
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
    'list-broadcasts',
    'List all broadcasts. Use this to find broadcast IDs or names.',
    {},
    async () => {
      console.error('Debug - Listing broadcasts');

      const response = await resend.broadcasts.list();

      if (response.error) {
        throw new Error(
          `Failed to list broadcasts: ${JSON.stringify(response.error)}`,
        );
      }

      const broadcasts = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${broadcasts.length} broadcast${broadcasts.length === 1 ? '' : 's'}${broadcasts.length === 0 ? '.' : ':'}`,
          },
          ...broadcasts.map(
            ({
              name,
              id,
              audience_id,
              status,
              created_at,
              scheduled_at,
              sent_at,
            }) => ({
              type: 'text' as const,
              text: [
                `ID: ${id}`,
                `Name: ${name}`,
                audience_id !== null && `Audience ID: ${audience_id}`,
                `Status: ${status}`,
                `Created at: ${created_at}`,
                scheduled_at !== null && `Scheduled at: ${scheduled_at}`,
                sent_at !== null && `Sent at: ${sent_at}`,
              ]
                .filter(Boolean)
                .join('\n'),
            }),
          ),
        ],
      };
    },
  );

  server.tool(
    'get-broadcast',
    'Get a broadcast by ID.',
    {
      id: z.string().nonempty().describe('Broadcast ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Getting broadcast with id: ${id}`);

      const response = await resend.broadcasts.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      const {
        id: broadcastId,
        name,
        audience_id,
        from,
        subject,
        reply_to,
        preview_text,
        status,
        created_at,
        scheduled_at,
        sent_at,
      } = response.data;
      return {
        content: [
          {
            type: 'text',
            text: [
              `ID: ${broadcastId}`,
              `Name: ${name}`,
              audience_id !== null && `Audience ID: ${audience_id}`,
              from !== null && `From: ${from}`,
              subject !== null && `Subject: ${subject}`,
              reply_to !== null && `Reply-to: ${reply_to.join(', ')}`,
              preview_text !== null && `Preview text: ${preview_text}`,
              `Status: ${status}`,
              `Created at: ${created_at}`,
              scheduled_at !== null && `Scheduled at: ${scheduled_at}`,
              sent_at !== null && `Sent at: ${sent_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'remove-broadcast',
    'Remove a broadcast by ID. Before using this tool, you MUST double-check with the user that they want to remove this broadcast. Reference the NAME of the broadcast when double-checking, and warn the user that removing a broadcast is irreversible. You may only use this tool if the user explicitly confirms they want to remove the broadcast after you double-check.',
    {
      id: z.string().nonempty().describe('Broadcast ID'),
    },
    async ({ id }) => {
      console.error(`Debug - Removing broadcast with id: ${id}`);

      const response = await resend.broadcasts.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.tool(
    'update-broadcast',
    'Update a broadcast by ID.',
    {
      id: z.string().nonempty().describe('Broadcast ID'),
      name: z.string().optional().describe('Name for the broadcast'),
      audienceId: z.string().optional().describe('Audience ID to send to'),
      from: z.string().email().optional().describe('From email address'),
      html: z.string().optional().describe('HTML content of the email'),
      text: z.string().optional().describe('Plain text content of the email'),
      subject: z.string().optional().describe('Email subject'),
      replyTo: z
        .string()
        .email()
        .array()
        .optional()
        .describe('Reply-to email address(es)'),
      previewText: z.string().optional().describe('Preview text for the email'),
    },
    async ({
      id,
      name,
      audienceId,
      from,
      html,
      text,
      subject,
      replyTo,
      previewText,
    }) => {
      console.error(`Debug - Updating broadcast with id: ${id}`);

      const response = await resend.broadcasts.update(id, {
        name,
        audienceId,
        from,
        html,
        text,
        subject,
        replyTo,
        previewText,
      });

      if (response.error) {
        throw new Error(
          `Failed to update broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );
}
