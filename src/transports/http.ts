import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  hostHeaderValidation,
  localhostHostValidation,
} from '@modelcontextprotocol/express';
import {
  NodeStreamableHTTPServerTransport,
  toNodeHandler,
  toWebRequest,
} from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  isInitializeRequest,
  isLegacyRequest,
} from '@modelcontextprotocol/server';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { Resend } from 'resend';
import { MAX_EMAIL_ATTACHMENT_ENCODED_BYTES } from '../lib/email-approval-store.js';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';

const sessions: Record<string, NodeStreamableHTTPServerTransport> = {};
const MAX_MCP_REQUEST_BYTES = MAX_EMAIL_ATTACHMENT_ENCODED_BYTES + 1024 * 1024;

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

function isMcpEndpoint(req: IncomingMessage): boolean {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  return pathname === '/' || pathname === '/mcp';
}

const requireMcpAdmission: RequestHandler = (req, res, next) => {
  if (req.method !== 'POST' || !isMcpEndpoint(req)) {
    next();
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId) {
    if (sessions[sessionId]) {
      next();
      return;
    }

    sendJsonRpcError(res, 404, 'Session not found');
    return;
  }

  if (!extractBearerToken(req)) {
    sendJsonRpcError(
      res,
      401,
      'Unauthorized: provide a Resend API key via Authorization: Bearer <key>',
    );
    return;
  }

  next();
};

function parserErrorType(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return undefined;
  }

  const { type } = error;
  return typeof type === 'string' ? type : undefined;
}

const safeJsonErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;

  if (parserErrorType(error) === 'entity.too.large') {
    sendJsonRpcError(res, 413, 'Request body too large');
    return;
  }

  if (parserErrorType(error) === 'entity.parse.failed') {
    sendJsonRpcError(res, 400, 'Malformed JSON request');
    return;
  }

  sendJsonRpcError(res, 500, 'Internal server error');
};

function extractBearerTokenFromWebRequest(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}
export interface HttpTransportOptions {
  /**
   * Host used to derive the SDK's DNS-rebinding protection. Defaults to
   * `'127.0.0.1'`, which keeps localhost-only `Host` header validation enabled
   * — the safe default for servers run locally.
   *
   * Set to `'0.0.0.0'` when deploying behind a reverse proxy / load balancer
   * where the server is already protected by per-request auth (the Bearer API
   * key). This disables `Host` validation so the proxy's forwarded `Host` and
   * load-balancer health-check requests (which use the task's private IP) are
   * accepted instead of rejected with `403 Invalid Host`.
   */
  host?: string;
  /**
   * Explicit allow-list of acceptable `Host` header hostnames. When provided,
   * only these are accepted (overrides the `host`-based default). Use this to
   * pin specific public hostnames instead of disabling validation entirely.
   * Note: a load balancer health check sends the task IP as `Host`, so an
   * allow-list must also include that if the LB health-checks this server.
   */
  allowedHosts?: string[];
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
  httpOptions: HttpTransportOptions = {},
): Promise<Server> {
  const { host = '127.0.0.1', allowedHosts } = httpOptions;
  const app = express();

  if (allowedHosts) {
    app.use(hostHeaderValidation(allowedHosts));
  } else if (['127.0.0.1', 'localhost', '::1'].includes(host)) {
    app.use(localhostHostValidation());
  } else if (host === '0.0.0.0' || host === '::') {
    console.warn(
      `Warning: Server is binding to ${host} without DNS rebinding protection. ` +
        'Consider using the allowedHosts option to restrict allowed hosts, ' +
        'or use authentication to protect your server.',
    );
  }

  // Reject unauthenticated and unknown-session MCP requests before the JSON
  // parser allocates memory for an Email Studio-sized request body.
  app.use(requireMcpAdmission);
  app.use(express.json({ limit: MAX_MCP_REQUEST_BYTES }));

  app.get('/health', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  // Checked in handleMcp before dispatching here — a factory throw becomes a 500, not this 401.
  const modernHandler = createMcpHandler(
    (ctx) => {
      const apiKey = ctx.requestInfo
        ? extractBearerTokenFromWebRequest(ctx.requestInfo)
        : null;
      if (!apiKey) {
        throw new Error(
          'Unauthorized: provide a Resend API key via Authorization: Bearer <key>',
        );
      }
      return createMcpServer(new Resend(apiKey), options, apiKey);
    },
    { legacy: 'reject' },
  );
  const modernNodeHandler = toNodeHandler(modernHandler);

  // Serve the Streamable HTTP transport at both `/mcp` and the root `/` so
  // clients and proxies that target the server's root URL work identically.
  const handleMcp = async (
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
  ) => {
    const webRequest = await toWebRequest(req, req.body);
    if (!(await isLegacyRequest(webRequest, req.body))) {
      const apiKey = extractBearerTokenFromWebRequest(webRequest);
      if (!apiKey) {
        sendJsonRpcError(
          res,
          401,
          'Unauthorized: provide a Resend API key via Authorization: Bearer <key>',
        );
        return;
      }
      await modernNodeHandler(req, res, req.body);
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: NodeStreamableHTTPServerTransport | undefined;

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
          'Unauthorized: provide a Resend API key via Authorization: Bearer <key>',
        );
        return;
      }

      const resend = new Resend(apiKey);

      transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions[sid] = transport!;
        },
      });
      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid && sessions[sid]) delete sessions[sid];
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
  };

  app.all('/mcp', handleMcp);
  app.all('/', handleMcp);
  app.use(safeJsonErrorHandler);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.error(`Resend MCP server listening on http://127.0.0.1:${port}`);
      console.error('  Streamable HTTP: POST/GET/DELETE / and /mcp');
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
      await modernHandler.close().catch(() => {});
      server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
