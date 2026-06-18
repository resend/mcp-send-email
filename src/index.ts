#!/usr/bin/env node
import './user-agent.js';
import 'dotenv/config';
import { parseArgs, resolveConfigOrExit } from './cli/index.js';

const parsed = parseArgs(process.argv.slice(2));
const config = resolveConfigOrExit(parsed, process.env);

// The Resend SDK reads RESEND_BASE_URL once at module-load time (no constructor
// option exists), so the override must be in the environment BEFORE any module
// that imports `resend` is evaluated. That's why the resend-dependent modules
// below are imported dynamically, after this assignment. Mirrors the
// pre-import env setup in ./user-agent.js.
if (config.apiUrl) process.env.RESEND_BASE_URL = config.apiUrl;

const { Resend } = await import('resend');
const { runHttp } = await import('./transports/http.js');
const { runStdio } = await import('./transports/stdio.js');

const serverOptions = {
  senderEmailAddress: config.senderEmailAddress,
  replierEmailAddresses: config.replierEmailAddresses,
  apiUrl: config.apiUrl,
  dashboardUrl: config.dashboardUrl,
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
