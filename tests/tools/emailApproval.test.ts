import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEmailApprovalTools } from '../../src/tools/emailApproval.js';

const send = vi.fn();
const resend = { emails: { send } } as unknown as Resend;

async function makeClient(uiCapable = false) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addEmailApprovalTools(server, resend, {
    senderEmailAddress: 'Acme <hello@acme.com>',
    replierEmailAddresses: ['support@acme.com'],
  });
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    uiCapable
      ? {
          capabilities: {
            extensions: {
              'io.modelcontextprotocol/ui': {
                mimeTypes: ['text/html;profile=mcp-app'],
              },
            },
          },
        }
      : undefined,
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .filter((content) => content.type === 'text')
    .map((content) => content.text)
    .join('\n');
}

const prepareArguments = {
  to: ['ada@example.com'],
  subject: 'Your order is ready',
  text: 'Hi Ada',
};

describe('Email Studio approval tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({ data: { id: 'email_1' } });
  });

  it('registers the approval tools and MCP App resource metadata', async () => {
    const client = await makeClient(true);
    const { tools } = await client.listTools();
    const prepare = tools.find(
      (tool) => tool.name === 'prepare-email-approval',
    );
    const approve = tools.find(
      (tool) => tool.name === 'approve-email-approval',
    );
    const update = tools.find((tool) => tool.name === 'update-email-approval');

    expect(prepare?._meta).toMatchObject({
      ui: { resourceUri: 'ui://resend/email-approval' },
    });
    expect(approve?._meta).toMatchObject({
      ui: { visibility: ['app'] },
    });
    expect(update?.outputSchema).toMatchObject({
      properties: {
        draftId: expect.any(Object),
        revisionId: expect.any(Object),
      },
    });

    const resource = await client.readResource({
      uri: 'ui://resend/email-approval',
    });
    expect(resource.contents[0].mimeType).toBe('text/html;profile=mcp-app');
  });

  it('returns only a review preview to clients without MCP Apps support', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: prepareArguments,
    });

    expect(textOf(result as never)).toContain('review-only preview');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects attachment paths and URLs instead of reading or fetching them', async () => {
    const client = await makeClient(true);
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: {
        ...prepareArguments,
        attachments: [
          {
            filename: 'private.txt',
            content: Buffer.from('private attachment').toString('base64'),
            filePath: '/etc/passwd',
            url: 'https://example.com/private.txt',
          },
        ],
      },
    });

    expect(result.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not return attachment Base64 content to the Email Studio app', async () => {
    const client = await makeClient(true);
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: {
        ...prepareArguments,
        attachments: [
          {
            filename: 'private.txt',
            content: Buffer.from('private attachment').toString('base64'),
          },
        ],
      },
    });

    const draft = result.structuredContent as { message: object };
    expect(draft.message).not.toHaveProperty('attachments');
  });

  it('rejects email metadata beyond Resend tag limits', async () => {
    const client = await makeClient(true);
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: {
        ...prepareArguments,
        tags: Array.from({ length: 76 }, (_, index) => ({
          name: `tag_${index}`,
          value: 'audit',
        })),
      },
    });

    expect(result.isError).toBe(true);
  });

  it('rejects an excessive number of custom headers', async () => {
    const client = await makeClient(true);
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: {
        ...prepareArguments,
        headers: Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`X-Audit-${index}`, '1']),
        ),
      },
    });

    expect(result.isError).toBe(true);
  });

  it('rejects custom headers with line breaks', async () => {
    const client = await makeClient(true);
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: {
        ...prepareArguments,
        headers: { 'X-Audit\r\nBcc': 'hidden@example.com' },
      },
    });

    expect(result.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects custom header values with line breaks', async () => {
    const client = await makeClient(true);
    const result = await client.callTool({
      name: 'prepare-email-approval',
      arguments: {
        ...prepareArguments,
        headers: { 'X-Audit': 'safe\r\nBcc: hidden@example.com' },
      },
    });

    expect(result.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the latest approved revision once', async () => {
    const client = await makeClient(true);
    const prepared = await client.callTool({
      name: 'prepare-email-approval',
      arguments: prepareArguments,
    });
    const draft = prepared.structuredContent as {
      draftId: string;
      revisionId: string;
      message: typeof prepareArguments;
    };
    const approvalToken = (prepared._meta as Record<string, unknown>)[
      'io.resend/email-approval-token'
    ];
    expect(approvalToken).toEqual(expect.any(String));

    const denied = await client.callTool({
      name: 'approve-email-approval',
      arguments: {
        draftId: draft.draftId,
        revisionId: draft.revisionId,
        approvalToken: '00000000-0000-4000-8000-000000000002',
      },
    });
    expect(denied.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();

    const updated = await client.callTool({
      name: 'update-email-approval',
      arguments: {
        draftId: draft.draftId,
        revisionId: draft.revisionId,
        approvalToken,
        message: { ...draft.message, subject: 'Updated subject' },
        retainAttachmentIds: [],
        newAttachments: [],
      },
    });
    const revision = updated.structuredContent as { revisionId: string };

    await client.callTool({
      name: 'approve-email-approval',
      arguments: {
        draftId: draft.draftId,
        revisionId: revision.revisionId,
        approvalToken,
      },
    });
    const replay = await client.callTool({
      name: 'approve-email-approval',
      arguments: {
        draftId: draft.draftId,
        revisionId: revision.revisionId,
        approvalToken,
      },
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Updated subject' }),
      undefined,
    );
    expect(replay.isError).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
