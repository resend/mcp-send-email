import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import minimist from 'minimist';
import { Resend } from 'resend';
import packageJson from './package.json' with { type: 'json' };
import {
  addAudienceTools,
  addBroadcastTools,
  addContactTools,
  addEmailTools,
} from './tools/index.js';

// Parse command line arguments
const argv = minimist(process.argv.slice(2));

// Get API key from command line argument or fall back to environment variable
const apiKey = argv.key || process.env.RESEND_API_KEY;

// Get sender email address from command line argument or fall back to environment variable
// Optional.
const senderEmailAddress = argv.sender || process.env.SENDER_EMAIL_ADDRESS;

// Get reply to email addresses from command line argument or fall back to environment variable
let replierEmailAddresses: string[] = [];

if (Array.isArray(argv['reply-to'])) {
  replierEmailAddresses = argv['reply-to'];
} else if (typeof argv['reply-to'] === 'string') {
  replierEmailAddresses = [argv['reply-to']];
} else if (process.env.REPLY_TO_EMAIL_ADDRESSES) {
  replierEmailAddresses = process.env.REPLY_TO_EMAIL_ADDRESSES.split(',');
}

if (!apiKey) {
  console.error(
    'No API key provided. Please set RESEND_API_KEY environment variable or use --key argument',
  );
  process.exit(1);
}

const resend = new Resend(apiKey);

// Create server instance
const server = new McpServer({
  name: 'email-sending-service',
  version: packageJson.version,
});

addAudienceTools(server, resend);
addBroadcastTools(server, resend, {
  senderEmailAddress,
  replierEmailAddresses,
});
addContactTools(server, resend);
addEmailTools(server, resend, { senderEmailAddress, replierEmailAddresses });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Email sending service MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
