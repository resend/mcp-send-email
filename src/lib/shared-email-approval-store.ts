import { createHash, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import { createConnection, createServer, type Server } from 'node:net';
import { join } from 'node:path';
import {
  type ConsumedEmailApprovalDraft,
  type EmailApprovalDraftInput,
  type EmailApprovalDraftSummary,
  EmailApprovalStore,
  MAX_EMAIL_ATTACHMENT_ENCODED_BYTES,
  type UpdateEmailApprovalDraftInput,
} from './email-approval-store.js';

interface BrokerRequest {
  auth: string;
  method: 'ping' | 'create' | 'update' | 'consume' | 'cancel';
  params?: unknown;
}

interface BrokerResponse {
  error?: string;
  result?: unknown;
}

interface WireConsumedDraft {
  message: ConsumedEmailApprovalDraft['message'];
  attachments: Array<{
    filename: string;
    content: string;
    contentType?: string;
    contentId?: string;
  }>;
}

export interface SharedEmailApprovalStore {
  create(
    input: EmailApprovalDraftInput,
    ownerToken?: string,
  ): Promise<EmailApprovalDraftSummary>;
  update(
    input: UpdateEmailApprovalDraftInput,
    ownerToken?: string,
  ): Promise<EmailApprovalDraftSummary>;
  consume(
    draftId: string,
    revisionId: string,
    ownerToken?: string,
  ): Promise<ConsumedEmailApprovalDraft>;
  cancel(draftId: string, ownerToken?: string): Promise<boolean>;
}

const ownedServers = new Map<string, Server>();
export const MAX_BROKER_REQUEST_BYTES =
  MAX_EMAIL_ATTACHMENT_ENCODED_BYTES + 1024 * 1024;

function brokerPaths(sharedKey: string) {
  const key = createHash('sha256')
    .update(`email-approval-store-v2:${sharedKey}`)
    .digest('hex');
  // macOS resolves its temporary directory to a path too long for Unix sockets.
  const directory = '/tmp/resend-mcp-email-approval';
  return {
    auth: key,
    directory,
    socket: join(directory, `${key.slice(0, 16)}.sock`),
  };
}

function isExpectedConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ['ECONNREFUSED', 'ENOENT', 'EPIPE'].includes(
      (error as NodeJS.ErrnoException).code ?? '',
    )
  );
}

function isAuthorised(auth: string, expected: string): boolean {
  const candidate = Buffer.from(auth);
  const secret = Buffer.from(expected);
  return (
    candidate.length === secret.length && timingSafeEqual(candidate, secret)
  );
}

async function removeStaleSocket(socket: string): Promise<void> {
  try {
    if ((await lstat(socket)).isSocket()) await unlink(socket);
  } catch (error) {
    if (!isExpectedConnectionError(error)) throw error;
  }
}

function wireConsumedDraft(
  draft: ConsumedEmailApprovalDraft,
): WireConsumedDraft {
  return {
    message: draft.message,
    attachments: draft.attachments.map((attachment) => ({
      ...attachment,
      content: attachment.content.toString('base64'),
    })),
  };
}

function fromWireConsumedDraft(
  draft: WireConsumedDraft,
): ConsumedEmailApprovalDraft {
  return {
    message: draft.message,
    attachments: draft.attachments.map((attachment) => ({
      ...attachment,
      content: Buffer.from(attachment.content, 'base64'),
    })),
  };
}

async function handleRequest(
  store: EmailApprovalStore,
  request: BrokerRequest,
  auth: string,
): Promise<unknown> {
  if (!isAuthorised(request.auth, auth))
    throw new Error('Unauthorised draft request.');
  switch (request.method) {
    case 'ping':
      return 'ok';
    case 'create': {
      const { input, ownerToken } = request.params as {
        input: EmailApprovalDraftInput;
        ownerToken?: string;
      };
      return store.create(input, ownerToken);
    }
    case 'update': {
      const { input, ownerToken } = request.params as {
        input: UpdateEmailApprovalDraftInput;
        ownerToken?: string;
      };
      return store.update(input, ownerToken);
    }
    case 'consume': {
      const { draftId, revisionId, ownerToken } = request.params as {
        draftId: string;
        revisionId: string;
        ownerToken?: string;
      };
      return wireConsumedDraft(store.consume(draftId, revisionId, ownerToken));
    }
    case 'cancel': {
      const { draftId, ownerToken } = request.params as {
        draftId: string;
        ownerToken?: string;
      };
      return store.cancel(draftId, ownerToken);
    }
  }
}

async function startBroker(
  socket: string,
  auth: string,
  maxRequestBytes: number,
): Promise<Server> {
  const store = new EmailApprovalStore();
  const server = createServer((connection) => {
    connection.setEncoding('utf8');
    let input = '';
    let inputBytes = 0;
    connection.on('data', (chunk: string) => {
      inputBytes += Buffer.byteLength(chunk);
      if (inputBytes > maxRequestBytes) {
        connection.end(
          `${JSON.stringify({
            error: 'Email approval request is too large.',
          } satisfies BrokerResponse)}\n`,
        );
        return;
      }
      input += chunk;
      const lineEnd = input.indexOf('\n');
      if (lineEnd === -1) return;
      const line = input.slice(0, lineEnd);
      input = input.slice(lineEnd + 1);
      void (async () => {
        try {
          const request = JSON.parse(line) as BrokerRequest;
          const result = await handleRequest(store, request, auth);
          connection.end(
            `${JSON.stringify({ result } satisfies BrokerResponse)}\n`,
          );
        } catch (error) {
          connection.end(
            `${JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Draft request failed.',
            } satisfies BrokerResponse)}\n`,
          );
        }
      })();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => {
      server.off('error', reject);
      resolve();
    });
  });
  ownedServers.set(socket, server);
  return server;
}

function requestBroker(
  socket: string,
  auth: string,
  method: BrokerRequest['method'],
  params?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket);
    connection.setEncoding('utf8');
    let output = '';
    connection.once('error', reject);
    connection.on('connect', () => {
      connection.write(
        `${JSON.stringify({ auth, method, params } satisfies BrokerRequest)}\n`,
      );
    });
    connection.on('data', (chunk: string) => {
      output += chunk;
    });
    connection.on('end', () => {
      try {
        const response = JSON.parse(output) as BrokerResponse;
        if (response.error) reject(new Error(response.error));
        else resolve(response.result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function ensureBroker(
  socket: string,
  auth: string,
  maxRequestBytes: number,
): Promise<void> {
  try {
    await requestBroker(socket, auth, 'ping');
    return;
  } catch (error) {
    if (!isExpectedConnectionError(error)) throw error;
  }

  await removeStaleSocket(socket);
  try {
    await startBroker(socket, auth, maxRequestBytes);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error as NodeJS.ErrnoException).code !== 'EADDRINUSE'
    ) {
      throw error;
    }
    await requestBroker(socket, auth, 'ping');
  }
}

export async function createSharedEmailApprovalStore(
  sharedKey: string,
  {
    maxRequestBytes = MAX_BROKER_REQUEST_BYTES,
  }: { maxRequestBytes?: number } = {},
): Promise<SharedEmailApprovalStore> {
  const { auth, directory, socket } = brokerPaths(sharedKey);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await ensureBroker(socket, auth, maxRequestBytes);

  return {
    create: (input, ownerToken) =>
      requestBroker(socket, auth, 'create', {
        input,
        ownerToken,
      }) as Promise<EmailApprovalDraftSummary>,
    update: (input, ownerToken) =>
      requestBroker(socket, auth, 'update', {
        input,
        ownerToken,
      }) as Promise<EmailApprovalDraftSummary>,
    consume: async (draftId, revisionId, ownerToken) =>
      fromWireConsumedDraft(
        (await requestBroker(socket, auth, 'consume', {
          draftId,
          revisionId,
          ownerToken,
        })) as WireConsumedDraft,
      ),
    cancel: (draftId, ownerToken) =>
      requestBroker(socket, auth, 'cancel', {
        draftId,
        ownerToken,
      }) as Promise<boolean>,
  };
}

export async function stopSharedEmailApprovalStoresForTest(): Promise<void> {
  await Promise.all(
    [...ownedServers.entries()].map(async ([socket, server]) => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await removeStaleSocket(socket);
      ownedServers.delete(socket);
    }),
  );
}
