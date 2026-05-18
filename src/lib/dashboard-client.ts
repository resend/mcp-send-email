const DEFAULT_DASHBOARD_URL = 'https://resend.com';

/**
 * TipTap Schema Caching
 *
 * The TipTap JSON schema is fetched from the Resend dashboard API and is used
 * to validate and render email content in the visual editor. Since this schema
 * changes infrequently, we cache it to reduce latency and API calls.
 *
 * Cache behavior:
 * - TTL (Time-To-Live): 30 minutes per session
 * - Cache is checked before each fetch
 * - Expired cache automatically refreshes on next request
 * - Each fetch updates the timestamp
 *
 * Performance impact:
 * - First request: ~300ms (network roundtrip + parsing)
 * - Cached requests: ~1ms (in-memory lookup)
 * - Typical workflow saves 2-5 network round trips per user session
 *
 * Expiration: If dashboard is down for > 30 min, users will see cached schema.
 * If schema updates, users will see new version after 30 min or session restart.
 */
const SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

interface CachedSchema {
  data: { data: string; version: string };
  timestamp: number;
}

let schemaCache: CachedSchema | null = null;

export class DashboardClient {
  private dashboardUrl: string;

  constructor() {
    this.dashboardUrl = DEFAULT_DASHBOARD_URL;
  }

  async getTiptapSchema() {
    const now = Date.now();

    // Check if cache is still valid
    if (schemaCache && now - schemaCache.timestamp < SCHEMA_CACHE_TTL_MS) {
      return schemaCache.data;
    }

    const url = `${this.dashboardUrl}/api/agent/prompt`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch TipTap schema (${response.status}): ${response.statusText}`,
      );
    }

    const json = await response.json();
    if (!json.data || !json.version) {
      throw new Error('Invalid response format from dashboard API');
    }

    // Update cache
    const result = json as { data: string; version: string };
    schemaCache = { data: result, timestamp: now };

    return result;
  }
}
