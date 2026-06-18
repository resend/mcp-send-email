import type { ParsedArgs } from 'minimist';
import { DEFAULT_HTTP_PORT } from './constants.js';
import { parseAllowedHosts, parseReplierAddresses } from './parse.js';
import type { ResolveResult } from './types.js';

function resolveHost(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (typeof parsed.host === 'string' && parsed.host.trim() !== '')
    return parsed.host.trim();
  if (typeof env.MCP_HOST === 'string' && env.MCP_HOST.trim() !== '')
    return env.MCP_HOST.trim();
  return undefined;
}

/**
 * Resolve the Resend API base URL. argv wins over env, env over default.
 * Returns undefined when neither is set so the SDK's default applies. A
 * trailing slash is stripped because the SDK concatenates `${baseUrl}${path}`
 * with no normalization, so a trailing `/` would produce a double slash.
 */
function resolveApiUrl(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const raw =
    typeof parsed['api-url'] === 'string' && parsed['api-url'].trim() !== ''
      ? parsed['api-url'].trim()
      : typeof env.RESEND_BASE_URL === 'string' && env.RESEND_BASE_URL.trim()
        ? env.RESEND_BASE_URL.trim()
        : undefined;
  return raw ? raw.replace(/\/$/, '') : undefined;
}

/**
 * Resolve the dashboard origin used by editor/TipTap tooling. argv wins over
 * env. Trailing slash stripped for the same reason as resolveApiUrl.
 */
function resolveDashboardUrl(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const raw =
    typeof parsed['dashboard-url'] === 'string' &&
    parsed['dashboard-url'].trim() !== ''
      ? parsed['dashboard-url'].trim()
      : typeof env.RESEND_DASHBOARD_URL === 'string' &&
          env.RESEND_DASHBOARD_URL.trim()
        ? env.RESEND_DASHBOARD_URL.trim()
        : undefined;
  return raw ? raw.replace(/\/$/, '') : undefined;
}

function parsePort(parsed: ParsedArgs, env: NodeJS.ProcessEnv): number {
  const fromArg =
    typeof parsed.port === 'string' && parsed.port.trim() !== ''
      ? Number.parseInt(parsed.port.trim(), 10)
      : NaN;
  if (Number.isInteger(fromArg) && fromArg > 0 && fromArg < 65536)
    return fromArg;
  const fromEnv =
    typeof env.MCP_PORT === 'string' && env.MCP_PORT.trim() !== ''
      ? Number.parseInt(env.MCP_PORT.trim(), 10)
      : NaN;
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536)
    return fromEnv;
  return DEFAULT_HTTP_PORT;
}

/**
 * Resolve config from parsed argv and env. No side effects, no exit.
 */
export function resolveConfig(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv = process.env,
): ResolveResult {
  const apiKey =
    (typeof parsed.key === 'string' ? parsed.key : null) ??
    env.RESEND_API_KEY ??
    null;

  const http = parsed.http === true;

  // Stdio requires an API key at startup. HTTP mode is lenient because
  // each client provides their own key via the Authorization: Bearer header.
  if (!http && (!apiKey || !apiKey.trim())) {
    return {
      ok: false,
      error:
        'No API key. Set RESEND_API_KEY or use --key=<your-resend-api-key>',
    };
  }

  const senderEmailAddress =
    (typeof parsed.sender === 'string' ? parsed.sender : null) ??
    (typeof env.SENDER_EMAIL_ADDRESS === 'string'
      ? env.SENDER_EMAIL_ADDRESS.trim() || undefined
      : undefined);

  const port = parsePort(parsed, env);

  const base = {
    senderEmailAddress: senderEmailAddress ?? '',
    replierEmailAddresses: parseReplierAddresses(parsed, env),
    port,
    apiUrl: resolveApiUrl(parsed, env),
    dashboardUrl: resolveDashboardUrl(parsed, env),
  };

  return {
    ok: true,
    config: http
      ? {
          ...base,
          transport: 'http' as const,
          apiKey: apiKey?.trim(),
          host: resolveHost(parsed, env),
          allowedHosts: parseAllowedHosts(parsed, env),
        }
      : { ...base, transport: 'stdio' as const, apiKey: apiKey!.trim() },
  };
}
