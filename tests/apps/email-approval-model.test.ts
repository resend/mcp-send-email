import { describe, expect, it } from 'vitest';
import {
  buildUpdateArguments,
  describeToolError,
} from '../../src/apps/email-approval-model.js';

describe('buildUpdateArguments', () => {
  it('keeps selected attachment IDs and includes newly selected attachment content', () => {
    const result = buildUpdateArguments(
      {
        draftId: 'draft_1',
        revisionId: 'revision_1',
        expiresAt: '2026-08-04T12:15:00.000Z',
        message: {
          from: 'Acme <hello@acme.com>',
          to: ['ada@example.com'],
          replyTo: 'support@acme.com',
          subject: 'Original',
          text: 'Hi Ada',
        },
        attachments: [
          {
            id: 'attachment_1',
            filename: 'invoice.pdf',
            size: 4,
            sha256: 'a'.repeat(64),
          },
        ],
      },
      {
        message: {
          from: 'Acme <hello@acme.com>',
          to: ['ada@example.com'],
          replyTo: 'support@acme.com',
          subject: 'Updated',
          text: 'Hi Ada',
        },
        retainAttachmentIds: ['attachment_1'],
        newAttachments: [
          {
            filename: 'notes.txt',
            content: Buffer.from('new').toString('base64'),
            contentType: 'text/plain',
          },
        ],
      },
    );

    expect(result).toMatchObject({
      draftId: 'draft_1',
      revisionId: 'revision_1',
      retainAttachmentIds: ['attachment_1'],
      newAttachments: [
        expect.objectContaining({
          filename: 'notes.txt',
          contentType: 'text/plain',
        }),
      ],
    });
    expect(result.message.subject).toBe('Updated');
  });
});

describe('describeToolError', () => {
  it('shows the host error text instead of a generic update failure', () => {
    expect(
      describeToolError({
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Tool update-email-approval is not available to this app.',
          },
        ],
      }),
    ).toBe('Tool update-email-approval is not available to this app.');
  });
});
