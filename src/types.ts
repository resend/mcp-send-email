export interface ServerOptions {
  apiKey?: string;
  senderEmailAddress?: string;
  replierEmailAddresses: string[];
  codeModeOnly?: boolean;
}
