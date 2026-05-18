import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Resend } from 'resend';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';

const sessions: Record<string, StreamableHTTPServerTransport> = {};
const sessionTimestamps: Record<string, number> = {};
const sessionTimeouts: Record<string, NodeJS.Timeout> = {};

// Configuration
const MAX_SESSIONS = 1000; // Prevent unlimited session creation
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour idle timeout
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Check for idle sessions every 15 minutes

/**
 * Clean up expired sessions and set idle timeout for a session
 */
function setSessionTimeout(sessionId: string): void {
  // Clear existing timeout if any
  if (sessionTimeouts[sessionId]) {
    clearTimeout(sessionTimeouts[sessionId]);
  }

  // Set new idle timeout
  sessionTimestamps[sessionId] = Date.now();
  sessionTimeouts[sessionId] = setTimeout(async () => {
    if (sessions[sessionId]) {
      try {
        await sessions[sessionId].close();
      } catch {
        // Ignore errors during cleanup
      }
      delete sessions[sessionId];
      delete sessionTimestamps[sessionId];
      delete sessionTimeouts[sessionId];
    }
  }, SESSION_IDLE_TIMEOUT_MS);
}

/**
 * Periodic cleanup of stale sessions
 */
function startSessionCleanupInterval(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [sessionId, lastActivity] of Object.entries(sessionTimestamps)) {
      if (now - lastActivity > SESSION_IDLE_TIMEOUT_MS) {
        if (sessions[sessionId]) {
          sessions[sessionId].close().catch(() => {
            // Ignore errors during cleanup
          });
          delete sessions[sessionId];
        }
        delete sessionTimestamps[sessionId];
        if (sessionTimeouts[sessionId]) {
          clearTimeout(sessionTimeouts[sessionId]);
          delete sessionTimeouts[sessionId];
        }
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
}

/**
 * Simple in-memory rate limiter using sliding window
 */
const requestCounts: Record<string, { count: number; resetTime: number }> = {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100; // Max 100 requests per minute per IP

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const limiter = requestCounts[clientIp];

  if (!limiter || now >= limiter.resetTime) {
    requestCounts[clientIp] = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    return true;
  }

  limiter.count++;
  return limiter.count <= RATE_LIMIT_MAX_REQUESTS;
}

function sendJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message },
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
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
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
): Promise<Server> {
  const app = createMcpExpressApp();

  app.get('/health', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  app.all(
    '/mcp',
    async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
      // Get client IP for rate limiting
      const clientIp =
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress ||
        'unknown';

      // Check rate limit
      if (!checkRateLimit(clientIp)) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message:
                'Rate limit exceeded. Maximum 100 requests per minute per client.',
            },
            id: null,
          }),
        );
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && sessions[sessionId]) {
        transport = sessions[sessionId];
        setSessionTimeout(sessionId); // Refresh session timeout
      } else if (
        !sessionId &&
        req.method === 'POST' &&
        isInitializeRequest(req.body)
      ) {
        // Check if we're at max sessions
        if (Object.keys(sessions).length >= MAX_SESSIONS) {
          sendJsonRpcError(
            res,
            429,
            `Too many active sessions. Maximum ${MAX_SESSIONS} sessions allowed.`,
          );
          return;
        }

        // New session: require a Bearer token so we can create a per-session
        // Resend client scoped to this user's API key.
        const apiKey = extractBearerToken(req);
        if (!apiKey) {
          sendJsonRpcError(
            res,
            401,
            'Unauthorized: provide a Resend API key via Authorization: Bearer <key>',
          );
          return;
        }

        const resend = new Resend(apiKey);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions[sid] = transport!;
            setSessionTimeout(sid); // Set initial timeout
          },
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid && sessions[sid]) {
            delete sessions[sid];
            delete sessionTimestamps[sid];
            if (sessionTimeouts[sid]) {
              clearTimeout(sessionTimeouts[sid]);
              delete sessionTimeouts[sid];
            }
          }
        };
        const server = createMcpServer(resend, options, apiKey);
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

    // Start periodic session cleanup
    const cleanupInterval = startSessionCleanupInterval();

    const shutdown = async () => {
      clearInterval(cleanupInterval);
      for (const sid of Object.keys(sessions)) {
        try {
          await sessions[sid].close();
        } catch {
          // ignore
        }
        if (sessionTimeouts[sid]) {
          clearTimeout(sessionTimeouts[sid]);
        }
        delete sessions[sid];
        delete sessionTimestamps[sid];
        delete sessionTimeouts[sid];
      }
      server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
