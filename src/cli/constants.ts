export const CLI_STRING_OPTIONS = [
  'key',
  'sender',
  'reply-to',
  'port',
] as const;

export const DEFAULT_HTTP_PORT = 3000;

export const RESEND_BASE_URL =
  process.env.RESEND_BASE_URL ?? 'https://api.resend.com';
