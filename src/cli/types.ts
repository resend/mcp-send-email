export type TransportMode = 'stdio' | 'http';

/**
 * Stdio requires an API key at startup since it serves a single local user.
 */
export interface StdioConfig {
  apiKey: string;
  senderEmailAddress: string;
  replierEmailAddresses: string[];
  transport: 'stdio';
  port: number;
}

/**
 * HTTP mode makes the API key optional at startup because each remote client
 * provides their own Resend API key via the Authorization: Bearer header.
 */
export interface HttpConfig {
  apiKey?: string;
  senderEmailAddress: string;
  replierEmailAddresses: string[];
  transport: 'http';
  port: number;
}

export type CliConfig = StdioConfig | HttpConfig;

export type ResolveResult =
  | { ok: true; config: CliConfig }
  | { ok: false; error: string };
