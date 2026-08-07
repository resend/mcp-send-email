import { createHash, randomUUID } from 'node:crypto';

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const MAX_EMAIL_ATTACHMENT_ENCODED_BYTES = 40_000_000;

function decodedBase64Size(content: string): number {
  if (!content || !BASE64_PATTERN.test(content)) {
    throw new Error('Attachment content must be valid Base64.');
  }
  const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

export interface EmailApprovalAttachmentInput {
  filename: string;
  content: string;
  contentType?: string;
  contentId?: string;
}

export interface EmailApprovalDraftInput {
  from: string;
  to: string[];
  replyTo: string | string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  scheduledAt?: string;
  tags?: Array<{ name: string; value: string }>;
  topicId?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  attachments?: EmailApprovalAttachmentInput[];
}

export interface EmailApprovalAttachmentSummary {
  id: string;
  filename: string;
  contentType?: string;
  contentId?: string;
  size: number;
  sha256: string;
}

export interface EmailApprovalDraftSummary {
  draftId: string;
  revisionId: string;
  expiresAt: string;
  attachments: EmailApprovalAttachmentSummary[];
}

interface StoredAttachment extends EmailApprovalAttachmentSummary {
  content: Buffer;
}

interface StoredDraft {
  summary: EmailApprovalDraftSummary;
  input: Omit<EmailApprovalDraftInput, 'attachments'>;
  attachments: StoredAttachment[];
}

export interface ConsumedEmailApprovalDraft {
  message: Omit<EmailApprovalDraftInput, 'attachments'>;
  attachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    contentId?: string;
  }>;
}

export interface UpdateEmailApprovalDraftInput {
  draftId: string;
  revisionId: string;
  message: Omit<EmailApprovalDraftInput, 'attachments'>;
  retainAttachmentIds: string[];
  newAttachments: EmailApprovalAttachmentInput[];
}

export class EmailApprovalStore {
  private readonly drafts = new Map<string, StoredDraft>();
  private readonly now: () => number;
  private readonly maxAttachmentBytes: number;
  private readonly maxEncodedAttachmentBytes: number;

  constructor({
    now = Date.now,
    maxAttachmentBytes = 40 * 1024 * 1024,
    maxEncodedAttachmentBytes = MAX_EMAIL_ATTACHMENT_ENCODED_BYTES,
  }: {
    now?: () => number;
    maxAttachmentBytes?: number;
    maxEncodedAttachmentBytes?: number;
  } = {}) {
    this.now = now;
    this.maxAttachmentBytes = maxAttachmentBytes;
    this.maxEncodedAttachmentBytes = maxEncodedAttachmentBytes;
  }

  create(input: EmailApprovalDraftInput): EmailApprovalDraftSummary {
    this.purgeExpired();
    if (this.drafts.size >= 3) {
      throw new Error('A session can have at most three pending drafts.');
    }
    const attachmentInputs = input.attachments ?? [];
    this.assertInputAttachmentLimit(attachmentInputs);
    this.assertDeliveryAttachmentLimit([], attachmentInputs);
    const attachments = this.createAttachments(attachmentInputs);
    const summary: EmailApprovalDraftSummary = {
      draftId: randomUUID(),
      revisionId: randomUUID(),
      expiresAt: new Date(this.now() + 15 * 60 * 1000).toISOString(),
      attachments: attachments.map(
        ({ content: _content, ...attachment }) => attachment,
      ),
    };
    const { attachments: _attachments, ...message } = input;
    this.drafts.set(summary.draftId, {
      summary,
      input: message,
      attachments,
    });
    return summary;
  }

  update({
    draftId,
    revisionId,
    message,
    retainAttachmentIds,
    newAttachments,
  }: UpdateEmailApprovalDraftInput): EmailApprovalDraftSummary {
    this.purgeExpired();
    const draft = this.drafts.get(draftId);
    if (!draft || draft.summary.revisionId !== revisionId) {
      throw new Error('Email approval draft or revision was not found.');
    }
    if (new Set(retainAttachmentIds).size !== retainAttachmentIds.length) {
      throw new Error('An attachment cannot be retained more than once.');
    }

    const retainedAttachments = retainAttachmentIds.map((attachmentId) => {
      const attachment = draft.attachments.find(
        (candidate) => candidate.id === attachmentId,
      );
      if (!attachment) {
        throw new Error(
          `Attachment ${attachmentId} was not found in this draft.`,
        );
      }
      return attachment;
    });
    this.assertInputAttachmentLimit(
      newAttachments,
      draftId,
      retainedAttachments,
    );
    this.assertDeliveryAttachmentLimit(retainedAttachments, newAttachments);
    const addedAttachments = this.createAttachments(newAttachments);
    const attachments = [...retainedAttachments, ...addedAttachments];
    this.assertAttachmentLimit(attachments, draftId);
    const summary: EmailApprovalDraftSummary = {
      ...draft.summary,
      revisionId: randomUUID(),
      attachments: attachments.map(
        ({ content: _content, ...attachment }) => attachment,
      ),
    };
    this.drafts.set(draftId, { summary, input: message, attachments });
    return summary;
  }

  consume(draftId: string, revisionId: string): ConsumedEmailApprovalDraft {
    this.purgeExpired();
    const draft = this.drafts.get(draftId);
    if (!draft || draft.summary.revisionId !== revisionId) {
      throw new Error('Email approval draft or revision was not found.');
    }
    this.drafts.delete(draftId);
    return {
      message: draft.input,
      attachments: draft.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        contentId: attachment.contentId,
      })),
    };
  }

  cancel(draftId: string): boolean {
    this.purgeExpired();
    return this.drafts.delete(draftId);
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [draftId, draft] of this.drafts) {
      if (Date.parse(draft.summary.expiresAt) <= now) {
        this.drafts.delete(draftId);
      }
    }
  }

  private createAttachments(
    inputs: EmailApprovalAttachmentInput[],
  ): StoredAttachment[] {
    return inputs.map((attachment) => {
      const content = Buffer.from(attachment.content, 'base64');
      return {
        id: randomUUID(),
        filename: attachment.filename,
        contentType: attachment.contentType,
        contentId: attachment.contentId,
        content,
        size: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    });
  }

  private assertInputAttachmentLimit(
    attachmentInputs: EmailApprovalAttachmentInput[],
    replacingDraftId?: string,
    retainedAttachments: StoredAttachment[] = [],
  ): void {
    const storedBytes = this.storedAttachmentBytes(replacingDraftId);
    const retainedBytes = retainedAttachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    const inputBytes = attachmentInputs.reduce((total, attachment) => {
      return total + decodedBase64Size(attachment.content);
    }, 0);
    if (storedBytes + retainedBytes + inputBytes > this.maxAttachmentBytes) {
      throw new Error(
        'Pending drafts exceed the attachment limit for this session.',
      );
    }
  }

  private assertAttachmentLimit(
    candidateAttachments: StoredAttachment[],
    replacingDraftId?: string,
  ): void {
    const storedBytes = this.storedAttachmentBytes(replacingDraftId);
    const candidateBytes = candidateAttachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    if (storedBytes + candidateBytes > this.maxAttachmentBytes) {
      throw new Error(
        'Pending drafts exceed the attachment limit for this session.',
      );
    }
  }

  private assertDeliveryAttachmentLimit(
    retainedAttachments: StoredAttachment[],
    newAttachments: EmailApprovalAttachmentInput[],
  ): void {
    const retainedBytes = retainedAttachments.reduce(
      (total, attachment) => total + 4 * Math.ceil(attachment.size / 3),
      0,
    );
    const newBytes = newAttachments.reduce(
      (total, attachment) => total + attachment.content.length,
      0,
    );
    if (retainedBytes + newBytes > this.maxEncodedAttachmentBytes) {
      throw new Error(
        'Draft exceeds the delivery attachment limit after Base64 encoding.',
      );
    }
  }

  private storedAttachmentBytes(excludingDraftId?: string): number {
    return [...this.drafts.entries()]
      .filter(([draftId]) => draftId !== excludingDraftId)
      .flatMap(([, draft]) => draft.attachments)
      .reduce((total, attachment) => total + attachment.size, 0);
  }
}
