import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TiptapCache } from '../../src/lib/tiptap-cache.js';

describe('TiptapCache', () => {
  beforeEach(() => {
    // Clear the singleton instance between tests
    TiptapCache['instance'] = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getInstance', () => {
    it('returns the same instance on multiple calls', () => {
      const instance1 = TiptapCache.getInstance();
      const instance2 = TiptapCache.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('accepts options on first instantiation', () => {
      const cache = TiptapCache.getInstance({ maxSize: 50, ttl: 5000 });
      expect(cache).toBeDefined();
      expect(cache.size()).toBe(0);
    });
  });

  describe('set and get', () => {
    it('stores and retrieves content', () => {
      const cache = TiptapCache.getInstance();
      const content = { type: 'doc', content: [{ type: 'paragraph' }] };

      cache.set('broadcast', 'broadcast_123', content);
      const retrieved = cache.get('broadcast', 'broadcast_123');

      expect(retrieved).toEqual(content);
    });

    it('returns null for non-existent entries', () => {
      const cache = TiptapCache.getInstance();
      const retrieved = cache.get('broadcast', 'nonexistent');
      expect(retrieved).toBeNull();
    });

    it('stores different resource types separately', () => {
      const cache = TiptapCache.getInstance();
      const broadcastContent = { type: 'doc', broadcast: true };
      const templateContent = { type: 'doc', template: true };

      cache.set('broadcast', 'res_123', broadcastContent);
      cache.set('template', 'res_123', templateContent);

      expect(cache.get('broadcast', 'res_123')).toEqual(broadcastContent);
      expect(cache.get('template', 'res_123')).toEqual(templateContent);
    });

    it('overwrites existing content', () => {
      const cache = TiptapCache.getInstance();
      const oldContent = { version: 1 };
      const newContent = { version: 2 };

      cache.set('broadcast', 'broadcast_123', oldContent);
      cache.set('broadcast', 'broadcast_123', newContent);

      expect(cache.get('broadcast', 'broadcast_123')).toEqual(newContent);
    });

    it('stores content with complex nested structures', () => {
      const cache = TiptapCache.getInstance();
      const complexContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ' ', marks: [{ type: 'bold' }] },
              { type: 'text', text: 'World' },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }],
              },
            ],
          },
        ],
      };

      cache.set('template', 'template_456', complexContent);
      const retrieved = cache.get('template', 'template_456');

      expect(retrieved).toEqual(complexContent);
    });
  });

  describe('has', () => {
    it('returns true for existing entries', () => {
      const cache = TiptapCache.getInstance();
      const content = { type: 'doc' };

      cache.set('broadcast', 'broadcast_123', content);
      expect(cache.has('broadcast', 'broadcast_123')).toBe(true);
    });

    it('returns false for non-existent entries', () => {
      const cache = TiptapCache.getInstance();
      expect(cache.has('broadcast', 'nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes entries from cache', () => {
      const cache = TiptapCache.getInstance();
      const content = { type: 'doc' };

      cache.set('broadcast', 'broadcast_123', content);
      expect(cache.has('broadcast', 'broadcast_123')).toBe(true);

      const deleted = cache.delete('broadcast', 'broadcast_123');
      expect(deleted).toBe(true);
      expect(cache.has('broadcast', 'broadcast_123')).toBe(false);
    });

    it('returns false when deleting non-existent entries', () => {
      const cache = TiptapCache.getInstance();
      const deleted = cache.delete('broadcast', 'nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries from cache', () => {
      const cache = TiptapCache.getInstance();

      cache.set('broadcast', 'broadcast_1', { type: 'doc' });
      cache.set('broadcast', 'broadcast_2', { type: 'doc' });
      cache.set('template', 'template_1', { type: 'doc' });

      expect(cache.size()).toBe(3);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.has('broadcast', 'broadcast_1')).toBe(false);
    });
  });

  describe('size', () => {
    it('returns correct number of entries', () => {
      const cache = TiptapCache.getInstance();

      expect(cache.size()).toBe(0);

      cache.set('broadcast', 'broadcast_1', { type: 'doc' });
      expect(cache.size()).toBe(1);

      cache.set('template', 'template_1', { type: 'doc' });
      expect(cache.size()).toBe(2);

      cache.delete('broadcast', 'broadcast_1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('keys', () => {
    it('returns all keys in cache', () => {
      const cache = TiptapCache.getInstance();

      cache.set('broadcast', 'broadcast_1', { type: 'doc' });
      cache.set('template', 'template_1', { type: 'doc' });
      cache.set('broadcast', 'broadcast_2', { type: 'doc' });

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('broadcast:broadcast_1');
      expect(keys).toContain('template:template_1');
      expect(keys).toContain('broadcast:broadcast_2');
    });

    it('returns empty array for empty cache', () => {
      const cache = TiptapCache.getInstance();
      expect(cache.keys()).toEqual([]);
    });
  });

  describe('entries', () => {
    it('returns all entries with timestamps', () => {
      const cache = TiptapCache.getInstance();
      const now = Date.now();
      vi.setSystemTime(now);

      const content1 = { type: 'doc', id: 1 };
      const content2 = { type: 'doc', id: 2 };

      cache.set('broadcast', 'broadcast_1', content1);
      vi.advanceTimersByTime(1000);
      cache.set('template', 'template_1', content2);

      const entries = cache.entries();
      expect(entries).toHaveLength(2);

      const [key1, entry1] = entries[0];
      const [key2, entry2] = entries[1];

      expect(key1).toBe('broadcast:broadcast_1');
      expect(entry1.content).toEqual(content1);
      expect(entry1.timestamp).toBe(now);

      expect(key2).toBe('template:template_1');
      expect(entry2.content).toEqual(content2);
      expect(entry2.timestamp).toBe(now + 1000);
    });
  });

  describe('maxSize eviction', () => {
    it('evicts oldest entry when cache reaches max size', () => {
      const cache = TiptapCache.getInstance({ maxSize: 3 });

      cache.set('broadcast', 'broadcast_1', { id: 1 });
      cache.set('broadcast', 'broadcast_2', { id: 2 });
      cache.set('broadcast', 'broadcast_3', { id: 3 });

      expect(cache.size()).toBe(3);

      // Adding a fourth entry should evict the first one
      cache.set('broadcast', 'broadcast_4', { id: 4 });

      expect(cache.size()).toBe(3);
      expect(cache.has('broadcast', 'broadcast_1')).toBe(false);
      expect(cache.has('broadcast', 'broadcast_2')).toBe(true);
      expect(cache.has('broadcast', 'broadcast_3')).toBe(true);
      expect(cache.has('broadcast', 'broadcast_4')).toBe(true);
    });

    it('does not evict when updating existing entry', () => {
      const cache = TiptapCache.getInstance({ maxSize: 2 });

      cache.set('broadcast', 'broadcast_1', { id: 1 });
      cache.set('broadcast', 'broadcast_2', { id: 2 });

      expect(cache.size()).toBe(2);

      // Updating existing entry should not trigger eviction
      cache.set('broadcast', 'broadcast_1', { id: 1, updated: true });

      expect(cache.size()).toBe(2);
      expect(cache.get('broadcast', 'broadcast_1')).toEqual({ id: 1, updated: true });
    });
  });

  describe('TTL expiration', () => {
    it('expires entries after TTL', () => {
      const cache = TiptapCache.getInstance({ ttl: 5000 });
      const now = Date.now();
      vi.setSystemTime(now);

      const content = { type: 'doc' };
      cache.set('broadcast', 'broadcast_123', content);

      // Entry should exist immediately
      expect(cache.has('broadcast', 'broadcast_123')).toBe(true);

      // Advance past expiration threshold
      vi.advanceTimersByTime(5001);
      expect(cache.has('broadcast', 'broadcast_123')).toBe(false);
    });

    it('returns null for expired entries', () => {
      const cache = TiptapCache.getInstance({ ttl: 3000 });

      cache.set('template', 'template_123', { type: 'doc' });
      expect(cache.get('template', 'template_123')).toBeDefined();

      vi.advanceTimersByTime(3001);
      expect(cache.get('template', 'template_123')).toBeNull();
    });

    it('removes expired entries from cache', () => {
      const cache = TiptapCache.getInstance({ ttl: 2000 });

      cache.set('broadcast', 'broadcast_1', { id: 1 });
      expect(cache.size()).toBe(1);
      expect(cache.keys()).toContain('broadcast:broadcast_1');

      vi.advanceTimersByTime(2001);

      // Access expired entry to trigger cleanup
      cache.get('broadcast', 'broadcast_1');

      expect(cache.size()).toBe(0);
      expect(cache.keys()).not.toContain('broadcast:broadcast_1');
    });

    it('handles no TTL (entries never expire)', () => {
      const cache = TiptapCache.getInstance({ ttl: undefined });

      cache.set('broadcast', 'broadcast_123', { type: 'doc' });

      // Advance time far into the future
      vi.advanceTimersByTime(1000 * 60 * 60 * 24); // 24 hours

      expect(cache.has('broadcast', 'broadcast_123')).toBe(true);
    });
  });

  describe('shared session behavior', () => {
    it('shares cache across multiple code sections', () => {
      const cache1 = TiptapCache.getInstance();
      const content = { type: 'doc', version: 1 };

      cache1.set('broadcast', 'shared_broadcast', content);

      // Simulate another part of code getting the singleton
      const cache2 = TiptapCache.getInstance();
      const retrieved = cache2.get('broadcast', 'shared_broadcast');

      expect(retrieved).toEqual(content);
    });

    it('persists data across different operations', () => {
      const cache = TiptapCache.getInstance();

      // Store in one operation
      cache.set('template', 'template_1', { v: 1 });
      cache.set('broadcast', 'broadcast_1', { v: 1 });

      // Check in another operation
      expect(cache.size()).toBe(2);

      // Update one
      cache.set('template', 'template_1', { v: 2 });

      // Verify both still exist with correct values
      expect(cache.get('template', 'template_1')).toEqual({ v: 2 });
      expect(cache.get('broadcast', 'broadcast_1')).toEqual({ v: 1 });
    });
  });
});
