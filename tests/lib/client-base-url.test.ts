import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardClient } from '../../src/lib/dashboard-client.js';
import { ResendEditorClient } from '../../src/lib/resend-editor-client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('client base URLs from env', () => {
  it('ResendEditorClient defaults its API base to RESEND_BASE_URL', async () => {
    vi.stubEnv('RESEND_BASE_URL', 'https://api.example.com');
    const fetchMock = vi.fn(async () => jsonResponse({ content: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEditorClient('re_test').getEditorContent(
      'broadcast',
      'b_1',
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith('https://api.example.com/editor/content')).toBe(true);
  });

  it('ResendEditorClient strips a trailing slash on the env URL', async () => {
    vi.stubEnv('RESEND_BASE_URL', 'https://api.example.com/');
    const fetchMock = vi.fn(async () => jsonResponse({ content: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEditorClient('re_test').getEditorContent(
      'broadcast',
      'b_1',
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith('https://api.example.com/editor/content')).toBe(true);
    expect(url).not.toContain('.com//');
  });

  it('DashboardClient defaults its origin to RESEND_DASHBOARD_URL', async () => {
    vi.stubEnv('RESEND_DASHBOARD_URL', 'https://app.example.com');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: 'schema', version: '1' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new DashboardClient().getTiptapSchema();

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://app.example.com/api/agent/prompt',
    );
  });

  it('an explicit option overrides the env var', async () => {
    vi.stubEnv('RESEND_DASHBOARD_URL', 'https://app.example.com');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: 'schema', version: '1' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new DashboardClient({
      dashboardUrl: 'https://override.example.com',
    }).getTiptapSchema();

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://override.example.com/api/agent/prompt',
    );
  });
});
