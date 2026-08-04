import { createHash, randomUUID } from 'node:crypto';

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

  constructor({
    now = Date.now,
    maxAttachmentBytes = 40 * 1024 * 1024,
  }: {
    now?: () => number;
    maxAttachmentBytes?: number;
  } = {}) {
    this.now = now;
    this.maxAttachmentBytes = maxAttachmentBytes;
  }

  create(input: EmailApprovalDraftInput): EmailApprovalDraftSummary {
    this.purgeExpired();
    if (this.drafts.size >= 3) {
      throw new Error('A session can have at most three pending drafts.');
    }
    const attachments = this.createAttachments(input.attachments ?? []);
    this.assertAttachmentLimit(attachments);
    const summary: EmailApprovalDraftSummary = {
      draftId: randomUUID(),
      revisionId: randomUUID(),
      expiresAt: new Date(this.now() + 15 * 60 * 1000).toISOString(),
      attachments: attachments.map(({ content: _content, ...attachment }) =>
        attachment,
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

    const retainedAttachments = retainAttachmentIds.map((attachmentId) => {
      const attachment = draft.attachments.find(
        (candidate) => candidate.id === attachmentId,
      );
      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} was not found in this draft.`);
      }
      return attachment;
    });
    const addedAttachments = this.createAttachments(newAttachments);
    const attachments = [...retainedAttachments, ...addedAttachments];
    this.assertAttachmentLimit(attachments, draftId);
    const summary: EmailApprovalDraftSummary = {
      ...draft.summary,
      revisionId: randomUUID(),
      attachments: attachments.map(({ content: _content, ...attachment }) =>
        attachment,
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

  private assertAttachmentLimit(
    candidateAttachments: StoredAttachment[],
    replacingDraftId?: string,
  ): void {
    const storedBytes = [...this.drafts.entries()]
      .filter(([draftId]) => draftId !== replacingDraftId)
      .flatMap(([, draft]) => draft.attachments)
      .reduce((total, attachment) => total + attachment.size, 0);
    const candidateBytes = candidateAttachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    if (storedBytes + candidateBytes > this.maxAttachmentBytes) {
      throw new Error('Pending drafts exceed the attachment limit for this session.');
    }
  }
}
