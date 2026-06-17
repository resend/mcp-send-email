import type { ParsedArgs } from 'minimist';
import minimist from 'minimist';
import { CLI_STRING_OPTIONS } from './constants.js';

/**
 * Parse process.argv with minimist. Does not read env or validate.
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  return minimist(argv, {
    string: [...CLI_STRING_OPTIONS],
    boolean: ['help', 'http'],
    alias: { h: 'help' },
  });
}

/**
 * Parse reply-to from argv and env. argv wins.
 */
export function parseReplierAddresses(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string[] {
  if (Array.isArray(parsed['reply-to'])) return parsed['reply-to'];
  if (typeof parsed['reply-to'] === 'string') return [parsed['reply-to']];
  const v = env.REPLY_TO_EMAIL_ADDRESSES;
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parse the allowed-hosts list from argv and env. argv wins. Returns undefined
 * when neither is set, so the SDK's host-based default applies.
 */
export function parseAllowedHosts(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string[] | undefined {
  if (Array.isArray(parsed['allowed-hosts'])) return parsed['allowed-hosts'];
  if (typeof parsed['allowed-hosts'] === 'string') {
    const list = parsed['allowed-hosts']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  const v = env.MCP_ALLOWED_HOSTS;
  if (typeof v === 'string' && v.trim()) {
    const list = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}
