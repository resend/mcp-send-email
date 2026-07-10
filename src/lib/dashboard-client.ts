const DEFAULT_DASHBOARD_URL = 'https://resend.com';

export class DashboardClient {
  private dashboardUrl: string;

  constructor(options?: { dashboardUrl?: string }) {
    // Defaults from RESEND_DASHBOARD_URL so editor/TipTap tooling can follow a
    // non-production dashboard when set.
    this.dashboardUrl =
      options?.dashboardUrl ||
      process.env.RESEND_DASHBOARD_URL ||
      DEFAULT_DASHBOARD_URL;
  }

  async getTiptapSchema() {
    const url = `${this.dashboardUrl}/api/agent/prompt`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch TipTap schema (${response.status}): ${response.statusText}`,
      );
    }

    const json = await response.json();
    if (!json.data || !json.version) {
      throw new Error('Invalid response format from dashboard API');
    }

    return json as { data: string; version: string };
  }
}
