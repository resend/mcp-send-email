import { describe, expect, it } from 'vitest';
import { EmailApprovalStore } from '../../src/lib/email-approval-store.js';

describe('EmailApprovalStore', () => {
  it('creates a draft without exposing attachment bytes', () => {
    const store = new EmailApprovalStore();

    const summary = store.create({
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Your order is ready',
      text: 'Hi Ada',
      attachments: [
        {
          filename: 'invoice.pdf',
          content: Buffer.from('test').toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    expect(summary.draftId).toEqual(expect.any(String));
    expect(summary.revisionId).toEqual(expect.any(String));
    expect(summary.attachments).toEqual([
      expect.objectContaining({
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 4,
      }),
    ]);
    expect(summary.attachments[0]).not.toHaveProperty('content');
    expect(summary.attachments[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates a new revision while retaining a selected attachment', () => {
    const store = new EmailApprovalStore();
    const created = store.create({
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Original subject',
      text: 'Hi Ada',
      attachments: [
        {
          filename: 'invoice.pdf',
          content: Buffer.from('test').toString('base64'),
        },
      ],
    });

    const updated = store.update({
      draftId: created.draftId,
      revisionId: created.revisionId,
      message: {
        from: 'Acme <hello@acme.com>',
        to: ['ada@example.com'],
        replyTo: 'support@acme.com',
        subject: 'Updated subject',
        text: 'Hi Ada',
      },
      retainAttachmentIds: [created.attachments[0].id],
      newAttachments: [],
    });

    expect(updated.revisionId).not.toBe(created.revisionId);
    expect(updated.attachments).toEqual(created.attachments);
  });

  it('rejects an expired draft without extending its expiry on update', () => {
    let now = Date.UTC(2026, 7, 4, 12, 0, 0);
    const store = new EmailApprovalStore({ now: () => now });
    const created = store.create({
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Hello',
      text: 'Hi Ada',
    });

    now += 15 * 60 * 1000 + 1;

    expect(() =>
      store.update({
        draftId: created.draftId,
        revisionId: created.revisionId,
        message: {
          from: 'Acme <hello@acme.com>',
          to: ['ada@example.com'],
          replyTo: 'support@acme.com',
          subject: 'Hello',
          text: 'Updated',
        },
        retainAttachmentIds: [],
        newAttachments: [],
      }),
    ).toThrow('not found');
  });

  it('consumes a revision once and rejects a replay', () => {
    const store = new EmailApprovalStore();
    const created = store.create({
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Hello',
      text: 'Hi Ada',
    });

    const consumed = store.consume(created.draftId, created.revisionId);

    expect(consumed.message.subject).toBe('Hello');
    expect(() => store.consume(created.draftId, created.revisionId)).toThrow(
      'not found',
    );
  });

  it('limits a session to three pending drafts', () => {
    const store = new EmailApprovalStore();
    const input = {
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Hello',
      text: 'Hi Ada',
    };

    store.create(input);
    store.create(input);
    store.create(input);

    expect(() => store.create(input)).toThrow('three pending drafts');
  });

  it('rejects attachment snapshots beyond the session byte limit', () => {
    const store = new EmailApprovalStore({ maxAttachmentBytes: 4 });

    store.create({
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Hello',
      text: 'Hi Ada',
      attachments: [
        { filename: 'one.txt', content: Buffer.from('test').toString('base64') },
      ],
    });

    expect(() =>
      store.create({
        from: 'Acme <hello@acme.com>',
        to: ['ada@example.com'],
        replyTo: 'support@acme.com',
        subject: 'Hello',
        text: 'Hi Ada',
        attachments: [
          { filename: 'two.txt', content: Buffer.from('x').toString('base64') },
        ],
      }),
    ).toThrow('attachment limit');
  });
});
