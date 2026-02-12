import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import packageJson from '../package.json' with { type: 'json' };

export async function startHttpServer(
  server: McpServer,
  port: number,
): Promise<void> {
  const app = express();

  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, mcp-session-id, Mcp-Session-Id',
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  let transport: StreamableHTTPServerTransport | null = null;
  let isServerConnected = false;

  const initializeTransport = async () => {
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      if (!isServerConnected) {
        await server.connect(transport);
        isServerConnected = true;
      }
    }
    return transport;
  };

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'email-sending-service',
      version: packageJson.version,
    });
  });

  app.all('/mcp', async (req, res) => {
    try {
      const currentTransport = await initializeTransport();
      const parsedBody = req.method === 'POST' ? req.body : undefined;
      await currentTransport.handleRequest(req, res, parsedBody);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: 'Internal error',
          },
        });
      }
    }
  });

  app.get('/sse', async (req, res) => {
    try {
      const currentTransport = await initializeTransport();
      await currentTransport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling SSE request:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'SSE connection failed' });
      }
    }
  });

  app.listen(port, () => {
    console.error(
      `Email sending service MCP Server running on http://localhost:${port}`,
    );
    console.error(`Health check: http://localhost:${port}/health`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`SSE endpoint: http://localhost:${port}/sse`);
    console.error(
      `Use --http flag to enable HTTP mode, or --port to change port (default: 3000)`,
    );
  });
}
