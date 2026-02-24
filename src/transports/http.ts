import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Resend } from 'resend';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';

const sessions: Record<string, StreamableHTTPServerTransport> = {};

function sendJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
  type?: string,
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  if (statusCode === 401) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="resend-mcp"');
  }
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code,
        message,
        ...(type ? { data: { type, status: statusCode } } : {}),
      },
      id: null,
    }),
  );
}

/**
 * Extract the Resend API key from the Authorization: Bearer header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || rest.length === 0)
    return null;
  const token = rest.join(' ').trim();
  return token || null;
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedOrigin(
  req: IncomingMessage,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const rawOrigin = req.headers.origin;
  if (!rawOrigin) return true;
  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) return false;
  return allowedOrigins.has(normalized);
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (!origin) return;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, MCP-Session-Id',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
}

/**
 * Start the HTTP transport. Each session gets its own Resend client created
 * from the Bearer token provided by the connecting client. This allows
 * remote deployment where each user authenticates with their own API key
 * instead of a single server-side key.
 */
export async function runHttp(
  options: ServerOptions,
  port: number,
  host: string = '127.0.0.1',
  allowedOrigins: readonly string[] = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ],
): Promise<Server> {
  const app = createMcpExpressApp();
  const normalizedAllowedOrigins = new Set(
    allowedOrigins.map(normalizeOrigin).filter((o): o is string => o !== null),
  );

  app.get('/health', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  app.all(
    '/mcp',
    async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
      if (!isAllowedOrigin(req, normalizedAllowedOrigins)) {
        sendJsonRpcError(
          res,
          403,
          -32003,
          'Forbidden: origin is not allowed',
          'forbidden',
        );
        return;
      }

      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && sessions[sessionId]) {
        transport = sessions[sessionId];
      } else if (
        !sessionId &&
        req.method === 'POST' &&
        isInitializeRequest(req.body)
      ) {
        // New session: require a Bearer token so we can create a per-session
        // Resend client scoped to this user's API key.
        const apiKey = extractBearerToken(req);
        if (!apiKey) {
          sendJsonRpcError(
            res,
            401,
            -32002,
            'Unauthorized: provide Authorization: Bearer <resend-api-key>',
            'auth_error',
          );
          return;
        }

        const resend = new Resend(apiKey);

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
        const server = createMcpServer(resend, options);
        await server.connect(transport);
      } else if (sessionId && !sessions[sessionId]) {
        sendJsonRpcError(res, 404, -32001, 'Session not found');
        return;
      } else {
        sendJsonRpcError(
          res,
          400,
          -32000,
          'Bad Request: No valid session ID provided',
        );
        return;
      }

      await transport.handleRequest(req, res, req.body);
    },
  );

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('listening', () => {
      console.error(`Resend MCP server listening on http://${host}:${port}`);
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
