import { createUIResource } from '@mcp-ui/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildComposerHtml(prefill: {
  to: string;
  subject: string;
  text: string;
  cc: string;
  bcc: string;
  from: string;
  replyTo: string;
  showFrom: boolean;
  showReplyTo: boolean;
}): string {
  const { to, subject, text, cc, bcc, from, replyTo, showFrom, showReplyTo } =
    prefill;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Resend – Send email</title>
  <style>
    * { 
      box-sizing: border-box; 
      margin: 0; 
      padding: 0; 
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #000000;
      color: #ffffff;
      line-height: 1.5;
      min-height: 100vh;
    }
    .container {
      max-width: 640px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    .header {
      display: flex;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .logo {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .logo svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    form {
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
      letter-spacing: -0.01em;
      margin: 0;
    }
    input, textarea {
      width: 100%;
      padding: 12px 16px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      color: #ffffff;
      transition: all 0.15s ease;
    }
    input:hover, textarea:hover {
      border-color: rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.05);
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.06);
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
    }
    input::placeholder, textarea::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
    textarea {
      min-height: 160px;
      resize: vertical;
      line-height: 1.6;
    }
    .hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
      line-height: 1.4;
    }
    .btn {
      margin-top: 8px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      letter-spacing: -0.01em;
      color: #000000;
      background: #ffffff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      align-self: flex-start;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.9);
      transform: translateY(-1px);
    }
    .btn:active {
      transform: translateY(0);
      background: rgba(255, 255, 255, 0.85);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2L2 8L14 14L26 8L14 2Z" fill="currentColor"/>
          <path d="M2 20L14 26L26 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M2 14L14 20L26 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </div>
    </div>
    <form id="compose" onsubmit="return handleSubmit(event)">
      <div class="form-group">
        <label for="to">To</label>
        <input type="text" id="to" name="to" placeholder="john@example.com, jane@example.com" value="${escapeHtml(to)}" required>
        <div class="hint">Comma-separated email addresses</div>
      </div>
      ${showFrom ? `<div class="form-group"><label for="from">From</label><input type="email" id="from" name="from" placeholder="you@yourdomain.com" value="${escapeHtml(from)}" required></div>` : ''}
      <div class="form-group">
        <label for="subject">Subject</label>
        <input type="text" id="subject" name="subject" placeholder="Email subject" value="${escapeHtml(subject)}" required>
      </div>
      <div class="form-group">
        <label for="text">Message</label>
        <textarea id="text" name="text" placeholder="Write your message..." required>${escapeHtml(text)}</textarea>
      </div>
      <div class="form-group">
        <label for="cc">CC (optional)</label>
        <input type="text" id="cc" name="cc" placeholder="cc@example.com" value="${escapeHtml(cc)}">
      </div>
      <div class="form-group">
        <label for="bcc">BCC (optional)</label>
        <input type="text" id="bcc" name="bcc" placeholder="bcc@example.com" value="${escapeHtml(bcc)}">
      </div>
      ${showReplyTo ? `<div class="form-group"><label for="replyTo">Reply-To (optional)</label><input type="text" id="replyTo" name="replyTo" placeholder="reply@example.com" value="${escapeHtml(replyTo)}"></div>` : ''}
      <button type="submit" class="btn">Send email</button>
    </form>
  </div>
  <script>
    var isSubmitting = false;
    
    function parseEmails(str) {
      if (!str || typeof str !== 'string' || !str.trim()) return [];
      return str.split(/[,\\s]+/).map(function(e) { return e.trim(); }).filter(Boolean);
    }
    
    function handleSubmit(e) {
      e.preventDefault();
      e.stopPropagation();
      
      if (isSubmitting) {
        return false;
      }
      
      var form = document.getElementById('compose');
      var btn = form.querySelector('.btn');
      var to = parseEmails(form.to.value);
      var subject = form.subject.value.trim();
      var text = form.text.value.trim();
      
      if (!to.length || !subject || !text) {
        alert('Please fill in all required fields (To, Subject, Message)');
        return false;
      }
      
      isSubmitting = true;
      
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }
      
      const params = { to: to, subject: subject, text: text };
      var cc = parseEmails(form.cc && form.cc.value);
      if (cc.length) params.cc = cc;
      var bcc = parseEmails(form.bcc && form.bcc.value);
      if (bcc.length) params.bcc = bcc;
      var fromEl = document.getElementById('from');
      if (fromEl && fromEl.value && fromEl.value.trim()) {
        params.from = fromEl.value.trim();
      }
      var replyToEl = document.getElementById('replyTo');
      if (replyToEl && replyToEl.value) {
        var replyToParsed = parseEmails(replyToEl.value);
        if (replyToParsed.length) {
          params.replyTo = replyToParsed;
        }
      }
      
      try {
        if (window.parent && window.parent.postMessage) {
          window.parent.postMessage({
            type: 'tool',
            payload: { toolName: 'send-email', params: params }
          }, '*');
        }
      } catch (err) {
        console.error('Error sending message:', err);
        isSubmitting = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send email';
        }
        alert('Failed to send email. Please try again.');
        return false;
      }
      
      return false;
    }
  </script>
</body>
</html>`;
}

export function addComposeEmailTool(
  server: McpServer,
  _resend: Resend,
  options: {
    senderEmailAddress?: string;
    replierEmailAddresses: string[];
  },
) {
  const { senderEmailAddress, replierEmailAddresses } = options;
  const showFrom = !senderEmailAddress;
  const showReplyTo = replierEmailAddresses.length === 0;

  const MCP_APPS_TEMPLATE_URI = 'ui://resend/email-composer-mcp-apps';
  const APPS_SDK_TEMPLATE_URI = 'ui://resend/email-composer-apps-sdk';

  const buildDefaultHtml = () =>
    buildComposerHtml({
      to: '',
      subject: '',
      text: '',
      cc: '',
      bcc: '',
      from: '',
      replyTo: Array.isArray(replierEmailAddresses)
        ? replierEmailAddresses.join(', ')
        : '',
      showFrom,
      showReplyTo,
    });

  const mcpAppsTemplate = createUIResource({
    uri: MCP_APPS_TEMPLATE_URI,
    encoding: 'text',
    adapters: {
      mcpApps: {
        enabled: true,
      },
    },
    content: {
      type: 'rawHtml',
      htmlString: buildDefaultHtml(),
    },
  });

  server.registerResource(
    'email-composer-mcp-apps',
    MCP_APPS_TEMPLATE_URI,
    {
      description: 'Email composer UI template for MCP Apps hosts',
    },
    async () => {
      const resource = mcpAppsTemplate.resource;
      return {
        contents: [
          {
            uri: MCP_APPS_TEMPLATE_URI,
            mimeType: resource.mimeType,
            text: resource.text || '',
          },
        ],
      };
    },
  );

  const appsSdkTemplate = createUIResource({
    uri: APPS_SDK_TEMPLATE_URI,
    encoding: 'text',
    adapters: {
      appsSdk: {
        enabled: true,
        config: { intentHandling: 'prompt' },
      },
    },
    content: {
      type: 'rawHtml',
      htmlString: buildDefaultHtml(),
    },
    metadata: {
      'openai/widgetDescription': 'Interactive email composition form',
      'openai/widgetPrefersBorder': true,
      'openai/widgetAccessible': true,
    },
  });

  server.registerResource(
    'email-composer-apps-sdk',
    APPS_SDK_TEMPLATE_URI,
    {
      description: 'Email composer UI template for ChatGPT Apps SDK',
    },
    async () => {
      const resource = appsSdkTemplate.resource;
      return {
        contents: [
          {
            uri: APPS_SDK_TEMPLATE_URI,
            mimeType: resource.mimeType,
            text: resource.text || '',
          },
        ],
      };
    },
  );

  server.registerTool(
    'compose_email',
    {
      title: 'Compose Email (UI)',
      description: `**Purpose:** Open an interactive email form in the chat so the user can fill or edit fields and send in one step. Use this when the user wants to send an email but some fields are missing or should be edited visually.

**When to use:**
- User says "send an email" without giving all details (to, subject, body)
- You have partial data (e.g. recipient and subject) and want the user to complete the rest in a form
- User prefers filling a form over answering multiple chat messages

**Workflow:** Call this tool with any known fields (to, subject, text, cc, bcc). A form appears with those pre-filled; the user fills the rest and clicks Send. The host will then call send-email with the completed data.

**Pass whatever you already know;** leave other params empty so the user can fill them in the form.`,
      inputSchema: {
        to: z
          .array(z.string())
          .optional()
          .describe(
            'Recipient email address(es). Pre-fill in the form; leave empty if unknown.',
          ),
        subject: z.string().optional().describe('Subject line to pre-fill'),
        text: z.string().optional().describe('Plain text body to pre-fill'),
        cc: z.array(z.string()).optional().describe('CC addresses to pre-fill'),
        bcc: z
          .array(z.string())
          .optional()
          .describe('BCC addresses to pre-fill'),
      },
      _meta: {
        ui: {
          resourceUri: MCP_APPS_TEMPLATE_URI,
        },
        'openai/outputTemplate': APPS_SDK_TEMPLATE_URI,
        'openai/toolInvocation/invoking': 'Preparing email form...',
        'openai/toolInvocation/invoked': 'Email form ready',
        'openai/widgetAccessible': true,
      },
    },
    async ({ to = [], subject = '', text = '', cc = [], bcc = [] }) => {
      const toStr = Array.isArray(to) ? to.join(', ') : String(to ?? '');
      const subjectStr = String(subject ?? '');
      const textStr = String(text ?? '');
      const ccStr = Array.isArray(cc) ? cc.join(', ') : String(cc ?? '');
      const bccStr = Array.isArray(bcc) ? bcc.join(', ') : String(bcc ?? '');

      const html = buildComposerHtml({
        to: toStr,
        subject: subjectStr,
        text: textStr,
        cc: ccStr,
        bcc: bccStr,
        from: '',
        replyTo: Array.isArray(replierEmailAddresses)
          ? replierEmailAddresses.join(', ')
          : '',
        showFrom,
        showReplyTo,
      });

      const uiResource = createUIResource({
        uri: `ui://resend/email-composer/${Date.now()}`,
        encoding: 'text',
        adapters: {
          appsSdk: {
            enabled: true,
            config: { intentHandling: 'prompt' },
          },
        },
        content: {
          type: 'rawHtml',
          htmlString: html,
        },
        metadata: {
          'openai/widgetDescription': 'Interactive email composition form',
          'openai/widgetPrefersBorder': true,
          'openai/widgetAccessible': true,
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: 'Fill in any missing fields below and click **Send email** to send.',
          },
          uiResource,
        ],
      };
    },
  );
}
