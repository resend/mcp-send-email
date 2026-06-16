import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Resend } from 'resend';
import { RESEND_BASE_URL } from '../cli/constants.js';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';

const sessions: Record<string, StreamableHTTPServerTransport> = {};

function getMcpBaseUrl(port: number): URL {
  const raw = process.env.MCP_BASE_URL?.trim();
  if (raw) return new URL(raw);
  return new URL(`http://127.0.0.1:${port}`);
}

function sendJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  message: string,
  headers?: Record<string, string>,
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      id: null,
    }),
  );
}

/**
 * Extract the bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Start the HTTP transport. Each session gets its own Resend client created
 * from the bearer token provided by the connecting client — either a Resend
 * API key (re_xxx) or an OAuth access token obtained from api.resend.com.
 * Token validity is not checked at session init; the Resend SDK validates on
 * the first API call, and api.resend.com is the authoritative validator.
 *
 * OAuth discovery is handled entirely by api.resend.com — the MCP hosts no
 * discovery endpoints. The 401 WWW-Authenticate header points clients to
 * api.resend.com/.well-known/oauth-protected-resource to start the flow.
 *
 * Set MCP_BASE_URL to the public URL of this server when deploying remotely.
 */
export async function runHttp(
  options: ServerOptions,
  port: number,
): Promise<Server> {
  const app = createMcpExpressApp();
  const resourceServerUrl = getMcpBaseUrl(port);

  app.get('/health', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  app.all(
    '/mcp',
    async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && sessions[sessionId]) {
        transport = sessions[sessionId];
      } else if (
        !sessionId &&
        req.method === 'POST' &&
        isInitializeRequest(req.body)
      ) {
        // New session: require a bearer token and create a per-session Resend client.
        // Token validity is not checked here — the Resend API validates it.
        const rawToken = extractBearerToken(req);
        if (!rawToken) {
          const headers = {
            'WWW-Authenticate': `Bearer realm="${resourceServerUrl.origin}", resource_metadata="${RESEND_BASE_URL}/.well-known/oauth-protected-resource"`,
          };
          sendJsonRpcError(res, 401, 'Unauthorized: provide credentials via Authorization: Bearer <token>', headers);
          return;
        }

        const resend = new Resend(rawToken);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions[sid] = transport!;
          },
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid && sessions[sid]) delete sessions[sid];
        };
        const server = createMcpServer(resend, options, rawToken);
        await server.connect(transport);
      } else if (sessionId && !sessions[sessionId]) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: null,
          }),
        );
        return;
      } else {
        sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
        return;
      }

      await transport.handleRequest(req, res, req.body);
    },
  );

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.error(`Resend MCP server listening on http://127.0.0.1:${port}`);
      console.error('  Streamable HTTP: POST/GET/DELETE /mcp');
      resolve(server);
    });
    server.once('error', reject);

    const shutdown = async () => {
      for (const sid of Object.keys(sessions)) {
        try {
          await sessions[sid].close();
        } catch {
          // ignore
        }
        delete sessions[sid];
      }
      server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
