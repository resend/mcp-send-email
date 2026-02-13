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

  if (!apiKey || !apiKey.trim()) {
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

  const http = parsed.http === true || parsed['http'] === true;
  const transport = http ? 'http' : 'stdio';
  const port = parsePort(parsed, env);

  return {
    ok: true,
    config: {
      apiKey: apiKey.trim(),
      senderEmailAddress: senderEmailAddress ?? '',
      replierEmailAddresses: parseReplierAddresses(parsed, env),
      transport,
      port,
    },
  };
}
