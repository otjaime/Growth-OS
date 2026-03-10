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
  | 'DUPLICATE_AD_SET'
  | 'NONE';

export type AutopilotTab = 'overview' | 'actions' | 'ads' | 'products' | 'campaigns';

// ── Proactive product types ─────────────────────────────────

export type ProactiveAdStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'READY'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'TESTING'
  | 'WINNER'
  | 'PAUSED'
  | 'FAILED';

export interface ProductPerformanceRow {
  id: string;
  productTitle: string;
  productType: string;
  unitsSold30d: number;
  revenue30d: number;
  orderCount30d: number;
  avgPrice: number;
  estimatedMargin: number;
  grossProfit30d: number;
  avgDailyUnits: number;
  repeatBuyerPct: number;
  adFitnessScore: number | null;
  shopifyProductId: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  description: string | null;
  // Scoring v2 fields
  revenuePrev30d: number | null;
  revenueTrend: number | null;
  unitsTrend: number | null;
  firstSeenAt: string | null;
  daysSinceFirstSale: number | null;
  revenueShare: number | null;
  topCrossSellProducts: Array<{ title: string; coOccurrence: number }> | null;
  collections: string[] | null;
  tags: string[] | null;
  historicalRoas: number | null;
  timesAdvertised: number;
  productTier: string | null;
  lastComputedAt: string;
}

export interface ProactiveRecommendation {
  productTitle: string;
  productType: string;
  adFitnessScore: number;
  reason: string;
  estimatedRoas: number;
  metrics: {
    revenue30d: number;
    grossProfit30d: number;
    avgDailyUnits: number;
    repeatBuyerPct: number;
    estimatedMargin: number;
    avgPrice: number;
    hasImage: boolean;
    hasDescription: boolean;
  };
}

export interface VariantPerformance {
  variantId: string;
  angle: string;
  headline: string;
  spend: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number | null;
}

export interface ProactiveAdJob {
  id: string;
  productTitle: string;
  productType: string;
  productImageUrl: string | null;
  adFitnessScore: number;
  status: ProactiveAdStatus;
  copyVariants: Array<{
    angle: string;
    headline: string;
    primaryText: string;
    description: string | null;
  }> | null;
  imageUrl: string | null;
  testRoundNumber: number;
  testStartedAt: string | null;
  winnerId: string | null;
  dailyBudget: number | null;
  errorMessage: string | null;
  variantPerformance: readonly VariantPerformance[] | null;
  createdAt: string;
  updatedAt: string;
}

// ── Human-readable label types ───────────────────────────────

export interface HumanAction {
  readonly verb: string;
  readonly description: string;
  readonly buttonLabel: string;
  readonly activeLabel: string;
  readonly icon: string;
}

export type MetricKey = 'roas' | 'ctr' | 'cpc' | 'frequency' | 'spend' | 'conversions' | 'revenue';

export interface MetricExplanation {
  readonly label: string;
  readonly tooltip: string;
  readonly format: (v: number) => string;
}

// ── Autopilot v2 mode & config ──────────────────────────────

export type AutopilotMode = 'monitor' | 'suggest' | 'auto';

export interface AutopilotConfig {
  mode: AutopilotMode;
  targetRoas: number | null;
  maxCpa: number | null;
  dailyBudgetCap: number | null;
  maxBudgetIncreasePct: number;
  maxActionsPerDay: number;
  minSpendBeforeAction: number;
  minConfidence: number;
  slackWebhookUrl: string | null;
  notifyOnCritical: boolean;
  notifyOnAutoAction: boolean;
}

// ── Budget optimization ─────────────────────────────────────

export interface BudgetAllocation {
  adSetId: string;
  adSetName: string;
  currentDailyBudget: number;
  suggestedDailyBudget: number;
  changePct: number;
  reason: string;
}

export interface PortfolioOptimization {
  totalCurrentDailyBudget: number;
  totalSuggestedDailyBudget: number;
  currentBlendedRoas: number | null;
  projectedBlendedRoas: number | null;
  allocations: BudgetAllocation[];
  summary: string;
}

// ── Campaign health ─────────────────────────────────────────

export interface CampaignHealthScore {
  campaignId: string;
  campaignName: string;
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    roasScore: number;
    efficiencyScore: number;
    scaleScore: number;
    stabilityScore: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  topIssue: string | null;
}

// ── Action log ──────────────────────────────────────────────

export interface ActionLogItem {
  id: string;
  actionType: string;
  triggeredBy: string;
  targetEntity: string;
  targetId: string;
  targetName: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

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
  executionResult: Record<string, unknown> | null;
  confidence: number | null;
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
  angle: 'benefit' | 'pain_point' | 'urgency' | 'social_proof' | 'value';
  headline: string;
  primaryText: string;
  description: string | null;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'WINNER' | 'LOSER';
  metaAdId: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  revenue: number | null;
  createdAt: string;
}

export interface AutopilotStats {
  accounts: number;
  campaigns: number;
  adSets: number;
  totalAds: number;
  activeAds: number;
  currency: string;
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

// ── Campaign Strategy types ─────────────────────────────────

export type CampaignStrategyType = 'HERO_PRODUCT' | 'CATEGORY' | 'SEASONAL' | 'NEW_ARRIVAL' | 'CROSS_SELL' | 'BEST_SELLERS';
export type CampaignStrategyStatus = 'SUGGESTED' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'REJECTED';

export interface CampaignStrategy {
  id: string;
  name: string;
  type: CampaignStrategyType;
  status: CampaignStrategyStatus;
  productTitles: string[];
  productCount: number;
  dailyBudget: number | null;
  totalBudget: number | null;
  startDate: string | null;
  endDate: string | null;
  targetAudience: string | null;
  creativeDirection: string | null;
  estimatedRoas: number | null;
  rationale: string | null;
  actualSpend: number | null;
  actualRevenue: number | null;
  actualRoas: number | null;
  metaCampaignId: string | null;
  metaAdSetIds: string[] | null;
  metaAdAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonalEvent {
  id: string;
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  tags: string[];
  audienceHint: string;
  budgetMultiplier: number;
}

export interface WeeklyAnalysis {
  period: string;
  topPerformers: Array<{
    productTitle: string;
    revenue30d: number;
    revenueTrend: number | null;
    adFitnessScore: number;
    tier: string | null;
  }>;
  underperformers: Array<{
    productTitle: string;
    revenue30d: number;
    revenueTrend: number | null;
    reason: string;
  }>;
  campaignSummary: Array<{
    type: string;
    count: number;
    totalSpend: number;
    totalRevenue: number;
    avgRoas: number;
  }>;
  budgetEfficiency: {
    totalSpend: number;
    totalRevenue: number;
    overallRoas: number;
    bestType: string | null;
    worstType: string | null;
  };
  recommendations: string[];
}
