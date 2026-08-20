const SUPPORTED_RESOURCES = ['broadcasts', 'templates', 'automations'];

const DEFAULT_DASHBOARD_HOSTS = ['resend.com', 'www.resend.com'];

function allowedDashboardHosts(): string[] {
  const configured = process.env.RESEND_DASHBOARD_URL;
  if (!configured) return DEFAULT_DASHBOARD_HOSTS;

  let hostname: string;
  try {
    hostname = new URL(configured).hostname;
  } catch {
    return DEFAULT_DASHBOARD_HOSTS;
  }

  if (DEFAULT_DASHBOARD_HOSTS.includes(hostname)) {
    return DEFAULT_DASHBOARD_HOSTS;
  }

  return [...DEFAULT_DASHBOARD_HOSTS, hostname];
}

/**
 * Extracts a resource ID from a Resend dashboard URL.
 *
 * Accepted URL patterns:
 *   https://resend.com/broadcasts/<id>
 *   https://resend.com/templates/<id>
 *   https://resend.com/automations/<id>
 *
 * Production hosts are always accepted. A server pointed at another stack also
 * accepts its own dashboard host from `RESEND_DASHBOARD_URL`, the same env var
 * `DashboardClient` reads, so a URL copied from the dashboard the client is
 * actually using resolves. Every other host is still rejected.
 *
 * If the input is not a URL, it is returned as-is (assumed to be a raw ID).
 * If the input is a URL but cannot be resolved to an ID, an error is thrown.
 */
export function extractIdFromUrl(
  input: string,
  expectedResource?: 'broadcasts' | 'templates' | 'automations',
): string {
  const trimmed = input.trim();

  // Quick check: only attempt URL parsing if it looks like a URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }

  // From this point on, the input is a URL — it is never a valid raw ID,
  // so every failure path should throw rather than return the URL string.

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      `The input looks like a URL but could not be parsed: ${trimmed}. Please provide a valid Resend dashboard URL or a raw resource ID.`,
    );
  }

  const dashboardHosts = allowedDashboardHosts();
  if (!dashboardHosts.includes(url.hostname)) {
    throw new Error(
      `Unrecognized URL host "${url.hostname}". Expected a dashboard URL on ${dashboardHosts.join(' or ')} (e.g. https://resend.com/${expectedResource ?? 'broadcasts'}/<id>) or a raw resource ID.`,
    );
  }

  // pathname is like /broadcasts/<id> or /templates/<id>
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    const hint = segments[0] ?? expectedResource ?? 'broadcasts';
    throw new Error(
      `The URL "${trimmed}" is missing a resource ID. Expected a URL like https://resend.com/${hint}/<id>.`,
    );
  }

  const [resource, id] = segments;

  if (expectedResource && resource !== expectedResource) {
    throw new Error(
      `Expected a ${expectedResource} URL, but got a ${resource} URL. Please provide a ${expectedResource} ID or URL (e.g. https://resend.com/${expectedResource}/<id>).`,
    );
  }

  if (SUPPORTED_RESOURCES.includes(resource)) {
    return id;
  }

  throw new Error(
    `Unsupported resource type "${resource}" in URL. Only broadcasts, templates, and automations URLs are supported.`,
  );
}
