// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({
  callServerTool: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  ontoolresult: undefined as
    | ((params: { structuredContent: unknown }) => void)
    | undefined,
}));

vi.mock('@modelcontextprotocol/ext-apps', () => ({
  App: class {
    callServerTool = app.callServerTool;
    connect = app.connect;

    get ontoolresult() {
      return app.ontoolresult;
    }

    set ontoolresult(handler) {
      app.ontoolresult = handler;
    }
  },
}));

const draft = {
  draftId: 'draft_1',
  revisionId: 'revision_1',
  expiresAt: '2026-08-05T14:10:00.000Z',
  message: {
    from: 'Acme <hello@acme.com>',
    to: ['ada@example.com'],
    replyTo: 'support@acme.com',
    subject: 'Original subject',
    text: 'Original text',
  },
  attachments: [
    {
      id: 'attachment_1',
      filename: 'invoice.pdf',
      size: 4,
      sha256: 'a'.repeat(64),
    },
  ],
};

describe('Email Studio composer', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<main id="app"></main>';
    app.ontoolresult = undefined;
    app.callServerTool.mockReset();
    await import('../../src/apps/email-approval.js');
    app.ontoolresult?.({ structuredContent: draft });
  });

  it('keeps unsaved field edits when an attachment is removed', () => {
    const form = document.querySelector('form')!;
    (form.elements.namedItem('subject') as HTMLInputElement).value =
      'Edited subject';
    (form.elements.namedItem('text') as HTMLTextAreaElement).value =
      'Edited body';
    (form.elements.namedItem('tags') as HTMLTextAreaElement).value =
      '{invalid while editing';

    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Remove')!
      .click();

    const updatedForm = document.querySelector('form')!;
    expect(
      (updatedForm.elements.namedItem('subject') as HTMLInputElement).value,
    ).toBe('Edited subject');
    expect(
      (updatedForm.elements.namedItem('text') as HTMLTextAreaElement).value,
    ).toBe('Edited body');
    expect(
      (updatedForm.elements.namedItem('tags') as HTMLTextAreaElement).value,
    ).toBe('{invalid while editing');
  });

  it('keeps unsaved field edits when a file is added', async () => {
    const form = document.querySelector('form')!;
    (form.elements.namedItem('subject') as HTMLInputElement).value =
      'Edited subject';
    (form.elements.namedItem('text') as HTMLTextAreaElement).value =
      'Edited body';
    const files = form.querySelector<HTMLInputElement>('#files')!;
    Object.defineProperty(files, 'files', {
      value: [
        {
          name: 'notes.txt',
          size: 5,
          type: 'text/plain',
          arrayBuffer: async () => new TextEncoder().encode('notes').buffer,
        },
      ],
    });

    files.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(document.querySelector('#attachments')?.textContent).toContain(
        'notes.txt',
      );
    });

    expect((form.elements.namedItem('subject') as HTMLInputElement).value).toBe(
      'Edited subject',
    );
    expect((form.elements.namedItem('text') as HTMLTextAreaElement).value).toBe(
      'Edited body',
    );
  });

  it('prevents approval until selected attachments have finished loading', async () => {
    const form = document.querySelector('form')!;
    let resolveFile: ((value: ArrayBuffer) => void) | undefined;
    const files = form.querySelector<HTMLInputElement>('#files')!;
    Object.defineProperty(files, 'files', {
      value: [
        {
          name: 'slow.txt',
          size: 4,
          type: 'text/plain',
          arrayBuffer: () =>
            new Promise<ArrayBuffer>((resolve) => {
              resolveFile = resolve;
            }),
        },
      ],
    });

    files.dispatchEvent(new Event('change'));

    const approve = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Approve and send',
    )!;
    expect(approve.disabled).toBe(true);

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(app.callServerTool).not.toHaveBeenCalled();

    resolveFile!(new TextEncoder().encode('slow').buffer);
    await vi.waitFor(() => expect(approve.disabled).toBe(false));
  });

  it('rejects selected files whose combined encoded size exceeds the delivery limit', async () => {
    const form = document.querySelector('form')!;
    const firstArrayBuffer = vi.fn();
    const secondArrayBuffer = vi.fn();
    const files = form.querySelector<HTMLInputElement>('#files')!;
    Object.defineProperty(files, 'files', {
      value: [
        {
          name: 'maximum.bin',
          size: 30_000_000,
          type: 'application/octet-stream',
          arrayBuffer: firstArrayBuffer,
        },
        {
          name: 'one-byte-more.bin',
          size: 1,
          type: 'application/octet-stream',
          arrayBuffer: secondArrayBuffer,
        },
      ],
    });

    files.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      expect(document.querySelector('#status')?.textContent).toContain(
        'attachment limit',
      );
    });
    expect(firstArrayBuffer).not.toHaveBeenCalled();
    expect(secondArrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects an oversized file before reading it into the composer', async () => {
    const form = document.querySelector('form')!;
    const arrayBuffer = vi.fn();
    const files = form.querySelector<HTMLInputElement>('#files')!;
    Object.defineProperty(files, 'files', {
      value: [
        {
          name: 'too-large.bin',
          size: 30_000_001,
          type: 'application/octet-stream',
          arrayBuffer,
        },
      ],
    });

    files.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      expect(document.querySelector('#status')?.textContent).toContain(
        'too large',
      );
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('keeps the composer open and shows a tool error when cancellation fails', async () => {
    app.callServerTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'Draft could not be cancelled.' }],
    });

    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Cancel draft')!
      .click();

    await vi.waitFor(() => {
      expect(document.querySelector('#status')?.textContent).toBe(
        'Draft could not be cancelled.',
      );
    });
    expect(document.querySelector('form')).not.toBeNull();
  });

  it("shows Resend's error after a consumed draft cannot be sent", async () => {
    app.callServerTool.mockImplementation(({ name }) => {
      if (name === 'update-email-approval') {
        return Promise.resolve({
          isError: false,
          structuredContent: { revisionId: 'revision_2' },
        });
      }
      return Promise.resolve({
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Email failed to send: recipient is not permitted.',
          },
        ],
      });
    });

    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('recipient is not permitted');
    });
  });

  it('renders a subject as text instead of interpolating it as HTML', () => {
    const subject = '"><button id="injected">Injected</button><input value="';
    app.ontoolresult?.({
      structuredContent: {
        ...draft,
        message: { ...draft.message, subject },
      },
    });

    expect(document.querySelector('#injected')).toBeNull();
    expect(
      (
        document
          .querySelector('form')!
          .elements.namedItem('subject') as HTMLInputElement
      ).value,
    ).toBe(subject);
  });
});
