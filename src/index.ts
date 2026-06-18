#!/usr/bin/env node
import './user-agent.js';
import 'dotenv/config';
import { Resend } from 'resend';
import { parseArgs, resolveConfigOrExit } from './cli/index.js';
import { runHttp } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

const parsed = parseArgs(process.argv.slice(2));
const config = resolveConfigOrExit(parsed, process.env);

// Note: the Resend SDK reads RESEND_BASE_URL from the environment on its own
// (dotenv is loaded above, before the SDK import), so we don't set it here.
// config.apiUrl is passed through only for the editor client, which is a
// separate fetch-based client that doesn't go through the SDK.
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
