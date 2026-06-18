export interface ServerOptions {
  senderEmailAddress?: string;
  replierEmailAddresses?: string[];
  /**
   * Override for the Resend API base URL, passed to the editor client (a
   * separate fetch client). The Resend SDK reads RESEND_BASE_URL from the
   * environment on its own. Undefined keeps the production default.
   */
  apiUrl?: string;
  /** Override for the dashboard origin used by editor/TipTap tooling. */
  dashboardUrl?: string;
}
