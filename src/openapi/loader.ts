/**
 * Loads resend-openapi.yaml and returns the OpenAPI spec with all $refs
 * pre-resolved inline (Code Mode standard: "All $refs are pre-resolved inline").
 * Used by both search (expose `spec` to agent code) and execute (drive request() from spec).
 *
 * Source (first match wins):
 * - RESEND_OPENAPI_SPEC_URL env: fetch from this URL (e.g. latest from GitHub).
 * - Else: bundled resend-openapi.yaml next to this file.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const OPENAPI_DOC_PATH = new URL('./resend-openapi.yaml', import.meta.url);

/** Official Resend OpenAPI spec on GitHub (main branch). */
export const RESEND_OPENAPI_SPEC_URL =
  'https://raw.githubusercontent.com/resend/resend-openapi/refs/heads/main/resend.yaml';

export type ResolvedSpec = Record<string, unknown>;

let cachedResolved: ResolvedSpec | null = null;

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    out[k] = deepClone(v);
  return out as T;
}

function resolveRef(spec: Record<string, unknown>, ref: string): unknown {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Recursively resolve $ref in a value. Objects that are exactly { $ref: "#/..." }
 * are replaced by the resolved reference. Nested $refs inside the referenced
 * object are also resolved.
 */
function resolveRefsInValue(
  spec: Record<string, unknown>,
  value: unknown,
  seen: Set<unknown>,
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveRefsInValue(spec, item, seen));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 1 && typeof obj.$ref === 'string') {
      const resolved = resolveRef(spec, obj.$ref);
      if (resolved != null) {
        const cloned = deepClone(resolved);
        return resolveRefsInValue(spec, cloned, seen);
      }
    }
    if (seen.has(value)) return value;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$ref') continue;
      out[k] = resolveRefsInValue(spec, v, seen);
    }
    return out;
  }
  return value;
}

function loadRawSpec(): string {
  return readFileSync(OPENAPI_DOC_PATH, 'utf8');
}

async function loadRawSpecAsync(): Promise<string> {
  const url =
    typeof process !== 'undefined' &&
    process.env?.RESEND_OPENAPI_SPEC_URL?.trim();
  if (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from ${url}: ${res.status} ${res.statusText}`,
      );
    }
    return res.text();
  }
  return readFileSync(OPENAPI_DOC_PATH, 'utf8');
}

function parseAndResolve(raw: string): ResolvedSpec {
  const parsed = parseYaml(raw) as Record<string, unknown>;
  const seen = new Set<unknown>();
  return resolveRefsInValue(parsed, deepClone(parsed), seen) as ResolvedSpec;
}

/**
 * Returns the Resend OpenAPI spec with all $refs resolved inline.
 * Loads from RESEND_OPENAPI_SPEC_URL if set (e.g. GitHub raw URL), otherwise from the bundled file.
 * Safe to expose to agent code (search) and use to drive request() (execute).
 */
export async function getResolvedOpenApiSpec(): Promise<ResolvedSpec> {
  if (cachedResolved) return cachedResolved;
  const raw = await loadRawSpecAsync();
  cachedResolved = parseAndResolve(raw);
  return cachedResolved;
}

/**
 * Sync version: only works when RESEND_OPENAPI_SPEC_URL is not set (uses bundled file).
 * Use getResolvedOpenApiSpec() when you support loading from URL.
 */
export function getResolvedOpenApiSpecSync(): ResolvedSpec {
  if (cachedResolved) return cachedResolved;
  const raw = loadRawSpec();
  cachedResolved = parseAndResolve(raw);
  return cachedResolved;
}
