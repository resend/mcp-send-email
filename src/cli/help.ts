export const HELP_TEXT = `
Email sending MCP – stdio transport

Usage:
  node build/src/index.js [options]
  RESEND_API_KEY=re_xxx node build/src/index.js [options]

Options:
  --key <key>              Resend API key for all tools (or set RESEND_API_KEY)
  --sender <email>         Default from address for sending (or SENDER_EMAIL_ADDRESS)
  --reply-to <email>       Default reply-to for sending; repeat for multiple (or REPLY_TO_EMAIL_ADDRESSES)
  -h, --help               Show this help

Environment:
  RESEND_API_KEY           Required if --key not set
  SENDER_EMAIL_ADDRESS     Optional
  REPLY_TO_EMAIL_ADDRESSES Optional, comma-separated
`.trim();

export function printHelp(): void {
  console.error(HELP_TEXT);
}
