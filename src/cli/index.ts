import type { ParsedArgs } from 'minimist';
import { printHelp } from './help.js';
import { resolveConfig } from './resolve.js';
import type { CliConfig } from './types.js';

/**
 * Parse argv and env into config. Prints help or error and exits if invalid.
 */
export function parseCli(
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
