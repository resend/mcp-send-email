import fs from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addEmailTools(
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
  server.registerTool(
    'send-email',
    {
      title: 'Send Email',
      description: `**Purpose:** Send a single transactional email to one or more recipients immediately (or schedule it). Use for one-off messages, notifications, and direct replies.

**NOT for:** Sending the same email to a whole list/audience (use create-broadcast + send-broadcast). Not for managing contacts or audiences.

**Returns:** Send confirmation and email ID.

**When to use:**
- User wants to "send an email" to specific people (names or addresses)
- One-off messages: password reset, order confirmation, receipt, alert
- User says "email this to X", "notify them", "send a message to..."
- Scheduling a single email for later

**Workflow:** Get recipient(s) and content from user → send-email. Use list-emails or get-email to check delivery status afterward.

**Key trigger phrases:** "Send an email", "Email this to", "Notify", "Send a message", "Reply to them", "Schedule an email"`,
      inputSchema: {
        to: z
          .array(z.email())
          .min(1)
          .max(50)
          .describe('Array of recipient email addresses (1-50 recipients)'),
        subject: z.string().describe('Email subject line'),
        text: z.string().describe('Plain text email content'),
        html: z
          .string()
          .optional()
          .describe(
            'HTML email content. When provided, the plain text argument MUST be provided as well.',
          ),
        cc: z
          .array(z.email())
          .optional()
          .describe(
            'Optional array of CC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
          ),
        bcc: z
          .array(z.email())
          .optional()
          .describe(
            'Optional array of BCC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
          ),
        scheduledAt: z
          .string()
          .optional()
          .describe(
            "Optional parameter to schedule the email. This uses natural language. Examples would be 'tomorrow at 10am' or 'in 2 hours' or 'next day at 9am PST' or 'Friday at 3pm ET'.",
          ),
        attachments: z
          .array(
            z.object({
              filename: z
                .string()
                .describe(
                  'Name of the file with extension (e.g., "report.pdf")',
                ),
              filePath: z
                .string()
                .optional()
                .describe('Local file path to read and attach'),
              url: z
                .string()
                .optional()
                .describe(
                  'URL where the file is hosted (Resend will fetch it)',
                ),
              content: z
                .string()
                .optional()
                .describe('Base64-encoded file content'),
              contentType: z
                .string()
                .optional()
                .describe(
                  'MIME type (e.g., "application/pdf"). Auto-derived from filename if not set',
                ),
              contentId: z
                .string()
                .optional()
                .describe(
                  'Content ID for inline images. Reference in HTML with cid:<contentId>',
                ),
            }),
          )
          .optional()
          .describe(
            'Array of file attachments. Each needs filename plus one of: filePath, url, or content. Max 40MB total.',
          ),
        tags: z
          .array(
            z.object({
              name: z.string().describe('Tag name (key)'),
              value: z.string().describe('Tag value'),
            }),
          )
          .optional()
          .describe(
            'Array of custom tags for tracking/analytics. Each tag has a name and value.',
          ),
        topicId: z
          .string()
          .optional()
          .describe(
            'Topic ID for subscription-based sending. When set, the email respects contact subscription preferences for this topic.',
          ),
        // If sender email address is not provided, the tool requires it as an argument
        ...(!senderEmailAddress
          ? {
              from: z
                .email()
                .nonempty()
                .describe(
                  'Sender email address. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
                ),
            }
          : {}),
        ...(replierEmailAddresses.length === 0
          ? {
              replyTo: z
                .array(z.email())
                .optional()
                .describe(
                  'Optional email addresses for the email readers to reply to. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
                ),
            }
          : {}),
      },
    },
    async ({
      from,
      to,
      subject,
      text,
      html,
      replyTo,
      scheduledAt,
      cc,
      bcc,
      attachments,
      tags,
      topicId,
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

      console.error(`Debug - Sending email with from: ${fromEmailAddress}`);

      // Explicitly structure the request with all parameters to ensure they're passed correctly
      const emailRequest: {
        to: string[];
        subject: string;
        text: string;
        from: string;
        replyTo: string | string[];
        html?: string;
        scheduledAt?: string;
        cc?: string[];
        bcc?: string[];
        attachments?: Array<{
          content?: Buffer;
          filename?: string;
          path?: string;
          contentType?: string;
          contentId?: string;
        }>;
        tags?: Array<{
          name: string;
          value: string;
        }>;
        topicId?: string;
      } = {
        to,
        subject,
        text,
        from: fromEmailAddress,
        replyTo: replyToEmailAddresses,
      };

      // Add optional parameters conditionally
      if (html) {
        emailRequest.html = html;
      }

      if (scheduledAt) {
        emailRequest.scheduledAt = scheduledAt;
      }

      if (cc) {
        emailRequest.cc = cc;
      }

      if (bcc) {
        emailRequest.bcc = bcc;
      }

      if (attachments && attachments.length > 0) {
        emailRequest.attachments = await Promise.all(
          attachments.map(async (att) => {
            const result: {
              filename?: string;
              content?: Buffer;
              path?: string;
              contentType?: string;
              contentId?: string;
            } = {};

            if (att.filename) result.filename = att.filename;
            if (att.contentType) result.contentType = att.contentType;
            if (att.contentId) result.contentId = att.contentId;

            // Priority: filePath > url > content
            if (att.filePath) {
              // Read local file
              const fileBuffer = await fs.readFile(att.filePath);
              result.content = fileBuffer;
            } else if (att.url) {
              // Let Resend fetch from URL
              result.path = att.url;
            } else if (att.content) {
              // Direct Base64 content
              result.content = Buffer.from(att.content, 'base64');
            }

            return result;
          }),
        );
      }

      if (tags && tags.length > 0) {
        emailRequest.tags = tags;
      }

      if (topicId) {
        emailRequest.topicId = topicId;
      }

      console.error(`Email request: ${JSON.stringify(emailRequest)}`);

      const response = await resend.emails.send(emailRequest);

      if (response.error) {
        throw new Error(
          `Email failed to send: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Email sent successfully! ${JSON.stringify(response.data)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'list-emails',
    {
      title: 'List Emails',
      description: `**Purpose:** List recently sent emails (transactional emails sent via send-email) with metadata: recipient, subject, status, timestamps.

**NOT for:** Listing broadcast campaigns (use list-broadcasts). Not for composing or sending.

**Returns:** Paginated list with to, subject, status, created_at, and ID per email.

**When to use:**
- User asks "what emails were sent?", "show recent emails", "did my email go out?"
- Checking delivery status of sent messages
- Finding an email ID to fetch full content (then use get-email)

**Workflow:** list-emails → get-email( id ) when user needs full body or details.`,
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of emails to retrieve. Default: 20, Max: 100, Min: 1',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Email ID after which to retrieve more emails (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Email ID before which to retrieve more emails (for backward pagination). Cannot be used with "after".',
          ),
      },
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing emails with limit: ${limit}, after: ${after}, before: ${before}`,
      );

      // Build pagination options - Resend SDK requires mutually exclusive after/before
      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.emails.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list emails: ${JSON.stringify(response.error)}`,
        );
      }

      const emails = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (emails.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No emails found.',
            },
          ],
        };
      }

      const emailSummaries = emails
        .map((email) => {
          const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
          const scheduledInfo = email.scheduled_at
            ? ` (Scheduled: ${email.scheduled_at})`
            : '';
          return `- To: ${to} | Subject: "${email.subject}" | Status: ${email.last_event} | Sent: ${email.created_at}${scheduledInfo} | ID: ${email.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${emails.length} email(s)${hasMore ? ' (more available)' : ''}:\n\n${emailSummaries}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'get-email',
    {
      title: 'Get Email',
      description: 'Retrieve full details of a specific sent transactional email by ID, including HTML and plain text content.',
      inputSchema: {
        id: z.string().describe('The email ID to retrieve'),
      },
    },
    async ({ id }) => {
      console.error(`Debug - Getting email with ID: ${id}`);

      const response = await resend.emails.get(id);

      if (response.error) {
        throw new Error(
          `Failed to retrieve email: ${JSON.stringify(response.error)}`,
        );
      }

      const email = response.data;

      if (!email) {
        throw new Error(`Email with ID ${id} not found.`);
      }

      const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
      const cc = email.cc
        ? Array.isArray(email.cc)
          ? email.cc.join(', ')
          : email.cc
        : null;
      const bcc = email.bcc
        ? Array.isArray(email.bcc)
          ? email.bcc.join(', ')
          : email.bcc
        : null;
      const replyTo = email.reply_to
        ? Array.isArray(email.reply_to)
          ? email.reply_to.join(', ')
          : email.reply_to
        : null;

      let details = `Email Details:\n`;
      details += `- ID: ${email.id}\n`;
      details += `- From: ${email.from}\n`;
      details += `- To: ${to}\n`;
      if (cc) details += `- CC: ${cc}\n`;
      if (bcc) details += `- BCC: ${bcc}\n`;
      if (replyTo) details += `- Reply-To: ${replyTo}\n`;
      details += `- Subject: ${email.subject}\n`;
      details += `- Status: ${email.last_event}\n`;
      details += `- Created: ${email.created_at}\n`;
      if (email.scheduled_at) details += `- Scheduled: ${email.scheduled_at}\n`;
      details += `\n--- Plain Text Content ---\n${email.text || '(none)'}\n`;
      if (email.html) {
        details += `\n--- HTML Content ---\n${email.html}\n`;
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

  server.tool(
    'list-received-emails',
    "List received emails. Returns email metadata including sender, subject, and timestamps. Use 'get-received-email' with an email ID to retrieve full content. Don't bother telling the user the IDs unless they ask for them.",
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of emails to retrieve. Default: 20, Max: 100, Min: 1',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'Email ID after which to retrieve more emails (for forward pagination). Cannot be used with "before".',
        ),
      before: z
        .string()
        .optional()
        .describe(
          'Email ID before which to retrieve more emails (for backward pagination). Cannot be used with "after".',
        ),
    },
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing received emails with limit: ${limit}, after: ${after}, before: ${before}`,
      );

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.emails.receiving.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list received emails: ${JSON.stringify(response.error)}`,
        );
      }

      const emails = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (emails.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No received emails found.',
            },
          ],
        };
      }

      const emailSummaries = emails
        .map((email) => {
          const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
          const attachmentCount = email.attachments?.length ?? 0;
          const attachmentInfo =
            attachmentCount > 0 ? ` | Attachments: ${attachmentCount}` : '';
          return `- From: ${email.from} | To: ${to} | Subject: "${email.subject}" | Received: ${email.created_at}${attachmentInfo} | ID: ${email.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${emails.length} received email(s)${hasMore ? ' (more available)' : ''}:\n\n${emailSummaries}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get-received-email',
    'Retrieve full details of a specific received email by ID, including HTML and plain text content, headers, and raw email download URL.',
    {
      id: z.string().describe('The received email ID to retrieve'),
    },
    async ({ id }) => {
      console.error(`Debug - Getting received email with ID: ${id}`);

      const response = await resend.emails.receiving.get(id);

      if (response.error) {
        throw new Error(
          `Failed to retrieve received email: ${JSON.stringify(response.error)}`,
        );
      }

      const email = response.data;

      if (!email) {
        throw new Error(`Received email with ID ${id} not found.`);
      }

      const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
      const cc = email.cc
        ? Array.isArray(email.cc)
          ? email.cc.join(', ')
          : email.cc
        : null;
      const bcc = email.bcc
        ? Array.isArray(email.bcc)
          ? email.bcc.join(', ')
          : email.bcc
        : null;
      const replyTo = email.reply_to
        ? Array.isArray(email.reply_to)
          ? email.reply_to.join(', ')
          : email.reply_to
        : null;

      let details = 'Received Email Details:\n';
      details += `- ID: ${email.id}\n`;
      details += `- From: ${email.from}\n`;
      details += `- To: ${to}\n`;
      if (cc) details += `- CC: ${cc}\n`;
      if (bcc) details += `- BCC: ${bcc}\n`;
      if (replyTo) details += `- Reply-To: ${replyTo}\n`;
      details += `- Subject: ${email.subject}\n`;
      details += `- Message ID: ${email.message_id}\n`;
      details += `- Received: ${email.created_at}\n`;
      if (email.raw) {
        details += `- Raw Email URL: ${email.raw.download_url} (expires: ${email.raw.expires_at})\n`;
      }
      if (email.attachments && email.attachments.length > 0) {
        details += `- Attachments: ${email.attachments.map((a) => `${a.filename} (${a.content_type}, ${a.size} bytes)`).join(', ')}\n`;
      }
      details += `\n--- Plain Text Content ---\n${email.text || '(none)'}\n`;
      if (email.html) {
        details += `\n--- HTML Content ---\n${email.html}\n`;
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

  server.tool(
    'list-received-email-attachments',
    'List all attachments from a specific received email. Returns attachment metadata including filename, size, content type, and a time-limited download URL.',
    {
      emailId: z.string().describe('The received email ID'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of attachments to retrieve. Default: 20, Max: 100, Min: 1',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'Attachment ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
        ),
      before: z
        .string()
        .optional()
        .describe(
          'Attachment ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
        ),
    },
    async ({ emailId, limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(
        `Debug - Listing attachments for received email: ${emailId}`,
      );

      const paginationOptions = after
        ? { emailId, limit, after }
        : before
          ? { emailId, limit, before }
          : { emailId, limit };

      const response =
        await resend.emails.receiving.attachments.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list attachments: ${JSON.stringify(response.error)}`,
        );
      }

      const attachments = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (attachments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No attachments found for this email.',
            },
          ],
        };
      }

      const attachmentSummaries = attachments
        .map(
          (att) =>
            `- ${att.filename} | Type: ${att.content_type} | Size: ${att.size} bytes | Download: ${att.download_url} (expires: ${att.expires_at}) | ID: ${att.id}`,
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${attachments.length} attachment(s)${hasMore ? ' (more available)' : ''}:\n\n${attachmentSummaries}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get-received-email-attachment',
    'Retrieve details of a specific attachment from a received email, including a time-limited download URL.',
    {
      emailId: z.string().describe('The received email ID'),
      id: z.string().describe('The attachment ID'),
    },
    async ({ emailId, id }) => {
      console.error(
        `Debug - Getting attachment ${id} for received email: ${emailId}`,
      );

      const response = await resend.emails.receiving.attachments.get({
        emailId,
        id,
      });

      if (response.error) {
        throw new Error(
          `Failed to retrieve attachment: ${JSON.stringify(response.error)}`,
        );
      }

      const attachment = response.data;

      if (!attachment) {
        throw new Error(`Attachment ${id} not found for email ${emailId}.`);
      }

      let details = 'Attachment Details:\n';
      details += `- ID: ${attachment.id}\n`;
      details += `- Filename: ${attachment.filename}\n`;
      details += `- Content Type: ${attachment.content_type}\n`;
      details += `- Size: ${attachment.size} bytes\n`;
      details += `- Content Disposition: ${attachment.content_disposition}\n`;
      if (attachment.content_id) {
        details += `- Content ID: ${attachment.content_id}\n`;
      }
      details += `- Download URL: ${attachment.download_url}\n`;
      details += `- Expires At: ${attachment.expires_at}\n`;

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

  server.tool(
    'cancel-email',
    'Cancel a scheduled email that has not yet been sent. Only works for emails that were scheduled using the scheduledAt parameter.',
    {
      id: z.string().describe('The ID of the scheduled email to cancel'),
    },
    async ({ id }) => {
      console.error(`Debug - Cancelling email with ID: ${id}`);

      const response = await resend.emails.cancel(id);

      if (response.error) {
        throw new Error(
          `Failed to cancel email: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Email ${response.data?.id} has been cancelled successfully.`,
          },
        ],
      };
    },
  );

  server.tool(
    'update-email',
    'Reschedule a scheduled email by updating its scheduled send time. Only works for emails that were scheduled and have not yet been sent.',
    {
      id: z.string().describe('The ID of the scheduled email to update'),
      scheduledAt: z
        .string()
        .describe(
          'The new scheduled time in ISO 8601 format (e.g., "2024-08-05T11:52:01.858Z").',
        ),
    },
    async ({ id, scheduledAt }) => {
      console.error(
        `Debug - Updating email ${id} with scheduledAt: ${scheduledAt}`,
      );

      const response = await resend.emails.update({ id, scheduledAt });

      if (response.error) {
        throw new Error(
          `Failed to update email: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Email ${response.data?.id} has been rescheduled to ${scheduledAt}.`,
          },
        ],
      };
    },
  );

  server.tool(
    'list-sent-email-attachments',
    'List all attachments from a specific sent email. Returns attachment metadata including filename, size, content type, and a time-limited download URL.',
    {
      emailId: z.string().describe('The sent email ID'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Number of attachments to retrieve. Default: 20, Max: 100, Min: 1',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'Attachment ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
        ),
      before: z
        .string()
        .optional()
        .describe(
          'Attachment ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
        ),
    },
    async ({ emailId, limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      console.error(`Debug - Listing attachments for sent email: ${emailId}`);

      const paginationOptions = after
        ? { emailId, limit, after }
        : before
          ? { emailId, limit, before }
          : { emailId, limit };

      const response = await resend.emails.attachments.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list attachments: ${JSON.stringify(response.error)}`,
        );
      }

      const attachments = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (attachments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No attachments found for this email.',
            },
          ],
        };
      }

      const attachmentSummaries = attachments
        .map(
          (att) =>
            `- ${att.filename} | Type: ${att.content_type} | Size: ${att.size} bytes | Download: ${att.download_url} (expires: ${att.expires_at}) | ID: ${att.id}`,
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${attachments.length} attachment(s)${hasMore ? ' (more available)' : ''}:\n\n${attachmentSummaries}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get-sent-email-attachment',
    'Retrieve details of a specific attachment from a sent email, including a time-limited download URL.',
    {
      emailId: z.string().describe('The sent email ID'),
      id: z.string().describe('The attachment ID'),
    },
    async ({ emailId, id }) => {
      console.error(
        `Debug - Getting attachment ${id} for sent email: ${emailId}`,
      );

      const response = await resend.emails.attachments.get({
        emailId,
        id,
      });

      if (response.error) {
        throw new Error(
          `Failed to retrieve attachment: ${JSON.stringify(response.error)}`,
        );
      }

      const attachment = response.data;

      if (!attachment) {
        throw new Error(`Attachment ${id} not found for email ${emailId}.`);
      }

      let details = 'Attachment Details:\n';
      details += `- ID: ${attachment.id}\n`;
      details += `- Filename: ${attachment.filename}\n`;
      details += `- Content Type: ${attachment.content_type}\n`;
      details += `- Size: ${attachment.size} bytes\n`;
      details += `- Content Disposition: ${attachment.content_disposition}\n`;
      if (attachment.content_id) {
        details += `- Content ID: ${attachment.content_id}\n`;
      }
      details += `- Download URL: ${attachment.download_url}\n`;
      details += `- Expires At: ${attachment.expires_at}\n`;

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

  server.tool(
    'send-batch-emails',
    'Send multiple emails in a single API call (up to 100 emails). Each email in the batch has the same options as send-email.',
    {
      emails: z
        .array(
          z.object({
            to: z
              .string()
              .email()
              .array()
              .min(1)
              .max(50)
              .describe('Array of recipient email addresses (1-50 recipients)'),
            subject: z.string().describe('Email subject line'),
            text: z.string().describe('Plain text email content'),
            html: z.string().optional().describe('HTML email content'),
            from: z
              .string()
              .optional()
              .describe(
                'Sender email address. Falls back to the configured default sender if not provided.',
              ),
            replyTo: z
              .string()
              .email()
              .array()
              .optional()
              .describe('Reply-to email addresses'),
            cc: z
              .string()
              .email()
              .array()
              .optional()
              .describe('CC email addresses'),
            bcc: z
              .string()
              .email()
              .array()
              .optional()
              .describe('BCC email addresses'),
            scheduledAt: z
              .string()
              .optional()
              .describe(
                "Optional schedule time. Uses natural language (e.g., 'tomorrow at 10am') or ISO 8601.",
              ),
            tags: z
              .array(
                z.object({
                  name: z.string().describe('Tag name (key)'),
                  value: z.string().describe('Tag value'),
                }),
              )
              .optional()
              .describe('Custom tags for tracking/analytics'),
            topicId: z
              .string()
              .optional()
              .describe('Topic ID for subscription-based sending'),
          }),
        )
        .min(1)
        .max(100)
        .describe('Array of email objects to send (1-100 emails)'),
    },
    async ({ emails }) => {
      console.error(`Debug - Sending batch of ${emails.length} emails`);

      const emailRequests = emails.map((email) => {
        const fromAddress = email.from ?? senderEmailAddress;
        const replyToAddresses = email.replyTo ?? replierEmailAddresses;

        if (typeof fromAddress !== 'string') {
          throw new Error(
            `from address must be provided for email to ${email.to.join(', ')}`,
          );
        }

        const request: Record<string, unknown> = {
          to: email.to,
          subject: email.subject,
          text: email.text,
          from: fromAddress,
          replyTo: replyToAddresses,
        };

        if (email.html) request.html = email.html;
        if (email.cc) request.cc = email.cc;
        if (email.bcc) request.bcc = email.bcc;
        if (email.scheduledAt) request.scheduledAt = email.scheduledAt;
        if (email.tags && email.tags.length > 0) request.tags = email.tags;
        if (email.topicId) request.topicId = email.topicId;

        return request;
      });

      const response = await resend.batch.send(
        emailRequests as unknown as Parameters<typeof resend.batch.send>[0],
      );

      if (response.error) {
        throw new Error(`Batch send failed: ${JSON.stringify(response.error)}`);
      }

      const ids = response.data?.data?.map((e) => e.id) ?? [];

      return {
        content: [
          {
            type: 'text',
            text: `Batch sent successfully! ${ids.length} email(s) queued.\nIDs: ${ids.join(', ')}`,
          },
        ],
      };
    },
  );
}
