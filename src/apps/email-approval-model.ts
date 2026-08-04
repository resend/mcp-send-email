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
