import type { ParsedArgs } from 'minimist';
import { DEFAULT_HTTP_PORT } from './constants.js';
import { parseReplierAddresses } from './parse.js';
import type { ResolveResult } from './types.js';

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
  };

  return {
    ok: true,
    config: http
      ? { ...base, transport: 'http' as const, apiKey: apiKey?.trim() }
      : { ...base, transport: 'stdio' as const, apiKey: apiKey!.trim() },
  };
}
