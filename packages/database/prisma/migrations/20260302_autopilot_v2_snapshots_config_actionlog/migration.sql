-- CreateTable
CREATE TABLE "meta_ad_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "roas" DECIMAL(8,4),
    "ctr" DECIMAL(8,6),
    "cpc" DECIMAL(12,2),
    "frequency" DECIMAL(8,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_ad_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autopilot_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'suggest',
    "target_roas" DECIMAL(8,4),
    "max_cpa" DECIMAL(12,2),
    "daily_budget_cap" DECIMAL(12,2),
    "max_budget_increase_pct" INTEGER NOT NULL DEFAULT 50,
    "min_spend_before_action" DECIMAL(12,2) NOT NULL DEFAULT 50,
    "slack_webhook_url" TEXT,
    "notify_on_critical" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_auto_action" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autopilot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autopilot_action_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "diagnosis_id" TEXT,
    "action_type" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "target_entity" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autopilot_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_ad_snapshots_ad_id_date_idx" ON "meta_ad_snapshots"("ad_id", "date");

-- CreateIndex
CREATE INDEX "meta_ad_snapshots_organization_id_date_idx" ON "meta_ad_snapshots"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_snapshots_organization_id_ad_id_date_key" ON "meta_ad_snapshots"("organization_id", "ad_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "autopilot_configs_organization_id_key" ON "autopilot_configs"("organization_id");

-- CreateIndex
CREATE INDEX "autopilot_action_logs_organization_id_created_at_idx" ON "autopilot_action_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "autopilot_action_logs_target_id_idx" ON "autopilot_action_logs"("target_id");

-- AddForeignKey
ALTER TABLE "meta_ad_snapshots" ADD CONSTRAINT "meta_ad_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ad_snapshots" ADD CONSTRAINT "meta_ad_snapshots_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "meta_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autopilot_configs" ADD CONSTRAINT "autopilot_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autopilot_action_logs" ADD CONSTRAINT "autopilot_action_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
