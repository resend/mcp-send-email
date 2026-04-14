/**
 * Extracts a resource ID from a Resend dashboard URL.
 *
 * Accepted URL patterns:
 *   https://resend.com/broadcasts/<id>
 *   https://resend.com/templates/<id>
 *   https://resend.com/automations/<id>
 *
 * If the input is not a URL, it is returned as-is (assumed to be a raw ID).
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

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a valid URL — treat as raw ID
    return trimmed;
  }

  // Only handle resend.com URLs
  if (url.hostname !== 'resend.com' && url.hostname !== 'www.resend.com') {
    return trimmed;
  }

  // pathname is like /broadcasts/<id> or /templates/<id>
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    return trimmed;
  }

  const [resource, id] = segments;

  if (expectedResource && resource !== expectedResource) {
    return trimmed;
  }

  if (
    resource === 'broadcasts' ||
    resource === 'templates' ||
    resource === 'automations'
  ) {
    return id;
  }

  return trimmed;
}
