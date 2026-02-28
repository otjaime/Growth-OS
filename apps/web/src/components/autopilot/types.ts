// ──────────────────────────────────────────────────────────────
// Growth OS — Autopilot Types
// Shared types for the autopilot diagnosis inbox UI
// ──────────────────────────────────────────────────────────────

export type DiagnosisSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type DiagnosisStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'DISMISSED' | 'EXPIRED';
export type DiagnosisAction =
  | 'GENERATE_COPY_VARIANTS'
  | 'PAUSE_AD'
  | 'REACTIVATE_AD'
  | 'INCREASE_BUDGET'
  | 'DECREASE_BUDGET'
  | 'REFRESH_CREATIVE'
  | 'NONE';

export type AutopilotTab = 'diagnoses' | 'ads' | 'history';

export interface DiagnosisAd {
  id: string;
  adId: string;
  name: string;
  status: string;
  creativeType: string;
  spend7d: number;
  roas7d: number | null;
  ctr7d: number | null;
  frequency7d: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  campaign: { id: string; name: string };
  adSet: { id: string; name: string; dailyBudget: number | null };
}

export interface Diagnosis {
  id: string;
  ruleId: string;
  severity: DiagnosisSeverity;
  title: string;
  message: string;
  actionType: DiagnosisAction;
  status: DiagnosisStatus;
  suggestedValue: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  ad: DiagnosisAd;
}

export interface DiagnosisStats {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

export interface AdVariant {
  id: string;
  diagnosisId: string;
  adId: string;
  angle: 'benefit' | 'pain_point' | 'urgency';
  headline: string;
  primaryText: string;
  description: string | null;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  createdAt: string;
}

export interface AutopilotStats {
  accounts: number;
  campaigns: number;
  adSets: number;
  totalAds: number;
  activeAds: number;
  metrics7d: {
    totalSpend: number;
    totalRevenue: number;
    totalConversions: number;
    blendedRoas: number | null;
    blendedCtr: number | null;
  };
  lastSyncAt: string | null;
}

// ── AI Insight types ──────────────────────────────────────────

export interface InsightRecommendation {
  action: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DiagnosisInsight {
  rootCause: string;
  adRecommendation: InsightRecommendation;
  adSetRecommendation: InsightRecommendation;
  campaignRecommendation: InsightRecommendation;
  estimatedImpact: string;
}

// ── New types for Ads table + History tab ─────────────────────

export interface MetaAdWithTrends {
  id: string;
  adId: string;
  name: string;
  status: string;
  creativeType: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  spend7d: number;
  revenue7d: number;
  impressions7d: number;
  clicks7d: number;
  conversions7d: number;
  roas7d: number | null;
  ctr7d: number | null;
  cpc7d: number | null;
  frequency7d: number | null;
  campaign: { id: string; name: string };
  adSet: { id: string; name: string; dailyBudget: number | null };
  trends: {
    spendChange: number | null;
    roasChange: number | null;
    ctrChange: number | null;
    frequencyChange: number | null;
  };
}

export interface HistoryVariant {
  id: string;
  angle: string;
  headline: string;
  status: string;
}

export interface HistoryItem {
  id: string;
  ruleId: string;
  severity: DiagnosisSeverity;
  title: string;
  message: string;
  actionType: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  ad: {
    id: string;
    adId: string;
    name: string;
    status: string;
    spend7d: number;
    roas7d: number | null;
    ctr7d: number | null;
    thumbnailUrl?: string | null;
    campaign: { id: string; name: string };
  };
  variants: HistoryVariant[];
}
