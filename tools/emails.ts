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
  server.tool(
    'send-email',
    'Send an email using Resend',
    {
      to: z
        .string()
        .email()
        .array()
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
        .string()
        .email()
        .array()
        .optional()
        .describe(
          'Optional array of CC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
        ),
      bcc: z
        .string()
        .email()
        .array()
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
              .describe('Name of the file with extension (e.g., "report.pdf")'),
            filePath: z
              .string()
              .optional()
              .describe('Local file path to read and attach'),
            url: z
              .string()
              .optional()
              .describe('URL where the file is hosted (Resend will fetch it)'),
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
      // If sender email address is not provided, the tool requires it as an argument
      ...(!senderEmailAddress
        ? {
            from: z
              .string()
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
              .string()
              .email()
              .array()
              .optional()
              .describe(
                'Optional email addresses for the email readers to reply to. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
              ),
          }
        : {}),
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
}
