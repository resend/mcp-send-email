import { App } from '@modelcontextprotocol/ext-apps';
import type {
  EmailApprovalAttachmentInput,
  EmailApprovalAttachmentSummary,
  EmailApprovalDraftInput,
} from '../lib/email-approval-store.js';
import {
  buildUpdateArguments,
  type EditableApprovalDraft,
} from './email-approval-model.js';

type DraftResult = EditableApprovalDraft & {
  lockedFields?: { from: boolean; replyTo: boolean };
};

const app = new App({ name: 'Resend Email Studio', version: '1.0.0' }, {});
const root = document.querySelector<HTMLElement>('#app');

let draft: DraftResult | undefined;
let retainedAttachmentIds = new Set<string>();
let newAttachments: EmailApprovalAttachmentInput[] = [];

function splitAddresses(value: string): string[] {
  return value
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

function optionalAddresses(value: string): string[] | undefined {
  const addresses = splitAddresses(value);
  return addresses.length > 0 ? addresses : undefined;
}

function parseOptionalJson<T>(value: string, label: string): T | undefined {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function messageFromForm(
  form: HTMLFormElement,
): Omit<EmailApprovalDraftInput, 'attachments'> {
  const values = new FormData(form);
  const replyTo = splitAddresses(String(values.get('replyTo') ?? ''));
  if (replyTo.length === 0) throw new Error('Reply-to is required.');

  return {
    from: String(values.get('from') ?? '').trim(),
    to: splitAddresses(String(values.get('to') ?? '')),
    replyTo,
    subject: String(values.get('subject') ?? '').trim(),
    text: String(values.get('text') ?? ''),
    html: String(values.get('html') ?? '') || undefined,
    cc: optionalAddresses(String(values.get('cc') ?? '')),
    bcc: optionalAddresses(String(values.get('bcc') ?? '')),
    scheduledAt: String(values.get('scheduledAt') ?? '').trim() || undefined,
    topicId: String(values.get('topicId') ?? '').trim() || undefined,
    idempotencyKey:
      String(values.get('idempotencyKey') ?? '').trim() || undefined,
    tags: parseOptionalJson(
      String(values.get('tags') ?? ''),
      'Tags',
    ) as EmailApprovalDraftInput['tags'],
    headers: parseOptionalJson(
      String(values.get('headers') ?? ''),
      'Headers',
    ) as EmailApprovalDraftInput['headers'],
  };
}

function renderStatus(message = '', isError = false): void {
  const status = document.querySelector<HTMLElement>('#status');
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(isError);
}

function attachmentRow(
  attachment: EmailApprovalAttachmentSummary,
): HTMLElement {
  const item = document.createElement('li');
  const details = document.createElement('span');
  details.textContent = `${attachment.filename} · ${attachment.contentType ?? 'unknown type'} · ${attachment.size} bytes · SHA-256 ${attachment.sha256}`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    retainedAttachmentIds.delete(attachment.id);
    render();
  });
  item.append(details, remove);
  return item;
}

function newAttachmentRow(
  attachment: EmailApprovalAttachmentInput,
): HTMLElement {
  const item = document.createElement('li');
  const details = document.createElement('span');
  details.textContent = `${attachment.filename} · ${attachment.contentType ?? 'unknown type'} · new attachment`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    newAttachments = newAttachments.filter(
      (candidate) => candidate !== attachment,
    );
    render();
  });
  item.append(details, remove);
  return item;
}

function renderPreview(html: string): void {
  const preview = document.querySelector<HTMLIFrameElement>('#html-preview');
  if (!preview) return;
  preview.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><body>${html}</body>`;
}

function render(): void {
  if (!root || !draft) return;
  const message = draft.message;
  root.replaceChildren();
  const form = document.createElement('form');
  form.innerHTML = `
    <style>
      :root { color: #172033; font-family: system-ui, sans-serif; }
      main { max-width: 760px; margin: 0 auto; padding: 20px; }
      fieldset { border: 1px solid #d8dee9; border-radius: 8px; margin: 0 0 14px; padding: 14px; }
      legend { font-weight: 700; } label { display: block; font-size: 14px; margin: 8px 0; }
      input, textarea { box-sizing: border-box; display: block; width: 100%; margin-top: 4px; padding: 8px; font: inherit; }
      textarea { min-height: 96px; } ul { padding-left: 18px; } li { display: flex; gap: 10px; justify-content: space-between; margin: 8px 0; }
      button { cursor: pointer; padding: 8px 12px; } #approve { background: #16794c; color: white; border: 0; border-radius: 5px; }
      #status[data-error="true"] { color: #b42318; } iframe { width: 100%; min-height: 180px; border: 1px solid #d8dee9; }
    </style>
    <h1>Review and approve email</h1>
    <p id="expiry"></p>
    <p id="status" role="status"></p>
    <fieldset><legend>Delivery</legend>
      <label>To<input name="to" required></label>
      <label>CC<input name="cc"></label>
      <label>BCC<input name="bcc"></label>
      <label>From<input name="from" required></label>
      <label>Reply-to<input name="replyTo" required></label>
    </fieldset>
    <fieldset><legend>Message</legend>
      <label>Subject<input name="subject" value="${message.subject}" required></label>
      <label>Plain text<textarea name="text" required></textarea></label>
      <label>HTML (optional)<textarea name="html"></textarea></label>
      <label>Rendered HTML preview<iframe id="html-preview" sandbox=""></iframe></label>
    </fieldset>
    <fieldset><legend>Attachments</legend><ul id="attachments"></ul>
      <label>Add Base64 snapshot via file picker<input id="files" type="file" multiple></label>
    </fieldset>
    <fieldset><legend>Advanced</legend>
      <label>Schedule<input name="scheduledAt" placeholder="tomorrow at 10am"></label>
      <label>Topic ID<input name="topicId"></label>
      <label>Idempotency key<input name="idempotencyKey"></label>
      <label>Tags JSON<textarea name="tags"></textarea></label>
      <label>Headers JSON<textarea name="headers"></textarea></label>
    </fieldset>
    <p><button id="cancel" type="button">Cancel draft</button> <button id="approve" type="submit">Approve and send</button></p>
  `;
  root.append(form);

  form.querySelector<HTMLElement>('#expiry')!.textContent =
    `This draft expires at ${draft.expiresAt}. Approval sends this exact saved revision once.`;
  (form.elements.namedItem('to') as HTMLInputElement).value =
    message.to.join(', ');
  (form.elements.namedItem('cc') as HTMLInputElement).value =
    message.cc?.join(', ') ?? '';
  (form.elements.namedItem('bcc') as HTMLInputElement).value =
    message.bcc?.join(', ') ?? '';
  const from = form.elements.namedItem('from') as HTMLInputElement;
  from.value = message.from;
  from.readOnly = draft.lockedFields?.from ?? false;
  const replyTo = form.elements.namedItem('replyTo') as HTMLInputElement;
  replyTo.value = Array.isArray(message.replyTo)
    ? message.replyTo.join(', ')
    : message.replyTo;
  replyTo.readOnly = draft.lockedFields?.replyTo ?? false;
  (form.elements.namedItem('scheduledAt') as HTMLInputElement).value =
    message.scheduledAt ?? '';
  (form.elements.namedItem('topicId') as HTMLInputElement).value =
    message.topicId ?? '';
  (form.elements.namedItem('idempotencyKey') as HTMLInputElement).value =
    message.idempotencyKey ?? '';

  const textarea = form.elements.namedItem('text') as HTMLTextAreaElement;
  textarea.value = message.text;
  const html = form.elements.namedItem('html') as HTMLTextAreaElement;
  html.value = message.html ?? '';
  const tags = form.elements.namedItem('tags') as HTMLTextAreaElement;
  tags.value = message.tags ? JSON.stringify(message.tags, null, 2) : '';
  const headers = form.elements.namedItem('headers') as HTMLTextAreaElement;
  headers.value = message.headers
    ? JSON.stringify(message.headers, null, 2)
    : '';
  renderPreview(html.value);
  html.addEventListener('input', () => renderPreview(html.value));

  const attachments = form.querySelector<HTMLUListElement>('#attachments');
  for (const attachment of draft.attachments) {
    if (retainedAttachmentIds.has(attachment.id))
      attachments?.append(attachmentRow(attachment));
  }
  for (const attachment of newAttachments)
    attachments?.append(newAttachmentRow(attachment));

  form
    .querySelector<HTMLInputElement>('#files')
    ?.addEventListener('change', async (event) => {
      const files = [
        ...((event.currentTarget as HTMLInputElement).files ?? []),
      ];
      newAttachments = [
        ...newAttachments,
        ...(await Promise.all(
          files.map(async (file) => ({
            filename: file.name,
            content: toBase64(await file.arrayBuffer()),
            contentType: file.type || undefined,
          })),
        )),
      ];
      render();
    });

  form
    .querySelector<HTMLButtonElement>('#cancel')
    ?.addEventListener('click', async () => {
      try {
        await app.callServerTool({
          name: 'cancel-email-approval',
          arguments: { draftId: draft?.draftId },
        });
        root.textContent = 'Email Studio draft cancelled.';
      } catch (error) {
        renderStatus(
          error instanceof Error ? error.message : 'Unable to cancel draft.',
          true,
        );
      }
    });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!draft) return;
    const approve = form.querySelector<HTMLButtonElement>('#approve');
    if (approve) approve.disabled = true;
    try {
      const update = buildUpdateArguments(draft, {
        message: messageFromForm(form),
        retainAttachmentIds: [...retainedAttachmentIds],
        newAttachments,
      });
      const result = await app.callServerTool({
        name: 'update-email-approval',
        arguments: { ...update },
      });
      if (result.isError) {
        throw new Error('Email Studio could not save your changes.');
      }
      const summary = result.structuredContent as
        | { revisionId?: unknown }
        | undefined;
      if (typeof summary?.revisionId !== 'string') {
        throw new Error(
          'Email Studio did not receive a saved revision. Please try again.',
        );
      }
      draft = {
        ...draft,
        revisionId: summary.revisionId,
        message: update.message,
      };
      const sent = await app.callServerTool({
        name: 'approve-email-approval',
        arguments: { draftId: draft.draftId, revisionId: draft.revisionId },
      });
      root.textContent = sent.isError
        ? 'The draft was consumed but Resend could not send it. Prepare a new draft to retry.'
        : 'Email sent successfully.';
    } catch (error) {
      renderStatus(
        error instanceof Error
          ? error.message
          : 'Unable to update email draft.',
        true,
      );
      if (approve) approve.disabled = false;
    }
  });
}

app.ontoolresult = (params) => {
  const result = params.structuredContent as DraftResult | undefined;
  if (!result?.draftId || !result.revisionId || !result.message) return;
  draft = result;
  retainedAttachmentIds = new Set(
    result.attachments.map((attachment) => attachment.id),
  );
  newAttachments = [];
  render();
};

void app.connect();
