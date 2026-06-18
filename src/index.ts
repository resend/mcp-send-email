#!/usr/bin/env node
import './user-agent.js';
import 'dotenv/config';
import { Resend } from 'resend';
import { parseArgs, resolveConfigOrExit } from './cli/index.js';
import { runHttp } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

const parsed = parseArgs(process.argv.slice(2));
const config = resolveConfigOrExit(parsed, process.env);

// The Resend SDK and the editor/dashboard clients each read their base-URL env
// var (RESEND_BASE_URL / RESEND_DASHBOARD_URL) on their own, so there is no URL
// to thread through here.
const serverOptions = {
  senderEmailAddress: config.senderEmailAddress,
  replierEmailAddresses: config.replierEmailAddresses,
};

function onFatal(err: unknown): void {
  console.error(
    'Fatal error:',
    err instanceof Error ? err.message : 'unexpected error',
  );
  process.exit(1);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

if (config.transport === 'http') {
  // HTTP mode: no Resend client needed at startup. Each connecting client
  // provides their own API key via the Authorization: Bearer header,
  // and a per-session Resend client is created in the transport layer.
  runHttp(serverOptions, config.port, {
    host: config.host,
    allowedHosts: config.allowedHosts,
  }).catch(onFatal);
} else {
  // Stdio mode: single user, API key is required at startup.
  const resend = new Resend(config.apiKey);
  runStdio(resend, serverOptions, config.apiKey).catch(onFatal);
}
