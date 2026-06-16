export const HELP_TEXT = `
Resend MCP server

Usage:
  resend-mcp [options]
  npx resend-mcp [options]
  RESEND_API_KEY=re_xxx resend-mcp [options]

Options:
  --key <key>              Resend API key or OAuth access token (or set RESEND_API_KEY)
  --sender <email>         Default from address (or SENDER_EMAIL_ADDRESS)
  --reply-to <email>       Reply-to; repeat for multiple (or REPLY_TO_EMAIL_ADDRESSES)
  --http                   Run HTTP server (Streamable HTTP at /mcp) instead of stdio
  --port <number>          HTTP port when using --http (default: 3000, or MCP_PORT)
  -h, --help               Show this help

Environment:
  RESEND_API_KEY              API key or OAuth access token (required in stdio mode if --key not set)
  SENDER_EMAIL_ADDRESS        Optional
  REPLY_TO_EMAIL_ADDRESSES    Optional, comma-separated
  MCP_PORT                    HTTP port when using --http (optional)
  MCP_BASE_URL                Public base URL of this server for remote deployments (optional)
  RESEND_BASE_URL             Override Resend API base URL (optional)

HTTP mode authentication:
  Each connecting client provides credentials via: Authorization: Bearer <token>
  Accepted token types: Resend API key (re_xxx) or Resend OAuth access token
  OAuth discovery: GET /.well-known/oauth-authorization-server
`.trim();

export function printHelp(): void {
  console.error(HELP_TEXT);
}
