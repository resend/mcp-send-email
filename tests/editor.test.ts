import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEditorTools } from '../src/tools/editor.js';

describe('Editor Tools - Tiptap Cache', () => {
  let mockServer: any;
  let mockDashboard: any;
  let mockApiClient: any;
  let registeredTools: Record<string, any>;

  beforeEach(() => {
    registeredTools = {};
    mockServer = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registeredTools[name] = { config, handler };
      }),
      server: {
        getClientVersion: vi.fn().mockReturnValue({ name: 'test-agent' }),
      },
    };

    mockDashboard = {
      getTiptapSchema: vi.fn().mockResolvedValue({
        data: '{"type":"doc","content":[]}',
        version: '1.0.0',
      }),
    };

    mockApiClient = {
      getEditorContent: vi.fn().mockResolvedValue({
        content: { type: 'doc', content: [] },
      }),
      createEditorConnection: vi.fn().mockResolvedValue({
        room_id: 'test-room',
        apiKeyId: 'test-token',
      }),
      deleteEditorConnection: vi.fn().mockResolvedValue({}),
    };
  });

  it('should cache Tiptap schema across multiple tool calls and sessions', async () => {
    // Initialize tools for "Session A"
    addEditorTools(mockServer, mockDashboard, mockApiClient);
    const handler = registeredTools['get-tiptap-json-content'].handler;

    // First call: should fetch from dashboard
    await handler({
      resource_type: 'broadcast',
      resource_id: 'b_123',
      include_schema: true,
    });
    expect(mockDashboard.getTiptapSchema).toHaveBeenCalledTimes(1);

    // Second call (simulating same or different session): should use cached value
    await handler({
      resource_type: 'broadcast',
      resource_id: 'b_456',
      include_schema: true,
    });
    expect(mockDashboard.getTiptapSchema).toHaveBeenCalledTimes(1);

    // Verify the schema content is present in the response
    const result = await handler({
      resource_type: 'template',
      resource_id: 't_789',
      include_schema: true,
    });
    const schemaPart = result.content.find((p: any) =>
      p.text.includes('TipTap Schema Reference'),
    );
    expect(schemaPart).toBeDefined();
    expect(schemaPart.text).toContain('1.0.0');

    // Confirm dashboard was still only called once
    expect(mockDashboard.getTiptapSchema).toHaveBeenCalledTimes(1);

    // Verify call with include_schema: false does not use or trigger the fetch logic
    await handler({
      resource_type: 'broadcast',
      resource_id: 'b_123',
      include_schema: false,
    });
    expect(mockDashboard.getTiptapSchema).toHaveBeenCalledTimes(1);
  });
});
