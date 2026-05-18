import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendEditorClient } from '../../src/lib/resend-editor-client.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('ResendEditorClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createEditorConnection', () => {
    it('validates and returns successful response', async () => {
      const mockResponse = {
        apiKeyId: 'key_123',
        room_id: 'room_abc',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new ResendEditorClient('re_test_key');
      const result = await client.createEditorConnection({
        resource_type: 'broadcast',
        resource_id: 'broadcast_123',
        agent_name: 'TestAgent',
      });

      expect(result).toEqual(mockResponse);
    });

    it('throws on missing apiKeyId in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          room_id: 'room_abc',
          // Missing apiKeyId
        }),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.createEditorConnection({
          resource_type: 'broadcast',
          resource_id: 'broadcast_123',
        }),
      ).rejects.toThrow('Invalid API response');
    });

    it('throws on missing room_id in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiKeyId: 'key_123',
          // Missing room_id
        }),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.createEditorConnection({
          resource_type: 'broadcast',
          resource_id: 'broadcast_123',
        }),
      ).rejects.toThrow('Invalid API response');
    });

    it('handles API error with message field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          message: 'Invalid API key format',
          code: 'invalid_key',
        }),
      });

      const client = new ResendEditorClient('bad_key');
      await expect(
        client.createEditorConnection({
          resource_type: 'broadcast',
          resource_id: 'broadcast_123',
        }),
      ).rejects.toThrow('Invalid API key format');
    });

    it('handles API error with error field fallback', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: 'Access denied',
        }),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.createEditorConnection({
          resource_type: 'broadcast',
          resource_id: 'broadcast_123',
        }),
      ).rejects.toThrow('Access denied');
    });

    it('handles malformed JSON in error response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.createEditorConnection({
          resource_type: 'broadcast',
          resource_id: 'broadcast_123',
        }),
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('deleteEditorConnection', () => {
    it('validates delete response with ok: true', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
        }),
      });

      const client = new ResendEditorClient('re_test_key');
      const result = await client.deleteEditorConnection({
        resource_type: 'template',
        resource_id: 'template_456',
      });

      expect(result).toEqual({ ok: true });
    });

    it('throws on invalid delete response (missing ok field)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.deleteEditorConnection({
          resource_type: 'template',
          resource_id: 'template_456',
        }),
      ).rejects.toThrow('Invalid API response');
    });
  });

  describe('composeBroadcastContent', () => {
    it('validates compose response with correct schema', async () => {
      const mockResponse = {
        id: 'broadcast_123',
        object: 'broadcast',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new ResendEditorClient('re_test_key');
      const result = await client.composeBroadcastContent('broadcast_123', {
        content: { text: 'Hello' },
      });

      expect(result).toEqual(mockResponse);
    });

    it('throws on missing id in compose response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'broadcast',
          // Missing id
        }),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.composeBroadcastContent('broadcast_123', {
          content: { text: 'Hello' },
        }),
      ).rejects.toThrow('Invalid API response');
    });
  });

  describe('getEditorContent', () => {
    it('validates content response with correct schema', async () => {
      const mockResponse = {
        content: { text: 'Hello', html: '<p>Hello</p>' },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new ResendEditorClient('re_test_key');
      const result = await client.getEditorContent(
        'broadcast',
        'broadcast_123',
      );

      expect(result).toEqual(mockResponse);
    });

    it('throws on missing content field in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.getEditorContent('broadcast', 'broadcast_123'),
      ).rejects.toThrow('Invalid API response');
    });

    it('throws on non-object content in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: 'not an object', // Should be object
        }),
      });

      const client = new ResendEditorClient('re_test_key');
      await expect(
        client.getEditorContent('broadcast', 'broadcast_123'),
      ).rejects.toThrow('Invalid API response');
    });
  });

  describe('URL customization', () => {
    it('strips trailing slash from custom URL', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
        }),
      });

      const client = new ResendEditorClient('re_test_key', {
        apiUrl: 'https://api.custom.com/',
      });

      await client.deleteEditorConnection({
        resource_type: 'template',
        resource_id: 'template_456',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.custom.com/editor/connections'),
        expect.any(Object),
      );
    });

    it('uses default API URL when not specified', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
        }),
      });

      const client = new ResendEditorClient('re_test_key');

      await client.deleteEditorConnection({
        resource_type: 'template',
        resource_id: 'template_456',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.resend.com/editor/connections'),
        expect.any(Object),
      );
    });
  });

  describe('Authorization header', () => {
    it('includes Bearer token in Authorization header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
        }),
      });

      const apiKey = 're_special_key_123';
      const client = new ResendEditorClient(apiKey);

      await client.deleteEditorConnection({
        resource_type: 'template',
        resource_id: 'template_456',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
          }),
        }),
      );
    });
  });
});
