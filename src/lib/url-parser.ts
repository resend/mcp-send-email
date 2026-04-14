const SIMPLE_RESOURCES = [
  'broadcasts',
  'templates',
  'automations',
  'domains',
  'api-keys',
  'webhooks',
  'logs',
  'emails',
];

const NESTED_RESOURCES: Record<string, string[]> = {
  audience: ['contacts', 'segments', 'topics'],
};

type SimpleResource =
  | 'broadcasts'
  | 'templates'
  | 'automations'
  | 'domains'
  | 'api-keys'
  | 'webhooks'
  | 'logs'
  | 'emails';

type NestedResource = 'audience/contacts' | 'audience/segments' | 'audience/topics';

type SupportedResource = SimpleResource | NestedResource;

function formatResourceHint(resource: SupportedResource): string {
  return resource.includes('/')
    ? `https://resend.com/${resource}/<id>`
    : `https://resend.com/${resource}/<id>`;
}

/**
 * Extracts a resource ID from a Resend dashboard URL.
 *
 * Accepted URL patterns:
 *   https://resend.com/broadcasts/<id>
 *   https://resend.com/templates/<id>
 *   https://resend.com/automations/<id>
 *   https://resend.com/domains/<id>
 *   https://resend.com/api-keys/<id>
 *   https://resend.com/webhooks/<id>
 *   https://resend.com/logs/<id>
 *   https://resend.com/emails/<id>
 *   https://resend.com/audience/contacts/<id>
 *   https://resend.com/audience/segments/<id>
 *   https://resend.com/audience/topics/<id>
 *
 * If the input is not a URL, it is returned as-is (assumed to be a raw ID).
 * If the input is a URL but cannot be resolved to an ID, an error is thrown.
 */
export function extractIdFromUrl(
  input: string,
  expectedResource?: SupportedResource,
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
      `Unrecognized URL host "${url.hostname}". Expected a resend.com URL (e.g. ${formatResourceHint(expectedResource ?? 'broadcasts')}) or a raw resource ID.`,
    );
  }

  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    const hint = expectedResource ?? segments[0] ?? 'broadcasts';
    throw new Error(
      `The URL "${trimmed}" is missing a resource ID. Expected a URL like ${formatResourceHint(hint as SupportedResource)}.`,
    );
  }

  // Try nested resource match first (e.g. /audience/contacts/<id>)
  if (segments.length >= 3) {
    const parent = segments[0];
    const child = segments[1];
    const nestedId = segments[2];
    const nestedChildren = NESTED_RESOURCES[parent];

    if (nestedChildren?.includes(child)) {
      const nestedResource = `${parent}/${child}` as NestedResource;

      if (expectedResource && nestedResource !== expectedResource) {
        throw new Error(
          `Expected a ${expectedResource} URL, but got a ${nestedResource} URL. Please provide a ${expectedResource} ID or URL (e.g. ${formatResourceHint(expectedResource)}).`,
        );
      }

      return nestedId;
    }
  }

  // Simple resource match (e.g. /broadcasts/<id>)
  const [resource, id] = segments;

  if (expectedResource && expectedResource.includes('/')) {
    // Expected a nested resource but got a simple path
    throw new Error(
      `Expected a ${expectedResource} URL, but got a ${resource} URL. Please provide a ${expectedResource} ID or URL (e.g. ${formatResourceHint(expectedResource)}).`,
    );
  }

  if (expectedResource && resource !== expectedResource) {
    throw new Error(
      `Expected a ${expectedResource} URL, but got a ${resource} URL. Please provide a ${expectedResource} ID or URL (e.g. ${formatResourceHint(expectedResource)}).`,
    );
  }

  if (SIMPLE_RESOURCES.includes(resource)) {
    return id;
  }

  const allSupported = [
    ...SIMPLE_RESOURCES,
    ...Object.entries(NESTED_RESOURCES).flatMap(([parent, children]) =>
      children.map((c) => `${parent}/${c}`),
    ),
  ];
  throw new Error(
    `Unsupported resource type "${resource}" in URL. Supported URL types: ${allSupported.join(', ')}.`,
  );
}
