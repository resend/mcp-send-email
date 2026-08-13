import { App } from '@modelcontextprotocol/ext-apps';
import type {
  EmailApprovalAttachmentInput,
  EmailApprovalAttachmentSummary,
  EmailApprovalDraftInput,
} from '../lib/email-approval-store.js';
import {
  buildUpdateArguments,
  describeToolError,
  type EditableApprovalDraft,
} from './email-approval-model.js';

type DraftResult = EditableApprovalDraft & {
  lockedFields?: { from: boolean; replyTo: boolean };
};

const app = new App({ name: 'Resend Email Studio', version: '1.0.0' }, {});
const root = document.querySelector<HTMLElement>('#app');
const MAX_FILE_SNAPSHOT_BYTES = 30_000_000;
const MAX_EMAIL_ATTACHMENT_ENCODED_BYTES = 40_000_000;
const APPROVAL_TOKEN_META_KEY = 'io.resend/email-approval-token';

let draft: DraftResult | undefined;
let approvalToken: string | undefined;
let retainedAttachmentIds = new Set<string>();
let newAttachments: EmailApprovalAttachmentInput[] = [];
let attachmentReadsInFlight = 0;
let pendingAttachmentEncodedBytes = 0;
let isSubmitting = false;

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

function base64EncodedSize(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

function totalAttachmentEncodedBytes(files: File[]): number {
  const retainedBytes =
    draft?.attachments.reduce(
      (total, attachment) =>
        retainedAttachmentIds.has(attachment.id)
          ? total + base64EncodedSize(attachment.size)
          : total,
      0,
    ) ?? 0;
  const addedBytes = newAttachments.reduce(
    (total, attachment) => total + attachment.content.length,
    0,
  );
  const selectedBytes = files.reduce(
    (total, file) => total + base64EncodedSize(file.size),
    0,
  );
  return (
    retainedBytes + addedBytes + pendingAttachmentEncodedBytes + selectedBytes
  );
}

function updateApproveState(form: HTMLFormElement): void {
  const approve = form.querySelector<HTMLButtonElement>('#approve');
  if (approve) approve.disabled = isSubmitting || attachmentReadsInFlight > 0;
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

function approvalTokenFromMeta(meta: unknown): string | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined;
  const token = (meta as Record<string, unknown>)[APPROVAL_TOKEN_META_KEY];
  return typeof token === 'string' ? token : undefined;
}

function attachmentRow(
  attachment: EmailApprovalAttachmentSummary,
  onRemove: () => void,
): HTMLElement {
  const item = document.createElement('li');
  const details = document.createElement('span');
  details.textContent = `${attachment.filename} · ${attachment.contentType ?? 'unknown type'} · ${attachment.size} bytes · SHA-256 ${attachment.sha256}`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', onRemove);
  item.append(details, remove);
  return item;
}

function newAttachmentRow(
  attachment: EmailApprovalAttachmentInput,
  onRemove: () => void,
): HTMLElement {
  const item = document.createElement('li');
  const details = document.createElement('span');
  details.textContent = `${attachment.filename} · ${attachment.contentType ?? 'unknown type'} · new attachment`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', onRemove);
  item.append(details, remove);
  return item;
}

function renderPreview(html: string): void {
  const preview = document.querySelector<HTMLIFrameElement>('#html-preview');
  if (!preview) return;
  preview.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><body>${html}</body>`;
}

function renderAttachmentList(list: HTMLUListElement): void {
  if (!draft) return;
  list.replaceChildren();
  for (const attachment of draft.attachments) {
    if (!retainedAttachmentIds.has(attachment.id)) continue;
    list.append(
      attachmentRow(attachment, () => {
        retainedAttachmentIds.delete(attachment.id);
        renderAttachmentList(list);
      }),
    );
  }
  for (const attachment of newAttachments) {
    list.append(
      newAttachmentRow(attachment, () => {
        newAttachments = newAttachments.filter(
          (candidate) => candidate !== attachment,
        );
        renderAttachmentList(list);
      }),
    );
  }
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function render(): void {
  if (!root || !draft) return;
  const message = draft.message;
  root.replaceChildren();
  const form = document.createElement('form');
  form.dataset.emailStudio = 'true';
  form.innerHTML = `
    <style>
      :root { color: #fdfdfd; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #000; }
      * { box-sizing: border-box; }
      [data-email-studio] { width: min(100%, 1040px); margin: 0 auto; padding: 16px; color: #fdfdfd; }
      .studio-shell { overflow: hidden; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: #0d0e10; }
      .studio-header { display: flex; gap: 18px; align-items: center; justify-content: space-between; min-width: 0; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,.11); }
      .studio-title { min-width: 0; }
      .eyebrow { margin: 0 0 4px; color: #70b8ff; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
      h1 { margin: 0; font-size: 24px; line-height: 1.15; letter-spacing: -.035em; font-weight: 650; }
      .review-state { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 6px 9px; align-items: center; justify-content: flex-end; min-width: 0; color: rgba(253,253,253,.62); font-size: 12px; line-height: 1.35; text-align: right; }
      .review-state strong { color: #46fea5d4; font-weight: 600; }
      .state-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #46fea5d4; box-shadow: 0 0 0 3px #22ff991e; }
      .expiry { margin: 0; color: #ffca16; }
      .review-guidance { margin: 0; padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,.08); color: rgba(253,253,253,.62); font-size: 13px; line-height: 1.45; }
      .studio-body { padding: 0; }
      .section { padding: 20px; }
      .section-header { display: flex; gap: 16px; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
      h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
      .section-note { margin: 0; color: rgba(253,253,253,.48); font-size: 12px; text-align: right; }
      .field-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .field-grid .wide { grid-column: 1 / -1; }
      label { display: block; color: rgba(253,253,253,.78); font-size: 12px; font-weight: 560; }
      input, textarea { display: block; width: 100%; margin-top: 7px; padding: 10px 11px; border: 1px solid rgba(255,255,255,.16); border-radius: 7px; outline: none; background: #000; color: #fdfdfd; font: inherit; font-size: 14px; line-height: 1.45; transition: border-color .16s, box-shadow .16s; }
      input:focus, textarea:focus { border-color: #70b8ff; box-shadow: 0 0 0 3px #0077ff3a; }
      input[readonly] { color: rgba(253,253,253,.5); background: rgba(255,255,255,.04); }
      textarea { min-height: 132px; resize: vertical; }
      textarea[name="html"] { min-height: 112px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .workspace { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, .9fr); border-top: 1px solid rgba(255,255,255,.1); }
      .compose-section { border-right: 1px solid rgba(255,255,255,.1); }
      .preview-section { background: rgba(255,255,255,.018); }
      .preview-label { color: rgba(253,253,253,.65); }
      iframe { width: 100%; min-height: 425px; margin-top: 7px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; background: #fff; }
      .attachments-section { border-top: 1px solid rgba(255,255,255,.1); }
      #attachments { display: grid; gap: 8px; margin: 0 0 12px; padding: 0; list-style: none; }
      #attachments li { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 11px; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; color: rgba(253,253,253,.68); font-size: 12px; line-height: 1.4; }
      .file-picker { display: flex; align-items: center; gap: 10px; padding: 11px; border: 1px dashed rgba(255,255,255,.2); border-radius: 7px; color: rgba(253,253,253,.58); }
      .file-picker input { width: auto; margin: 0; padding: 0; border: 0; background: transparent; font-size: 12px; }
      details { border-top: 1px solid rgba(255,255,255,.1); }
      summary { cursor: pointer; padding: 16px 20px; color: #fdfdfd; font-size: 14px; font-weight: 600; list-style: none; }
      summary::-webkit-details-marker { display: none; }
      summary::after { float: right; color: rgba(253,253,253,.48); content: '+'; font-size: 19px; font-weight: 400; line-height: 12px; }
      details[open] summary { border-bottom: 1px solid rgba(255,255,255,.1); }
      details[open] summary::after { content: '−'; }
      .advanced-fields { padding: 4px 20px 20px; }
      .actions { display: flex; gap: 10px; align-items: center; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid rgba(255,255,255,.1); background: #111214; }
      button { cursor: pointer; padding: 10px 14px; border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: transparent; color: #fdfdfd; font: inherit; font-size: 14px; font-weight: 560; transition: background .16s, border-color .16s, opacity .16s; }
      button:hover { border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.06); }
      button:focus-visible { outline: 3px solid #0077ff3a; outline-offset: 2px; }
      #attachments button { padding: 5px 8px; border-color: rgba(255,149,146,.4); color: #ff9592; font-size: 12px; }
      #approve { border-color: #46fea5d4; background: #fdfdfd; color: #000; }
      #approve:hover { background: #e7e7e7; }
      #approve:disabled { cursor: not-allowed; border-color: rgba(255,255,255,.1); background: rgba(255,255,255,.16); color: rgba(255,255,255,.42); }
      #status { min-height: 0; margin: 0; color: #70b8ff; font-size: 13px; line-height: 1.45; }
      #status:not(:empty) { padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,.08); }
      #status[data-error="true"] { border: 1px solid #ff173f45; border-radius: 0; background: #ff173f2d; color: #ff9592; }
      @media (max-width: 800px) { .workspace { grid-template-columns: 1fr; } .compose-section { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); } iframe { min-height: 260px; } }
      @media (max-width: 640px) { [data-email-studio] { padding: 0; } .studio-shell { border-radius: 0; border-left: 0; border-right: 0; } .studio-header { display: block; padding: 16px; } .review-state { justify-content: flex-start; margin-top: 12px; text-align: left; } .review-guidance, .section, summary, .advanced-fields { padding-left: 16px; padding-right: 16px; } .field-grid { grid-template-columns: 1fr; } .field-grid .wide { grid-column: auto; } .section-header { align-items: flex-start; flex-direction: column; gap: 4px; } .section-note { text-align: left; } .actions { justify-content: stretch; padding: 14px 16px; } .actions button { flex: 1; } }
    </style>
    <div class="studio-shell">
      <header class="studio-header" data-email-studio-header>
        <div class="studio-title">
          <p class="eyebrow">Resend · Email Studio</p>
          <h1>Review email</h1>
        </div>
        <div class="review-state"><span class="state-dot" aria-hidden="true"></span><strong>Draft active</strong><span id="expiry" class="expiry"></span></div>
      </header>
      <p class="review-guidance">Confirm delivery and content. Saving changes creates a new revision; approval sends only the revision shown here.</p>
      <div class="studio-body">
        <p id="status" role="status"></p>
        <section class="section delivery-section">
          <div class="section-header"><h2>Delivery</h2><p class="section-note">Recipients and sender</p></div>
          <div class="field-grid">
            <label class="wide">To<input name="to" required></label>
            <label>CC<input name="cc"></label>
            <label>BCC<input name="bcc"></label>
            <label>From<input name="from" required></label>
            <label>Reply-to<input name="replyTo" required></label>
          </div>
        </section>
        <div class="workspace" data-email-studio-workspace>
        <section class="section compose-section">
          <div class="section-header"><h2>Message</h2><p class="section-note">What the recipient reads</p></div>
          <div class="field-grid">
            <label class="wide">Subject<input name="subject" required></label>
            <label class="wide">Plain text<textarea name="text" required></textarea></label>
            <label class="wide">HTML <span class="section-note">Optional</span><textarea name="html"></textarea></label>
          </div>
        </section>
        <section class="section preview-section">
          <div class="section-header"><h2>Preview</h2><p class="section-note">Rendered HTML</p></div>
          <label class="preview-label">Email preview<iframe id="html-preview" title="Rendered email preview" sandbox=""></iframe></label>
        </section>
        </div>
        <section class="section attachments-section">
          <div class="section-header"><h2>Attachments</h2><p class="section-note">Base64 snapshots only · 40 MB total</p></div>
          <ul id="attachments"></ul>
          <label class="file-picker">Add files <input id="files" type="file" multiple></label>
        </section>
        <details name="advanced">
          <summary>Advanced options</summary>
          <div class="advanced-fields field-grid">
            <label>Schedule<input name="scheduledAt" placeholder="tomorrow at 10am"></label>
            <label>Topic ID<input name="topicId"></label>
            <label class="wide">Idempotency key<input name="idempotencyKey"></label>
            <label class="wide">Tags JSON<textarea name="tags"></textarea></label>
            <label class="wide">Headers JSON<textarea name="headers"></textarea></label>
          </div>
        </details>
      </div>
      <footer class="actions"><button id="cancel" type="button">Cancel draft</button><button id="approve" type="submit">Approve and send</button></footer>
    </div>
  `;
  root.append(form);

  form.querySelector<HTMLElement>('#expiry')!.textContent =
    `Expires ${formatExpiry(draft.expiresAt)} · sends once`;
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
  (form.elements.namedItem('subject') as HTMLInputElement).value =
    message.subject;
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
  if (attachments) renderAttachmentList(attachments);
  updateApproveState(form);

  form
    .querySelector<HTMLInputElement>('#files')
    ?.addEventListener('change', async (event) => {
      const files = [
        ...((event.currentTarget as HTMLInputElement).files ?? []),
      ];
      const tooLarge = files.find(
        (file) => file.size > MAX_FILE_SNAPSHOT_BYTES,
      );
      if (tooLarge) {
        renderStatus(
          `${tooLarge.name} is too large to attach. Email Studio supports files up to 30 MB.`,
          true,
        );
        return;
      }
      if (
        totalAttachmentEncodedBytes(files) > MAX_EMAIL_ATTACHMENT_ENCODED_BYTES
      ) {
        renderStatus(
          'Selected files exceed the 40 MB attachment limit for this email.',
          true,
        );
        (event.currentTarget as HTMLInputElement).value = '';
        return;
      }

      const draftId = draft?.draftId;
      const selectedEncodedBytes = files.reduce(
        (total, file) => total + base64EncodedSize(file.size),
        0,
      );
      pendingAttachmentEncodedBytes += selectedEncodedBytes;
      attachmentReadsInFlight += 1;
      updateApproveState(form);
      try {
        const converted = await Promise.all(
          files.map(async (file) => ({
            filename: file.name,
            content: toBase64(await file.arrayBuffer()),
            contentType: file.type || undefined,
          })),
        );
        if (draft?.draftId !== draftId) return;
        newAttachments = [...newAttachments, ...converted];
        if (attachments) renderAttachmentList(attachments);
      } catch (error) {
        renderStatus(
          error instanceof Error
            ? `Unable to read selected attachment: ${error.message}`
            : 'Unable to read selected attachment.',
          true,
        );
      } finally {
        pendingAttachmentEncodedBytes -= selectedEncodedBytes;
        attachmentReadsInFlight -= 1;
        updateApproveState(form);
      }
    });

  form
    .querySelector<HTMLButtonElement>('#cancel')
    ?.addEventListener('click', async () => {
      if (!draft || !approvalToken) {
        renderStatus(
          'Email Studio could not establish a secure draft session. Please prepare the email again.',
          true,
        );
        return;
      }
      try {
        const result = await app.callServerTool({
          name: 'cancel-email-approval',
          arguments: { draftId: draft.draftId, approvalToken },
        });
        if (result.isError) throw new Error(describeToolError(result));
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
    if (!draft || !approvalToken) {
      renderStatus(
        'Email Studio could not establish a secure draft session. Please prepare the email again.',
        true,
      );
      return;
    }
    if (attachmentReadsInFlight > 0) {
      renderStatus('Wait for selected attachments to finish loading.', true);
      updateApproveState(form);
      return;
    }
    isSubmitting = true;
    updateApproveState(form);
    try {
      const update = buildUpdateArguments(draft, {
        message: messageFromForm(form),
        retainAttachmentIds: [...retainedAttachmentIds],
        newAttachments,
      });
      const result = await app.callServerTool({
        name: 'update-email-approval',
        arguments: { ...update, approvalToken },
      });
      if (result.isError) {
        throw new Error(describeToolError(result));
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
        arguments: {
          draftId: draft.draftId,
          revisionId: draft.revisionId,
          approvalToken,
        },
      });
      root.textContent = sent.isError
        ? `The draft was consumed but Resend could not send it: ${describeToolError(sent)} Prepare a new draft to retry.`
        : 'Email sent successfully.';
    } catch (error) {
      renderStatus(
        error instanceof Error
          ? error.message
          : 'Unable to update email draft.',
        true,
      );
      isSubmitting = false;
      updateApproveState(form);
    }
  });
}

app.ontoolresult = (params) => {
  const result = params.structuredContent as DraftResult | undefined;
  if (!result?.draftId || !result.revisionId || !result.message) return;
  const nextApprovalToken = approvalTokenFromMeta(params._meta);
  if (!nextApprovalToken) {
    if (root) {
      root.textContent =
        'Email Studio could not establish a secure draft session. Please prepare the email again.';
    }
    return;
  }
  draft = result;
  approvalToken = nextApprovalToken;
  retainedAttachmentIds = new Set(
    result.attachments.map((attachment) => attachment.id),
  );
  newAttachments = [];
  isSubmitting = false;
  render();
};

void app.connect();
