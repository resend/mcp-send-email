export interface CliConfig {
  apiKey: string;
  senderEmailAddress: string;
  replierEmailAddresses: string[];
}

export type ResolveResult =
  | { ok: true; config: CliConfig }
  | { ok: false; error: string };
