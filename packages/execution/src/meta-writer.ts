import pino from 'pino';

const logger = pino({ name: 'meta-writer' });

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface CampaignMetrics {
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cvr: number;
  impressions: number;
  clicks: number;
  conversions: number;
  daysRunning: number;
}

interface MetaApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

export class MetaAdExecutor {
  constructor(
    private readonly accessToken: string,
    private readonly adAccountId: string,
  ) {}

  async pauseCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info({ campaignId, action: 'pause' }, 'Pausing Meta campaign');

      const url = `${META_BASE_URL}/${campaignId}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: this.accessToken,
          status: 'PAUSED',
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as MetaApiError;
        const errorMsg = body.error?.message ?? `HTTP ${response.status}`;
        logger.error({ campaignId, error: errorMsg }, 'Failed to pause campaign');
        return { success: false, error: errorMsg };
      }

      logger.info({ campaignId }, 'Campaign paused successfully');
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ campaignId, error: errorMsg }, 'Exception pausing campaign');
      return { success: false, error: errorMsg };
    }
  }

  async scaleBudget(
    campaignId: string,
    newDailyBudgetUSD: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const dailyBudgetCents = Math.round(newDailyBudgetUSD * 100);
      logger.info(
        { campaignId, newDailyBudgetUSD, dailyBudgetCents, action: 'scale' },
        'Scaling Meta campaign budget',
      );

      const url = `${META_BASE_URL}/${campaignId}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: this.accessToken,
          daily_budget: String(dailyBudgetCents),
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as MetaApiError;
        const errorMsg = body.error?.message ?? `HTTP ${response.status}`;
        logger.error({ campaignId, error: errorMsg }, 'Failed to scale budget');
        return { success: false, error: errorMsg };
      }

      logger.info({ campaignId, newDailyBudgetUSD }, 'Budget scaled successfully');
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ campaignId, error: errorMsg }, 'Exception scaling budget');
      return { success: false, error: errorMsg };
    }
  }

  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
    try {
      const url = `${META_BASE_URL}/${campaignId}/insights`;
      const params = new URLSearchParams({
        access_token: this.accessToken,
        fields: 'spend,impressions,clicks,actions,action_values',
        date_preset: 'maximum',
      });

      const response = await fetch(`${url}?${params.toString()}`);

      if (!response.ok) {
        const body = (await response.json()) as MetaApiError;
        const errorMsg = body.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`Meta API error: ${errorMsg}`);
      }

      const body = (await response.json()) as MetaInsightsResponse;
      const data = body.data?.[0];

      if (!data) {
        return {
          spend: 0,
          revenue: 0,
          roas: 0,
          ctr: 0,
          cvr: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          daysRunning: 0,
        };
      }

      const spend = parseFloat(data.spend ?? '0');
      const impressions = parseInt(data.impressions ?? '0', 10);
      const clicks = parseInt(data.clicks ?? '0', 10);

      const conversions = extractActionValue(data.actions, 'offsite_conversion.fb_pixel_purchase');
      const revenue = extractActionValue(data.action_values, 'offsite_conversion.fb_pixel_purchase');

      const roas = spend > 0 ? revenue / spend : 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const cvr = clicks > 0 ? conversions / clicks : 0;

      // Calculate days running from campaign creation
      const daysRunning = await this.getCampaignDaysRunning(campaignId);

      return { spend, revenue, roas, ctr, cvr, impressions, clicks, conversions, daysRunning };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ campaignId, error: errorMsg }, 'Exception fetching campaign metrics');
      throw err;
    }
  }

  private async getCampaignDaysRunning(campaignId: string): Promise<number> {
    try {
      const url = `${META_BASE_URL}/${campaignId}`;
      const params = new URLSearchParams({
        access_token: this.accessToken,
        fields: 'created_time',
      });

      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) return 0;

      const body = (await response.json()) as { created_time?: string };
      if (!body.created_time) return 0;

      const created = new Date(body.created_time);
      const now = new Date();
      return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  }
}

// ── Meta API Response Types ─────────────────────────────────

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightData {
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: readonly MetaAction[];
  action_values?: readonly MetaAction[];
}

interface MetaInsightsResponse {
  data?: readonly MetaInsightData[];
}

// ── Helpers ─────────────────────────────────────────────────

function extractActionValue(
  actions: readonly MetaAction[] | undefined,
  actionType: string,
): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === actionType);
  return action ? parseFloat(action.value) : 0;
}
