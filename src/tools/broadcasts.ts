import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';
import { EMAIL_HTML_RULES } from '../lib/email-html-rules.js';
import type { ResendEditorClient } from '../lib/resend-editor-client.js';

export function addBroadcastTools(
  server: McpServer,
  resend: Resend,
  apiClient: ResendEditorClient,
  {
    senderEmailAddress,
    replierEmailAddresses,
    withEditorSession,
  }: {
    senderEmailAddress?: string;
    replierEmailAddresses: string[];
    withEditorSession: <T>(
      conn: { resource_type: 'broadcast' | 'template'; resource_id: string },
      fn: () => Promise<T>,
    ) => Promise<T>;
  },
) {
  server.registerTool(
    'create-broadcast',
    {
      title: 'Create Broadcast',
      description: `**Purpose:** Create a broadcast campaign (one email sent to an entire segment). Defines subject, body, and segment; does NOT send yet. Use send-broadcast to send it.

**NOT for:** Sending a one-off email to specific people (use send-email). Not for adding contacts (use create-contact).

**Returns:** Broadcast ID. Use this ID with send-broadcast to send, or get-broadcast/update-broadcast to manage.

**When to use:**
- User wants to "email my list", "send a newsletter", "broadcast to my segment", "email all contacts in X"
- Newsletter, announcement, or bulk message to one segment
- Supports personalization: {{{FIRST_NAME}}}, {{{LAST_NAME}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}

**"All contacts" note:** Broadcasts require a segment. There is no "all contacts" option in the API. If the user wants to send to all contacts, check list-segments for an existing segment that covers everyone. If none exists, suggest creating one with create-segment.

**Workflow:** list-segments (if needed) → create-broadcast → get-tiptap-json-content (with include_schema: true) → compose-broadcast → send-broadcast.

**Content options after creating:**
- **compose-broadcast** (recommended): Sets TipTap content that the user can visually edit in the Resend dashboard. Use this when the user wants to collaborate on or refine the email in the editor.
- **update-broadcast with html/text**: Sets static HTML/text content. Use this only when the user explicitly wants to set raw HTML. Switching between compose and html/text modes is lossy — some content or formatting may be lost. Ask the user before switching.`,
      inputSchema: {
        name: z
          .string()
          .nonempty()
          .describe(
            'Name for the broadcast. If the user does not provide a name, go ahead and create a descriptive name for them, based on the email subject/content and the context of your conversation.',
          ),
        segmentId: z.string().nonempty().describe('Segment ID to send to'),
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
            `HTML version of the email content. Placeholders: {{{FIRST_NAME|fallback}}}, {{{LAST_NAME|fallback}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}.\n\n${EMAIL_HTML_RULES}`,
          ),
        previewText: z
          .string()
          .optional()
          .describe('Preview text for the email'),
        ...(!senderEmailAddress
          ? {
              from: z
                .string()
                .nonempty()
                .describe(
                  'From email address (e.g. "onboarding@resend.com" or "Resend <onboarding@resend.com>")',
                ),
            }
          : {}),
        ...(replierEmailAddresses.length === 0
          ? {
              replyTo: z
                .array(z.string())
                .optional()
                .describe('Reply-to email address(es)'),
            }
          : {}),
      },
    },
    async ({
      name,
      segmentId,
      subject,
      text,
      html,
      previewText,
      from,
      replyTo,
    }) => {
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
        segmentId,
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

      const resultContent: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: 'Broadcast created successfully.' },
        { type: 'text', text: `ID: ${response.data.id}` },
      ];

      if (html) {
        resultContent.push({
          type: 'text',
          text: `HTML content is set. To visually edit it in the dashboard instead, call get-tiptap-json-content → compose-broadcast (note: switching to compose mode may lose some HTML formatting).`,
        });
      } else {
        resultContent.push({
          type: 'text',
          text: `**Next step:** Call get-tiptap-json-content with resource_type "broadcast", resource_id "${response.data.id}", and include_schema true — then call compose-broadcast to set the email body content.`,
        });
      }

      resultContent.push({
        type: 'text',
        text: `Preview: https://resend.com/broadcasts/${response.data.id}`,
      });

      return { content: resultContent };
    },
  );

  server.registerTool(
    'send-broadcast',
    {
      title: 'Send Broadcast',
      description: `**Purpose:** Send (or schedule) an existing broadcast by ID. The broadcast must have been created with create-broadcast first.

**NOT for:** Sending a new one-off email (use send-email). Not for creating the broadcast content (use create-broadcast).

**Returns:** Send confirmation and broadcast ID.

**When to use:**
- User has created a broadcast and says "send it", "go ahead and send", "schedule this for tomorrow"
- After create-broadcast; call send-broadcast with the returned ID to deliver to the audience
- Optional scheduledAt: natural language or ISO 8601 for scheduled send

**Workflow:** create-broadcast → send-broadcast. Use list-broadcasts to find existing draft/sent broadcasts.`,
      inputSchema: {
        broadcastId: z.string().nonempty().describe('Broadcast ID'),
        scheduledAt: z
          .string()
          .optional()
          .describe(
            'When to send the broadcast. Value may be in ISO 8601 format (e.g., 2024-08-05T11:52:01.858Z) or in natural language (e.g., "tomorrow at 10am", "in 2 hours", "next day at 9am PST", "Friday at 3pm ET"). If not provided, the broadcast will be sent immediately.',
          ),
      },
    },
    async ({ broadcastId, scheduledAt }) => {
      const response = await resend.broadcasts.send(broadcastId, {
        scheduledAt,
      });

      if (response.error) {
        throw new Error(
          `Failed to send broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast sent successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-broadcasts',
    {
      title: 'List Broadcasts',
      description: `**Purpose:** List all broadcast campaigns (newsletters/bulk emails to audiences) with ID, name, audience, status, timestamps.

**NOT for:** Listing transactional emails (use list-emails). Not for listing segments or contacts (use list-segments, list-contacts).

**Returns:** For each broadcast: id, name, segment_id, status, created_at, scheduled_at, sent_at.

**When to use:** User asks "show my broadcasts", "what newsletters did I send?", "list campaigns". Use get-broadcast for full details of one.`,
      inputSchema: {},
    },
    async () => {
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
                audience_id !== null && `Segment ID: ${audience_id}`,
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

  server.registerTool(
    'get-broadcast',
    {
      title: 'Get Broadcast',
      description:
        'Retrieve full details of a specific broadcast by ID, including HTML and plain text content.',
      inputSchema: {
        broadcastId: z.string().nonempty().describe('Broadcast ID'),
      },
    },
    async ({ broadcastId }) => {
      const response = await resend.broadcasts.get(broadcastId);

      if (response.error) {
        throw new Error(
          `Failed to get broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      const {
        id: responseId,
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
        html,
        text,
      } = response.data;

      let details = [
        `ID: ${responseId}`,
        `Name: ${name}`,
        audience_id !== null && `Segment ID: ${audience_id}`,
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
        .join('\n');

      details += `\n\n--- Plain Text Content ---\n${text || '(none)'}`;
      if (html) {
        details += `\n\n--- HTML Content ---\n${html}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: details,
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-broadcast',
    {
      title: 'Remove Broadcast',
      description:
        'Remove a broadcast by ID. Before using this tool, you MUST double-check with the user that they want to remove this broadcast. Reference the NAME of the broadcast when double-checking, and warn the user that removing a broadcast is irreversible. You may only use this tool if the user explicitly confirms they want to remove the broadcast after you double-check.',
      inputSchema: {
        broadcastId: z.string().nonempty().describe('Broadcast ID'),
      },
    },
    async ({ broadcastId }) => {
      const response = await resend.broadcasts.remove(broadcastId);

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

  server.registerTool(
    'compose-broadcast',
    {
      title: 'Compose Broadcast',
      description: `**Purpose:** Set the TipTap JSON content of a broadcast, enabling it to be edited visually in the Resend dashboard editor. Automatically connects and disconnects from the editor. Can also update metadata (subject, preview text, name) in the same call.

**This is the recommended way to set email content.** Content set via compose-broadcast can be visually edited by the user in the dashboard. Use this for newsletters and any broadcast where the user may want to refine the content.

**Workflow:** get-tiptap-json-content (with include_schema: true) → compose-broadcast

**When to use:**
- After create-broadcast, to set the email body
- When the user wants to write, edit, or style email content
- When the user wants to collaborate on the email in the dashboard editor

**Important:** Always call get-tiptap-json-content first to retrieve the existing TipTap JSON, then build your changes on top of it. Skipping this will overwrite all existing content.

**Note:** Switching between compose (TipTap) and update (raw HTML) modes is lossy — some content or formatting may be lost. If the broadcast already has HTML content, ask the user before switching to compose mode.`,
      inputSchema: {
        broadcastId: z.string().nonempty().describe('Broadcast ID'),
        content: z
          .preprocess(
            (val) => {
              if (typeof val === 'string') {
                try {
                  return JSON.parse(val);
                } catch {
                  return val;
                }
              }
              return val;
            },
            z.record(z.string(), z.unknown()),
          )
          .describe(
            'TipTap JSON content. Call get-tiptap-json-content (with include_schema: true) first to get the existing content and the schema reference.',
          ),
        subject: z
          .string()
          .optional()
          .describe('Update the email subject line.'),
        previewText: z
          .string()
          .optional()
          .describe(
            'Update the preview text (shown in inbox before opening the email).',
          ),
        name: z
          .string()
          .optional()
          .describe('Update the broadcast name (internal label).'),
      },
    },
    async ({ broadcastId, content, subject, previewText, name }) => {
      // Compose the TipTap content with editor session
      await withEditorSession(
        { resource_type: 'broadcast', resource_id: broadcastId },
        () => apiClient.composeBroadcastContent(broadcastId, { content }),
      );

      // Update metadata if any was provided
      const hasMetadata =
        subject !== undefined ||
        previewText !== undefined ||
        name !== undefined;
      if (hasMetadata) {
        const metadataFields = [
          ...(subject !== undefined ? ['subject'] : []),
          ...(previewText !== undefined ? ['previewText'] : []),
          ...(name !== undefined ? ['name'] : []),
        ];

        // The API requires `from` and `segmentId` to be set on the broadcast.
        // Dashboard-created broadcasts may lack these — check before updating.
        const current = await resend.broadcasts.get(broadcastId);
        if (
          !current.error &&
          (!current.data.from || !current.data.audience_id)
        ) {
          const missing: string[] = [];
          if (!current.data.from) missing.push('from');
          if (!current.data.audience_id) missing.push('segmentId');
          return {
            content: [
              {
                type: 'text',
                text: 'Broadcast content composed successfully, but metadata update was skipped.',
              },
              { type: 'text', text: `ID: ${broadcastId}` },
              {
                type: 'text',
                text: `The broadcast is missing required fields for update: ${missing.join(', ')}. Use update-broadcast to set ${metadataFields.join(', ')} along with the missing fields.`,
              },
              {
                type: 'text',
                text: `Preview: https://resend.com/broadcasts/${broadcastId}`,
              },
            ],
          };
        }

        try {
          const updateResponse = await resend.broadcasts.update(broadcastId, {
            ...(subject !== undefined && { subject }),
            ...(previewText !== undefined && { previewText }),
            ...(name !== undefined && { name }),
          });

          if (updateResponse.error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Broadcast content composed successfully, but metadata update failed for: ${metadataFields.join(', ')}.`,
                },
                { type: 'text', text: `ID: ${broadcastId}` },
                {
                  type: 'text',
                  text: `Error: ${JSON.stringify(updateResponse.error)}`,
                },
                {
                  type: 'text',
                  text: `**Retry:** Call update-broadcast with broadcastId "${broadcastId}" to set ${metadataFields.join(', ')}.`,
                },
              ],
            };
          }
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: `Broadcast content composed successfully, but metadata update failed for: ${metadataFields.join(', ')}.`,
              },
              { type: 'text', text: `ID: ${broadcastId}` },
              {
                type: 'text',
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
              {
                type: 'text',
                text: `**Retry:** Call update-broadcast with broadcastId "${broadcastId}" to set ${metadataFields.join(', ')}.`,
              },
            ],
          };
        }
      }

      const resultParts: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: 'Broadcast content composed successfully.' },
        { type: 'text', text: `ID: ${broadcastId}` },
      ];

      // Only check for missing metadata when the caller didn't provide any
      if (!hasMetadata) {
        try {
          const current = await resend.broadcasts.get(broadcastId);
          if (!current.error) {
            const missing: string[] = [];
            if (current.data.subject == null) missing.push('subject');
            if (current.data.preview_text == null) missing.push('previewText');
            if (missing.length > 0) {
              resultParts.push({
                type: 'text',
                text: `**Note:** The broadcast is still missing: ${missing.join(', ')}. You can set these by calling compose-broadcast again with the missing fields, or use update-broadcast.`,
              });
            }
          } else {
            resultParts.push({
              type: 'text',
              text: '**Note:** Could not verify broadcast metadata — check that subject and preview text are set.',
            });
          }
        } catch {
          resultParts.push({
            type: 'text',
            text: '**Note:** Could not verify broadcast metadata — check that subject and preview text are set.',
          });
        }
      }

      resultParts.push({
        type: 'text',
        text: `Preview: https://resend.com/broadcasts/${broadcastId}`,
      });

      return { content: resultParts };
    },
  );

  server.registerTool(
    'update-broadcast',
    {
      title: 'Update Broadcast',
      description: `Update broadcast metadata by ID (name, subject, from, html, text, segment, preview text, reply-to). To edit TipTap content, use compose-broadcast instead.

**Important:** The API requires \`from\` and \`segmentId\` to be set on the broadcast. If the broadcast was created from the dashboard, these may be empty. Always call get-broadcast first to check, and include \`from\` and \`segmentId\` in your update if they are not already set. Use list-domains to find verified domains for the from address, and list-segments to find segment IDs.

**Note on html/text fields:** Setting html or text via this tool replaces any content previously set via compose-broadcast. This switch is lossy — some content or formatting may be lost. Prefer compose-broadcast for content changes. If the broadcast was composed with TipTap content, ask the user before overwriting it with raw HTML.`,
      inputSchema: {
        broadcastId: z.string().nonempty().describe('Broadcast ID'),
        name: z.string().optional().describe('Name for the broadcast'),
        segmentId: z.string().optional().describe('Segment ID to send to'),
        from: z
          .string()
          .optional()
          .describe(
            'From email address (e.g. "onboarding@resend.com" or "Resend <onboarding@resend.com>")',
          ),
        html: z
          .string()
          .optional()
          .describe(`HTML content of the email.\n\n${EMAIL_HTML_RULES}`),
        text: z.string().optional().describe('Plain text content of the email'),
        subject: z.string().optional().describe('Email subject'),
        replyTo: z
          .array(z.string())
          .optional()
          .describe('Reply-to email address(es)'),
        previewText: z
          .string()
          .optional()
          .describe('Preview text for the email'),
      },
    },
    async ({
      broadcastId,
      name,
      segmentId,
      from,
      html,
      text,
      subject,
      replyTo,
      previewText,
    }) => {
      // Fetch current broadcast to detect missing required fields.
      // The API validates the merged result (existing + patch), so updating
      // a dashboard-created broadcast that lacks `from` or `segment_id` will
      // fail unless we warn the user upfront.
      const current = await resend.broadcasts.get(broadcastId);
      if (current.error) {
        throw new Error(
          `Failed to fetch broadcast: ${JSON.stringify(current.error)}`,
        );
      }

      const missingFields: string[] = [];
      if (!current.data.from && !from) {
        missingFields.push('from');
      }
      if (!current.data.audience_id && !segmentId) {
        missingFields.push('segmentId');
      }

      if (missingFields.length > 0) {
        const broadcast = current.data;
        const state = [
          `ID: ${broadcast.id}`,
          `Name: ${broadcast.name ?? '(not set)'}`,
          `From: ${broadcast.from ?? '(not set)'}`,
          `Subject: ${broadcast.subject ?? '(not set)'}`,
          `Segment ID: ${broadcast.audience_id ?? '(not set)'}`,
          `Status: ${broadcast.status}`,
        ].join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Cannot update: this broadcast is missing required fields: ${missingFields.join(', ')}.\n\nCurrent broadcast state:\n${state}\n\nCall list-segments and list-domains to load the available options, then present them to the user and ask which ones to use. Do NOT pick defaults on the user's behalf. Once the user chooses, retry this update with the missing fields included.`,
            },
          ],
        };
      }

      const response = await resend.broadcasts.update(broadcastId, {
        name,
        segmentId,
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
          { type: 'text', text: `ID: ${broadcastId}` },
          {
            type: 'text',
            text: `Preview: https://resend.com/broadcasts/${broadcastId}`,
          },
        ],
      };
    },
  );
}
