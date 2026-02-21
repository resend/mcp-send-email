export type TransportMode = 'stdio' | 'http';

export interface CliConfig {
  apiKey: string;
  senderEmailAddress: string;
  replierEmailAddresses: string[];
  transport: TransportMode;
  port: number;
}

export type ResolveResult =
  | { ok: true; config: CliConfig }
  | { ok: false; error: string };
