#!/usr/bin/env node
import 'dotenv/config';
import { Resend } from 'resend';
import { parseArgs, resolveConfigOrExit } from './cli/index.js';
import { runHttp } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

const parsed = parseArgs(process.argv.slice(2));
const config = resolveConfigOrExit(parsed, process.env);
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

if (config.transport === 'http') {
  // HTTP mode: no Resend client needed at startup. Each connecting client
  // provides their own API key via the Authorization: Bearer header,
  // and a per-session Resend client is created in the transport layer.
  runHttp(serverOptions, config.port).catch(onFatal);
} else {
  // Stdio mode: single user, API key is required at startup.
  const resend = new Resend(config.apiKey);
  runStdio(resend, serverOptions).catch(onFatal);
}
