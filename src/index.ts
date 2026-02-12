import { Resend } from 'resend';
import { parseArgs, resolveConfigOrExit } from './cli/index.js';
import { runStdio } from './transports/stdio.js';

const parsed = parseArgs(process.argv.slice(2));
const config = resolveConfigOrExit(parsed, process.env);
const resend = new Resend(config.apiKey);
const serverOptions = {
  senderEmailAddress: config.senderEmailAddress,
  replierEmailAddresses: config.replierEmailAddresses,
};

function onFatal(err: unknown): void {
  console.error('Fatal error:', err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

runStdio(resend, serverOptions).catch(onFatal);
