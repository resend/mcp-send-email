import type { ParsedArgs } from 'minimist';
import minimist from 'minimist';
import { CLI_STRING_OPTIONS } from './constants.js';

/**
 * Parse process.argv with minimist. Does not read env or validate.
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  return minimist(argv, {
    string: [...CLI_STRING_OPTIONS],
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
