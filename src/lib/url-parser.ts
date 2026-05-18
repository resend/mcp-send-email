const SUPPORTED_RESOURCES = ['broadcasts', 'templates', 'automations'];

/**
 * Extract a resource ID from a Resend dashboard URL.
 *
 * Accepted URL patterns:
 *   https://resend.com/broadcasts/<id>
 *   https://resend.com/templates/<id>
 *   https://resend.com/automations/<id>
 *   https://www.resend.com/<resource>/<id>
 *
 * URL Edge Cases Handled:
 * - Trailing slashes: https://resend.com/broadcasts/123/
 * - Query parameters: https://resend.com/broadcasts/123?tab=content
 * - Leading/trailing whitespace: "  https://resend.com/broadcasts/123  "
 * - URL encoding: Standard URL parsing applied
 *
 * Input without "http://" or "https://" is treated as a raw ID and returned unchanged.
 * This allows both URL and ID inputs in the same parameter.
 *
 * @param input - Either a Resend dashboard URL or raw resource ID
 * @param expectedResource - Optional: validate the resource type matches (broadcasts, templates, automations)
 * @returns Extracted resource ID
 * @throws Error if input looks like a URL but is malformed or doesn't match expectedResource
 *
 * @example
 * extractIdFromUrl('https://resend.com/broadcasts/abc-123', 'broadcasts') // 'abc-123'
 * extractIdFromUrl('abc-123') // 'abc-123'
 * extractIdFromUrl('https://resend.com/broadcasts/123/', 'broadcasts') // '123'
 * extractIdFromUrl('https://resend.com/templates/456?tab=content') // '456'
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

  // Only handle resend.com URLs
  if (url.hostname !== 'resend.com' && url.hostname !== 'www.resend.com') {
    throw new Error(
      `Unrecognized URL host "${url.hostname}". Expected a resend.com URL (e.g. https://resend.com/${expectedResource ?? 'broadcasts'}/<id>) or a raw resource ID.`,
    );
  }

  // pathname is like /broadcasts/<id> or /templates/<id>
  // filter(Boolean) removes empty segments from trailing slashes and leading slash
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    const hint = segments[0] ?? expectedResource ?? 'broadcasts';
    throw new Error(
      `The URL "${trimmed}" is missing a resource ID. Expected a URL like https://resend.com/${hint}/<id>.`,
    );
  }

  const [resource, id] = segments;

  // Validate that the ID is not empty after stripping
  if (!id) {
    throw new Error(
      `The URL "${trimmed}" has an empty resource ID. Expected a URL like https://resend.com/${resource}/<id>.`,
    );
  }

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
