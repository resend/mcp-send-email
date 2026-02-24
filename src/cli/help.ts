export const HELP_TEXT = `
Resend MCP server

Usage:
  resend-mcp [options]
  npx resend-mcp [options]
  RESEND_API_KEY=re_xxx resend-mcp [options]

Options:
  --key <key>              Resend API key (or set RESEND_API_KEY)
  --sender <email>         Default from address (or SENDER_EMAIL_ADDRESS)
  --reply-to <email>       Reply-to; repeat for multiple (or REPLY_TO_EMAIL_ADDRESSES)
  --http                   Run HTTP server (Streamable HTTP at /mcp) instead of stdio
  --port <number>          HTTP port when using --http (default: 3000, or MCP_PORT)
  --host <hostname>        HTTP bind host when using --http (default: 127.0.0.1, or MCP_HOST)
  --origins <list>         Comma-separated Origin allowlist for --http (or MCP_ALLOWED_ORIGINS)
  -h, --help               Show this help

Environment:
  RESEND_API_KEY           Required if --key not set
  SENDER_EMAIL_ADDRESS     Optional
  REPLY_TO_EMAIL_ADDRESSES Optional, comma-separated
  MCP_PORT                 HTTP port when using --http (optional)
  MCP_HOST                 HTTP bind host when using --http (optional)
  MCP_ALLOWED_ORIGINS      Comma-separated Origin allowlist for HTTP (optional)
`.trim();

export function printHelp(): void {
  console.error(HELP_TEXT);
}
