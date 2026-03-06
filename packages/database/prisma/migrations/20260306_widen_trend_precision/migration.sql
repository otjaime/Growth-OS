-- Widen trend decimal precision to handle extreme growth percentages
ALTER TABLE "product_performance" ALTER COLUMN "revenue_trend" TYPE DECIMAL(8,4);
ALTER TABLE "product_performance" ALTER COLUMN "units_trend" TYPE DECIMAL(8,4);
