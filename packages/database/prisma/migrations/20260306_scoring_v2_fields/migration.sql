-- Add Scoring v2 fields to ProductPerformance
ALTER TABLE "product_performance" ADD COLUMN "revenue_prev_30d" DECIMAL(12, 2);
ALTER TABLE "product_performance" ADD COLUMN "revenue_trend" DECIMAL(5, 4);
ALTER TABLE "product_performance" ADD COLUMN "units_trend" DECIMAL(5, 4);
ALTER TABLE "product_performance" ADD COLUMN "first_seen_at" TIMESTAMP(3);
ALTER TABLE "product_performance" ADD COLUMN "days_since_first_sale" INTEGER;
ALTER TABLE "product_performance" ADD COLUMN "revenue_share" DECIMAL(5, 4);
ALTER TABLE "product_performance" ADD COLUMN "top_cross_sell_products" JSONB;
ALTER TABLE "product_performance" ADD COLUMN "collections" JSONB;
ALTER TABLE "product_performance" ADD COLUMN "tags" JSONB;
ALTER TABLE "product_performance" ADD COLUMN "historical_roas" DECIMAL(8, 4);
ALTER TABLE "product_performance" ADD COLUMN "times_advertised" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "product_performance" ADD COLUMN "product_tier" TEXT;
