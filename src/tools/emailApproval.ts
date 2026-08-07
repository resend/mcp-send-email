import { readFile } from 'node:fs/promises';
import {
  getUiCapability,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';
import {
  type ConsumedEmailApprovalDraft,
  type EmailApprovalAttachmentInput,
  type EmailApprovalDraftInput,
  type EmailApprovalDraftSummary,
  EmailApprovalStore,
  type UpdateEmailApprovalDraftInput,
} from '../lib/email-approval-store.js';
import { createSharedEmailApprovalStore } from '../lib/shared-email-approval-store.js';

const EMAIL_APPROVAL_RESOURCE = 'ui://resend/email-approval';

const attachmentSchema = z
  .object({
    filename: z.string().min(1),
    content: z.string().min(1),
    contentType: z.string().optional(),
    contentId: z.string().optional(),
  })
  .strict();

const emailTagSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  value: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
});

const headersSchema = z
  .record(z.string().min(1).max(256), z.string().max(2_000))
  .refine((headers) => Object.keys(headers).length <= 50, {
    message: 'At most 50 custom headers are allowed.',
  });

const messageSchema = z.object({
  from: z.string().min(1),
  to: z.array(z.email()).min(1).max(50),
  replyTo: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  subject: z.string().min(1),
  text: z.string(),
  html: z.string().optional(),
  cc: z.array(z.email()).optional(),
  bcc: z.array(z.email()).optional(),
  scheduledAt: z.string().optional(),
  tags: z.array(emailTagSchema).max(75).optional(),
  topicId: z.string().optional(),
  headers: headersSchema.optional(),
  idempotencyKey: z.string().min(1).max(256).optional(),
});

const attachmentSummarySchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  contentType: z.string().optional(),
  size: z.number().nonnegative(),
  sha256: z.string(),
});

const draftSummarySchema = z.object({
  draftId: z.string().uuid(),
  revisionId: z.string().uuid(),
  expiresAt: z.string(),
  attachments: z.array(attachmentSummarySchema),
});

function supportsUi(server: McpServer): boolean {
  const capability = getUiCapability(server.server.getClientCapabilities());
  return capability?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false;
}

function reviewPreview(message: EmailApprovalDraftInput): string {
  const replyTo = Array.isArray(message.replyTo)
    ? message.replyTo.join(', ')
    : message.replyTo;
  return `Email Studio review-only preview (this client does not support MCP Apps; nothing was saved or sent):\n\nFrom: ${message.from}\nTo: ${message.to.join(', ')}\nReply-To: ${replyTo}\nSubject: ${message.subject}\n\n${message.text}`;
}

function uiMetadata(visibility: Array<'model' | 'app'>) {
  return {
    ui: { resourceUri: EMAIL_APPROVAL_RESOURCE, visibility },
  };
}

type ApprovalStore = {
  create(
    input: EmailApprovalDraftInput,
  ): EmailApprovalDraftSummary | Promise<EmailApprovalDraftSummary>;
  update(
    input: UpdateEmailApprovalDraftInput,
  ): EmailApprovalDraftSummary | Promise<EmailApprovalDraftSummary>;
  consume(
    draftId: string,
    revisionId: string,
  ): ConsumedEmailApprovalDraft | Promise<ConsumedEmailApprovalDraft>;
  cancel(draftId: string): boolean | Promise<boolean>;
};

export function addEmailApprovalTools(
  server: McpServer,
  resend: Resend,
  {
    senderEmailAddress,
    replierEmailAddresses = [],
    sharedStoreKey,
  }: {
    senderEmailAddress?: string;
    replierEmailAddresses?: string[];
    sharedStoreKey?: string;
  },
): void {
  let storePromise: Promise<ApprovalStore> | undefined;
  const getStore = (): Promise<ApprovalStore> => {
    if (!storePromise) {
      storePromise = sharedStoreKey
        ? createSharedEmailApprovalStore(sharedStoreKey)
        : Promise.resolve(new EmailApprovalStore());
    }
    return storePromise;
  };

  registerAppResource(
    server,
    'Email Studio approval composer',
    EMAIL_APPROVAL_RESOURCE,
    {
      description: 'A human approval composer for transactional emails.',
      _meta: {
        ui: {
          csp: { connectDomains: [], resourceDomains: [] },
        },
      },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            new URL('../apps/email-approval.html', import.meta.url),
            'utf8',
          ),
        },
      ],
    }),
  );

  const prepareSchema = messageSchema
    .omit({ from: true, replyTo: true })
    .extend({
      attachments: z.array(attachmentSchema).optional(),
      ...(!senderEmailAddress ? { from: z.string().min(1) } : {}),
      ...(replierEmailAddresses.length === 0
        ? {
            replyTo: z.union([
              z.string().min(1),
              z.array(z.string().min(1)).min(1),
            ]),
          }
        : {}),
    });

  registerAppTool(
    server,
    'prepare-email-approval',
    {
      title: 'Prepare Email for Human Approval',
      description:
        'Prepare a transactional email for review in Email Studio. It sends only after a person approves the exact reviewed revision.',
      inputSchema: prepareSchema,
      _meta: uiMetadata(['model', 'app']),
    },
    async (input) => {
      const rawInput = input as Omit<
        EmailApprovalDraftInput,
        'from' | 'replyTo' | 'attachments'
      > &
        Partial<Pick<EmailApprovalDraftInput, 'from' | 'replyTo'>> & {
          attachments?: EmailApprovalAttachmentInput[];
        };
      const message: EmailApprovalDraftInput = {
        ...rawInput,
        from: senderEmailAddress ?? rawInput.from ?? '',
        replyTo:
          replierEmailAddresses.length > 0
            ? replierEmailAddresses
            : (rawInput.replyTo ?? ''),
      };

      if (!supportsUi(server)) {
        return { content: [{ type: 'text', text: reviewPreview(message) }] };
      }

      const summary = await getStore().then((store) => store.create(message));
      const { attachments: _attachments, ...editableMessage } = message;
      return {
        content: [
          {
            type: 'text',
            text: 'Email Studio draft ready for human review. It expires in 15 minutes.',
          },
        ],
        structuredContent: {
          ...summary,
          message: editableMessage,
          lockedFields: {
            from: Boolean(senderEmailAddress),
            replyTo: replierEmailAddresses.length > 0,
          },
        },
      };
    },
  );

  registerAppTool(
    server,
    'update-email-approval',
    {
      title: 'Update Email Approval Draft',
      description: 'Update the pending Email Studio draft before approval.',
      inputSchema: z.object({
        draftId: z.string().uuid(),
        revisionId: z.string().uuid(),
        message: messageSchema,
        retainAttachmentIds: z.array(z.string().uuid()),
        newAttachments: z.array(attachmentSchema),
      }),
      outputSchema: draftSummarySchema,
      _meta: uiMetadata(['app']),
    },
    async ({
      draftId,
      revisionId,
      message: inputMessage,
      retainAttachmentIds,
      newAttachments,
    }) => {
      if (!supportsUi(server)) {
        throw new Error('Email Studio requires an MCP Apps-capable client.');
      }
      const message: Omit<EmailApprovalDraftInput, 'attachments'> = {
        ...inputMessage,
        from: senderEmailAddress ?? inputMessage.from,
        replyTo:
          replierEmailAddresses.length > 0
            ? replierEmailAddresses
            : inputMessage.replyTo,
      };
      const summary = await getStore().then((store) =>
        store.update({
          draftId,
          revisionId,
          message,
          retainAttachmentIds,
          newAttachments: newAttachments as EmailApprovalAttachmentInput[],
        }),
      );
      return {
        content: [{ type: 'text', text: 'Email Studio draft updated.' }],
        structuredContent: { ...summary },
      };
    },
  );

  registerAppTool(
    server,
    'approve-email-approval',
    {
      title: 'Approve and Send Email Draft',
      description: 'Send the exact pending Email Studio draft revision once.',
      inputSchema: z.object({
        draftId: z.string().uuid(),
        revisionId: z.string().uuid(),
      }),
      _meta: uiMetadata(['app']),
    },
    async ({ draftId, revisionId }) => {
      if (!supportsUi(server)) {
        throw new Error('Email Studio requires an MCP Apps-capable client.');
      }
      const draft = await getStore().then((store) =>
        store.consume(draftId, revisionId),
      );
      const response = await resend.emails.send(
        {
          ...draft.message,
          attachments: draft.attachments,
        },
        draft.message.idempotencyKey
          ? { idempotencyKey: draft.message.idempotencyKey }
          : undefined,
      );
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
        structuredContent: { id: response.data?.id },
      };
    },
  );

  registerAppTool(
    server,
    'cancel-email-approval',
    {
      title: 'Cancel Email Approval Draft',
      description: 'Discard a pending Email Studio draft without sending it.',
      inputSchema: z.object({ draftId: z.string().uuid() }),
      _meta: uiMetadata(['app']),
    },
    async ({ draftId }) => {
      if (!supportsUi(server)) {
        throw new Error('Email Studio requires an MCP Apps-capable client.');
      }
      if (!(await getStore().then((store) => store.cancel(draftId)))) {
        throw new Error('Email approval draft was not found.');
      }
      return {
        content: [{ type: 'text', text: 'Email Studio draft cancelled.' }],
      };
    },
  );
}
