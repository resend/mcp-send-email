import { z } from 'zod';

const DEFAULT_API_URL = 'https://api.resend.com';

/**
 * Response Schema Validation with Zod
 *
 * These schemas ensure that API responses conform to expected types before
 * they are used by the application. This prevents crashes from malformed
 * or unexpected API responses.
 *
 * Each schema defines the required fields and their types. If a response
 * doesn't match the schema, a clear validation error is thrown with details
 * about what was expected vs. what was received.
 */
const editorConnectionResponseSchema = z.object({
  apiKeyId: z.string(),
  room_id: z.string(),
});

const deleteConnectionResponseSchema = z.object({
  ok: z.boolean(),
});

const composeContentResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
});

const editorContentSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

export class ResendEditorClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiKey: string, options?: { apiUrl?: string }) {
    this.apiKey = apiKey;
    this.apiUrl = (options?.apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
  }

  /**
   * Make an authenticated API request with response validation.
   *
   * All API requests include:
   * - Bearer token authentication via Authorization header
   * - Content-Type: application/json
   * - Response validation using Zod schema (if provided)
   *
   * Error handling:
   * - Non-2xx responses: Extract error message from response, throw with HTTP status
   * - Failed JSON parsing: Use HTTP statusText as fallback
   * - Schema validation failure: Throw with Zod error details
   *
   * @param method - HTTP method (GET, POST, DELETE, etc.)
   * @param path - API endpoint path (relative to apiUrl)
   * @param body - Optional request body (will be JSON stringified)
   * @param schema - Optional Zod schema to validate response
   * @returns Parsed and validated response data
   */
  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    schema?: z.ZodSchema<T>,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: response.statusText,
      }));
      const errorMsg =
        typeof error === 'object' && error !== null
          ? (error as Record<string, unknown>).message ||
            (error as Record<string, unknown>).error ||
            response.statusText
          : response.statusText;
      throw new Error(`API error (${response.status}): ${errorMsg}`);
    }

    const data = await response.json();

    // Validate response with schema if provided
    if (schema) {
      try {
        return schema.parse(data);
      } catch (err) {
        throw new Error(
          `Invalid API response: ${err instanceof z.ZodError ? err.message : 'Unknown validation error'}`,
        );
      }
    }

    return data as T;
  }

  async createEditorConnection(data: {
    resource_type: 'broadcast' | 'template';
    resource_id: string;
    agent_name?: string;
  }): Promise<{ apiKeyId: string; room_id: string }> {
    return this.apiRequest(
      'POST',
      '/editor/connections',
      data,
      editorConnectionResponseSchema,
    );
  }

  async deleteEditorConnection(data: {
    resource_type: 'broadcast' | 'template';
    resource_id: string;
    agent_name?: string;
  }): Promise<{ ok: boolean }> {
    return this.apiRequest(
      'DELETE',
      '/editor/connections',
      data,
      deleteConnectionResponseSchema,
    );
  }

  async composeBroadcastContent(
    id: string,
    data: { content: Record<string, unknown> },
  ): Promise<{ id: string; object: string }> {
    return this.apiRequest(
      'POST',
      '/editor/content',
      {
        resource_type: 'broadcast',
        resource_id: id,
        content: data.content,
      },
      composeContentResponseSchema,
    );
  }

  async composeTemplateContent(
    id: string,
    data: { content: Record<string, unknown> },
  ): Promise<{ id: string; object: string }> {
    return this.apiRequest(
      'POST',
      '/editor/content',
      {
        resource_type: 'template',
        resource_id: id,
        content: data.content,
      },
      composeContentResponseSchema,
    );
  }

  async getEditorContent(
    resourceType: 'broadcast' | 'template',
    resourceId: string,
  ): Promise<{ content: Record<string, unknown> }> {
    const params = new URLSearchParams({
      resource_type: resourceType,
      resource_id: resourceId,
    });
    return this.apiRequest(
      'GET',
      `/editor/content?${params.toString()}`,
      undefined,
      editorContentSchema,
    );
  }
}
