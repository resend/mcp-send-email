/**
 * Tiptap Cache - Shared session storage for Tiptap editor content
 *
 * This cache stores Tiptap JSON content for broadcasts and templates.
 * The cache is shared across all sessions (not per-session).
 */

export interface TiptapCacheEntry {
  content: Record<string, unknown>;
  timestamp: number;
}

export interface TiptapCacheOptions {
  maxSize?: number; // Maximum number of entries to cache (default: 100)
  ttl?: number; // Time to live in milliseconds (default: no expiration)
}

export class TiptapCache {
  private static instance: TiptapCache;
  private cache: Map<string, TiptapCacheEntry>;
  private maxSize: number;
  private ttl: number | null;

  private constructor(options?: TiptapCacheOptions) {
    this.cache = new Map();
    this.maxSize = options?.maxSize ?? 100;
    this.ttl = options?.ttl ?? null;
  }

  /**
   * Get the singleton instance of TiptapCache
   */
  static getInstance(options?: TiptapCacheOptions): TiptapCache {
    if (!TiptapCache.instance) {
      TiptapCache.instance = new TiptapCache(options);
    }
    return TiptapCache.instance;
  }

  /**
   * Generate cache key from resource type and ID
   */
  private generateKey(resourceType: 'broadcast' | 'template', resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  /**
   * Get content from cache
   * Returns null if not found or expired
   */
  get(resourceType: 'broadcast' | 'template', resourceId: string): Record<string, unknown> | null {
    const key = this.generateKey(resourceType, resourceId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (this.ttl !== null && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.content;
  }

  /**
   * Set content in cache
   * Automatically evicts oldest entry if cache is full
   */
  set(resourceType: 'broadcast' | 'template', resourceId: string, content: Record<string, unknown>): void {
    const key = this.generateKey(resourceType, resourceId);

    // If cache is at max size and key doesn't exist, remove oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if content exists in cache (and is not expired)
   */
  has(resourceType: 'broadcast' | 'template', resourceId: string): boolean {
    return this.get(resourceType, resourceId) !== null;
  }

  /**
   * Delete a specific entry from cache
   */
  delete(resourceType: 'broadcast' | 'template', resourceId: string): boolean {
    const key = this.generateKey(resourceType, resourceId);
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (number of entries)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in cache (including expired entries that haven't been accessed)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all entries in cache (including expired entries that haven't been accessed)
   */
  entries(): Array<[string, TiptapCacheEntry]> {
    return Array.from(this.cache.entries());
  }
}
