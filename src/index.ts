import { Resend } from 'resend';
import { parseArgs, parseCli } from './cli/index.js';
import { runStdio } from './transports/stdio.js';

const parsed = parseArgs(process.argv.slice(2));
const config = parseCli(parsed, process.env);
const resend = new Resend(config.apiKey);
const serverOptions = {
  senderEmailAddress: config.senderEmailAddress,
  replierEmailAddresses: config.replierEmailAddresses,
};

runStdio(resend, serverOptions).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
