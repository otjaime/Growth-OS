-- CreateEnum
CREATE TYPE "CampaignStrategyType" AS ENUM ('HERO_PRODUCT', 'CATEGORY', 'SEASONAL', 'NEW_ARRIVAL', 'CROSS_SELL');
CREATE TYPE "CampaignStrategyStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "campaign_strategies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignStrategyType" NOT NULL,
    "status" "CampaignStrategyStatus" NOT NULL DEFAULT 'SUGGESTED',
    "product_titles" JSONB NOT NULL,
    "product_count" INTEGER NOT NULL,
    "daily_budget" DECIMAL(12,2),
    "total_budget" DECIMAL(12,2),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "target_audience" TEXT,
    "creative_direction" TEXT,
    "estimated_roas" DECIMAL(8,4),
    "rationale" TEXT,
    "meta_campaign_id" TEXT,
    "meta_ad_set_ids" JSONB,
    "actual_spend" DECIMAL(12,2) DEFAULT 0,
    "actual_revenue" DECIMAL(12,2) DEFAULT 0,
    "actual_roas" DECIMAL(8,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_strategies_organization_id_idx" ON "campaign_strategies"("organization_id");
CREATE INDEX "campaign_strategies_status_idx" ON "campaign_strategies"("status");

-- AddForeignKey
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
