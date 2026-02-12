import type { ParsedArgs } from 'minimist';
import { parseReplierAddresses } from './parse.js';
import type { ResolveResult } from './types.js';

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

  return {
    ok: true,
    config: {
      apiKey: apiKey.trim(),
      senderEmailAddress: senderEmailAddress ?? '',
      replierEmailAddresses: parseReplierAddresses(parsed, env),
    },
  };
}
