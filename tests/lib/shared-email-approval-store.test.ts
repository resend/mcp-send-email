import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSharedEmailApprovalStore,
  stopSharedEmailApprovalStoresForTest,
} from '../../src/lib/shared-email-approval-store.js';

afterEach(async () => {
  await stopSharedEmailApprovalStoresForTest();
});

describe('shared EmailApprovalStore', () => {
  it('lets a second local MCP process update a draft created by the first', async () => {
    const sharedKey = randomUUID();
    const preparingProcess = await createSharedEmailApprovalStore(sharedKey);
    const approvalProcess = await createSharedEmailApprovalStore(sharedKey);
    const created = await preparingProcess.create({
      from: 'Acme <hello@acme.com>',
      to: ['ada@example.com'],
      replyTo: 'support@acme.com',
      subject: 'Original',
      text: 'Hi Ada',
    });

    const updated = await approvalProcess.update({
      draftId: created.draftId,
      revisionId: created.revisionId,
      message: {
        from: 'Acme <hello@acme.com>',
        to: ['ada@example.com'],
        replyTo: 'support@acme.com',
        subject: 'Edited in Email Studio',
        text: 'Hi Ada',
      },
      retainAttachmentIds: [],
      newAttachments: [],
    });

    expect(updated.revisionId).not.toBe(created.revisionId);
  });
});
