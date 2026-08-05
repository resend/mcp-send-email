import type {
  EmailApprovalAttachmentInput,
  EmailApprovalAttachmentSummary,
  EmailApprovalDraftInput,
} from '../lib/email-approval-store.js';

export interface EditableApprovalDraft {
  draftId: string;
  revisionId: string;
  expiresAt: string;
  message: Omit<EmailApprovalDraftInput, 'attachments'>;
  attachments: EmailApprovalAttachmentSummary[];
}

export interface EmailApprovalDraftUpdate {
  message: Omit<EmailApprovalDraftInput, 'attachments'>;
  retainAttachmentIds: string[];
  newAttachments: EmailApprovalAttachmentInput[];
}

/** Returns a safe, human-readable diagnostic from an MCP tool error result. */
export function describeToolError(result: {
  content?: Array<{ type?: unknown; text?: unknown }>;
}): string {
  const message = result.content?.find(
    (content): content is { type: 'text'; text: string } =>
      content.type === 'text' && typeof content.text === 'string',
  )?.text;

  return message || 'Email Studio could not save your changes.';
}

export function buildUpdateArguments(
  draft: EditableApprovalDraft,
  update: EmailApprovalDraftUpdate,
): EmailApprovalDraftUpdate & { draftId: string; revisionId: string } {
  return {
    draftId: draft.draftId,
    revisionId: draft.revisionId,
    ...update,
  };
}
