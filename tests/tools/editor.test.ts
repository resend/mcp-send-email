import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { CLIENT_INFO_META_KEY } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardClient } from '../../src/lib/dashboard-client.js';
import type { ResendEditorClient } from '../../src/lib/resend-editor-client.js';
import { addEditorTools } from '../../src/tools/editor.js';

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ServerContext,
) => Promise<unknown>;

/** Minimal fake `McpServer`; lets a test control `getClientVersion()` (the legacy path). */
function createFakeServer(clientInfo?: { name: string; version: string }) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
    server: {
      getClientVersion: () => clientInfo,
    },
  };
  return { server: server as unknown as McpServer, tools };
}

/** Fake `ServerContext`: omitted -> legacy (no envelope), object -> modern (envelope clientInfo). */
function fakeCtx(clientInfo?: { name: string; version: string }) {
  return {
    mcpReq: {
      envelope: clientInfo ? { [CLIENT_INFO_META_KEY]: clientInfo } : undefined,
    },
  } as unknown as ServerContext;
}

function setup(clientInfo?: { name: string; version: string }) {
  const { server, tools } = createFakeServer(clientInfo);
  const createEditorConnection = vi.fn().mockResolvedValue({
    apiKeyId: 'key_1',
    room_id: 'room_1',
  });
  const deleteEditorConnection = vi.fn().mockResolvedValue({ ok: true });
  const apiClient = {
    createEditorConnection,
    deleteEditorConnection,
  } as unknown as ResendEditorClient;
  const dashboard = {} as unknown as DashboardClient;

  addEditorTools(server, dashboard, apiClient);

  const connect = tools.get('connect-to-editor');
  if (!connect) throw new Error('connect-to-editor not registered');
  return { connect, createEditorConnection };
}

describe('editor agent_name resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to getClientVersion() on a legacy request (no envelope)', async () => {
    const { connect, createEditorConnection } = setup({
      name: 'legacy-client',
      version: '0.0.0',
    });

    await connect(
      { resource_type: 'broadcast', resource_id: 'brd_1' },
      fakeCtx(),
    );

    expect(createEditorConnection).toHaveBeenCalledWith(
      expect.objectContaining({ agent_name: 'legacy-client' }),
    );
  });

  it('prefers the modern per-request envelope clientInfo over getClientVersion()', async () => {
    const { connect, createEditorConnection } = setup({
      name: 'legacy-client',
      version: '0.0.0',
    });

    await connect(
      { resource_type: 'broadcast', resource_id: 'brd_1' },
      fakeCtx({ name: 'modern-client', version: '1.0.0' }),
    );

    expect(createEditorConnection).toHaveBeenCalledWith(
      expect.objectContaining({ agent_name: 'modern-client' }),
    );
  });

  it('returns undefined when neither the envelope nor getClientVersion() has a name', async () => {
    const { connect, createEditorConnection } = setup(undefined);

    await connect(
      { resource_type: 'broadcast', resource_id: 'brd_1' },
      fakeCtx(),
    );

    expect(createEditorConnection).toHaveBeenCalledWith(
      expect.objectContaining({ agent_name: undefined }),
    );
  });

  it('honors an explicit agent_name argument over both', async () => {
    const { connect, createEditorConnection } = setup({
      name: 'legacy-client',
      version: '0.0.0',
    });

    await connect(
      {
        resource_type: 'broadcast',
        resource_id: 'brd_1',
        agent_name: 'My Custom Agent',
      },
      fakeCtx({ name: 'modern-client', version: '1.0.0' }),
    );

    expect(createEditorConnection).toHaveBeenCalledWith(
      expect.objectContaining({ agent_name: 'My Custom Agent' }),
    );
  });
});
