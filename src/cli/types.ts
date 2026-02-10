export interface CliConfig {
  apiKey: string;
  senderEmailAddress: string;
  replierEmailAddresses: string[];
}

export type ResolveResult =
  | { ok: true; config: CliConfig }
  | { ok: false; error: string };

export interface ParsedCli {
  help: boolean;
  key: string | undefined;
  sender: string | undefined;
  'reply-to': string | string[] | undefined;
}
