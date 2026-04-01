const DEFAULT_API_URL = 'https://api.resend.com';

export class ResendApiClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiKey: string, options?: { apiUrl?: string }) {
    this.apiKey = apiKey;
    this.apiUrl = (options?.apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
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
      throw new Error(
        `API error (${response.status}): ${error.message || error.error || response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async createEditorConnection(data: {
    resource_type: 'broadcast' | 'template';
    resource_id: string;
    agent_name?: string;
  }): Promise<{ apiKeyId: string; room_id: string }> {
    return this.apiRequest('POST', '/editor/connections', data);
  }

  async deleteEditorConnection(data: {
    resource_type: 'broadcast' | 'template';
    resource_id: string;
    agent_name?: string;
  }): Promise<{ ok: boolean }> {
    return this.apiRequest('DELETE', '/editor/connections', data);
  }

  async composeBroadcastContent(
    id: string,
    data: { content: Record<string, unknown> },
  ): Promise<{ id: string; object: string }> {
    return this.apiRequest('POST', '/editor/compose', {
      resource_type: 'broadcast',
      resource_id: id,
      content: data.content,
    });
  }

  async composeTemplateContent(
    id: string,
    data: { content: Record<string, unknown> },
  ): Promise<{ id: string; object: string }> {
    return this.apiRequest('POST', '/editor/compose', {
      resource_type: 'template',
      resource_id: id,
      content: data.content,
    });
  }
}
