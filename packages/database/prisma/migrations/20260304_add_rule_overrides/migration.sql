-- AlterTable: add rule_overrides to autopilot_configs
ALTER TABLE "autopilot_configs" ADD COLUMN "rule_overrides" JSONB;
