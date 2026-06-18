export interface ServerOptions {
  senderEmailAddress?: string;
  replierEmailAddresses?: string[];
  /**
   * Override for the Resend API base URL, passed to the editor client. The
   * Resend SDK itself reads this via the RESEND_BASE_URL env var (set before
   * the SDK is imported). Undefined keeps the production default.
   */
  apiUrl?: string;
  /** Override for the dashboard origin used by editor/TipTap tooling. */
  dashboardUrl?: string;
}
