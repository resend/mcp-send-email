import type { ParsedArgs } from 'minimist';
import packageJson from '../../package.json' with { type: 'json' };
import { CLI_STRING_OPTIONS } from './constants.js';
import { printHelp } from './help.js';
import { resolveConfig } from './resolve.js';
import type { CliConfig } from './types.js';

const KNOWN_ARG_KEYS = new Set([
  '_',
  ...CLI_STRING_OPTIONS,
  'h',
  'help',
  'http',
  'v',
  'version',
]);

function getUnknownArgs(argv: ParsedArgs): string[] {
  const unknownOptions = Object.keys(argv)
    .filter((key) => !KNOWN_ARG_KEYS.has(key))
    .map((key) => (key.length === 1 ? `-${key}` : `--${key}`));
  const positionalArgs = Array.isArray(argv._) ? argv._.map(String) : [];

  return [...unknownOptions, ...positionalArgs];
}

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

  if (argv.version === true || argv.v === true) {
    console.log(packageJson.version);
    process.exit(0);
  }

  const unknownArgs = getUnknownArgs(argv);
  if (unknownArgs.length > 0) {
    console.error('Error:', `Unknown option: ${unknownArgs[0]}`);
    process.exit(1);
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
