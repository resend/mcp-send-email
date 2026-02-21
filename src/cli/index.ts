import type { ParsedArgs } from 'minimist';
import { printHelp } from './help.js';
import { resolveConfig } from './resolve.js';
import type { CliConfig } from './types.js';

/**
 * Resolve config from argv and env, or print help/error and exit.
 */
export function resolveConfigOrExit(
  argv: ParsedArgs,
  env: NodeJS.ProcessEnv = process.env,
): CliConfig {
  if (argv.help === true || argv.h === true) {
    printHelp();
    process.exit(0);
  }

  const result = resolveConfig(argv, env);
  if (!result.ok) {
    console.error('Error:', result.error);
    process.exit(1);
  }
  return result.config;
}

export { HELP_TEXT, printHelp } from './help.js';
export { parseArgs } from './parse.js';
export { resolveConfig } from './resolve.js';
export * from './types.js';
