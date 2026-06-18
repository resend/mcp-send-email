export type TransportMode = 'stdio' | 'http';

/**
 * Fields shared by every transport, resolved from argv + env.
 */
interface BaseConfig {
  senderEmailAddress: string;
  replierEmailAddresses: string[];
  port: number;
  /**
   * Override for the Resend API base URL (default https://api.resend.com).
   * Applies to the Resend SDK (via RESEND_BASE_URL) and the editor client.
   * Undefined keeps the production default.
   */
  apiUrl?: string;
  /**
   * Override for the dashboard origin (default https://resend.com) used by the
   * editor/TipTap tooling. Undefined keeps the production default.
   */
  dashboardUrl?: string;
}

/**
 * Stdio requires an API key at startup since it serves a single local user.
 */
export interface StdioConfig extends BaseConfig {
  apiKey: string;
  transport: 'stdio';
}

/**
 * HTTP mode makes the API key optional at startup because each remote client
 * provides their own Resend API key via the Authorization: Bearer header.
 */
export interface HttpConfig extends BaseConfig {
  apiKey?: string;
  transport: 'http';
  /**
   * Host used for the SDK's DNS-rebinding protection. Undefined keeps the
   * localhost-only default. Set to '0.0.0.0' to disable Host validation when
   * running behind a proxy / load balancer (protected by per-request auth).
   */
  host?: string;
  /** Explicit allow-list of acceptable Host header hostnames. */
  allowedHosts?: string[];
}

export type CliConfig = StdioConfig | HttpConfig;

export type ResolveResult =
  | { ok: true; config: CliConfig }
  | { ok: false; error: string };
