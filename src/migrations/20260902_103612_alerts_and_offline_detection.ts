import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_alert_rules_rule_type" AS ENUM('metric-threshold', 'device-offline');
  CREATE TYPE "public"."enum_alert_rules_metric" AS ENUM('temperature', 'humidity', 'pressure', 'rainfall', 'windSpeed', 'battery', 'latencyMs');
  CREATE TYPE "public"."enum_alert_rules_condition" AS ENUM('above', 'below', 'outside-range');
  CREATE TYPE "public"."enum_alert_rules_scope" AS ENUM('all-devices', 'selected-locations', 'selected-devices');
  CREATE TYPE "public"."enum_alerts_type" AS ENUM('metric-threshold', 'device-offline');
  CREATE TYPE "public"."enum_alerts_metric" AS ENUM('temperature', 'humidity', 'pressure', 'rainfall', 'windSpeed', 'battery', 'latencyMs');
  CREATE TYPE "public"."enum_alerts_severity" AS ENUM('warning', 'critical');
  CREATE TYPE "public"."enum_alerts_status" AS ENUM('active', 'acknowledged', 'resolved');
  CREATE TYPE "public"."enum_system_events_event_type" AS ENUM('alert-created', 'alert-escalated', 'alert-acknowledged', 'alert-resolved', 'device-offline', 'device-recovered', 'rule-created', 'rule-updated', 'rule-disabled', 'service-account-used', 'ingestion-rejected');
  CREATE TYPE "public"."enum_system_events_severity" AS ENUM('info', 'warning', 'critical');
  CREATE TYPE "public"."enum_system_events_source" AS ENUM('telemetry-ingestion', 'alert-engine', 'offline-worker', 'payload-admin', 'authentication');
  CREATE TABLE "alert_rules" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"description" varchar,
  	"enabled" boolean DEFAULT true NOT NULL,
  	"rule_type" "enum_alert_rules_rule_type" NOT NULL,
  	"metric" "enum_alert_rules_metric",
  	"condition" "enum_alert_rules_condition",
  	"warning_value" numeric,
  	"critical_value" numeric,
  	"warning_minimum" numeric,
  	"warning_maximum" numeric,
  	"critical_minimum" numeric,
  	"critical_maximum" numeric,
  	"offline_multiplier" numeric DEFAULT 3,
  	"minimum_offline_seconds" numeric DEFAULT 30,
  	"cooldown_seconds" numeric DEFAULT 300 NOT NULL,
  	"auto_resolve" boolean DEFAULT true NOT NULL,
  	"scope" "enum_alert_rules_scope" DEFAULT 'all-devices' NOT NULL,
  	"message_template" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "alert_rules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"locations_id" integer,
  	"devices_id" integer
  );
  
  CREATE TABLE "alerts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"device_id" integer NOT NULL,
  	"rule_id" integer NOT NULL,
  	"reading_id" integer,
  	"type" "enum_alerts_type" NOT NULL,
  	"metric" "enum_alerts_metric",
  	"severity" "enum_alerts_severity" NOT NULL,
  	"status" "enum_alerts_status" DEFAULT 'active' NOT NULL,
  	"message" varchar NOT NULL,
  	"measured_value" numeric,
  	"threshold_snapshot" jsonb NOT NULL,
  	"occurrence_count" numeric DEFAULT 1 NOT NULL,
  	"first_triggered_at" timestamp(3) with time zone NOT NULL,
  	"last_triggered_at" timestamp(3) with time zone NOT NULL,
  	"acknowledged_at" timestamp(3) with time zone,
  	"acknowledged_by_id" integer,
  	"resolved_at" timestamp(3) with time zone,
  	"resolved_by_id" integer,
  	"resolution_reason" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "system_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_type" "enum_system_events_event_type" NOT NULL,
  	"severity" "enum_system_events_severity" NOT NULL,
  	"source" "enum_system_events_source" NOT NULL,
  	"device_id" integer,
  	"alert_id" integer,
  	"rule_id" integer,
  	"user_id" integer,
  	"service_account_id" integer,
  	"message" varchar NOT NULL,
  	"metadata" jsonb,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "alert_rules_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "alerts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "system_events_id" integer;
  ALTER TABLE "alert_rules_rels" ADD CONSTRAINT "alert_rules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "alert_rules_rels" ADD CONSTRAINT "alert_rules_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "alert_rules_rels" ADD CONSTRAINT "alert_rules_rels_devices_fk" FOREIGN KEY ("devices_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_reading_id_weather_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."weather_readings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_users_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "system_events" ADD CONSTRAINT "system_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "system_events" ADD CONSTRAINT "system_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "system_events" ADD CONSTRAINT "system_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "system_events" ADD CONSTRAINT "system_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "system_events" ADD CONSTRAINT "system_events_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "alert_rules_code_idx" ON "alert_rules" USING btree ("code");
  CREATE INDEX "alert_rules_updated_at_idx" ON "alert_rules" USING btree ("updated_at");
  CREATE INDEX "alert_rules_created_at_idx" ON "alert_rules" USING btree ("created_at");
  CREATE INDEX "alert_rules_rels_order_idx" ON "alert_rules_rels" USING btree ("order");
  CREATE INDEX "alert_rules_rels_parent_idx" ON "alert_rules_rels" USING btree ("parent_id");
  CREATE INDEX "alert_rules_rels_path_idx" ON "alert_rules_rels" USING btree ("path");
  CREATE INDEX "alert_rules_rels_locations_id_idx" ON "alert_rules_rels" USING btree ("locations_id");
  CREATE INDEX "alert_rules_rels_devices_id_idx" ON "alert_rules_rels" USING btree ("devices_id");
  CREATE INDEX "alerts_device_idx" ON "alerts" USING btree ("device_id");
  CREATE INDEX "alerts_rule_idx" ON "alerts" USING btree ("rule_id");
  CREATE INDEX "alerts_reading_idx" ON "alerts" USING btree ("reading_id");
  CREATE INDEX "alerts_severity_idx" ON "alerts" USING btree ("severity");
  CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");
  CREATE INDEX "alerts_first_triggered_at_idx" ON "alerts" USING btree ("first_triggered_at");
  CREATE INDEX "alerts_last_triggered_at_idx" ON "alerts" USING btree ("last_triggered_at");
  CREATE INDEX "alerts_acknowledged_by_idx" ON "alerts" USING btree ("acknowledged_by_id");
  CREATE INDEX "alerts_resolved_by_idx" ON "alerts" USING btree ("resolved_by_id");
  CREATE INDEX "alerts_updated_at_idx" ON "alerts" USING btree ("updated_at");
  CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");
  CREATE INDEX "status_severity_idx" ON "alerts" USING btree ("status","severity");
  CREATE INDEX "device_rule_idx" ON "alerts" USING btree ("device_id","rule_id");
  -- The engine's find-then-create is only an optimization. This partial unique
  -- index is the race-safe guarantee that one device/rule has one unresolved alert.
  CREATE UNIQUE INDEX "alerts_one_unresolved_per_device_rule_idx" ON "alerts" USING btree ("device_id", "rule_id") WHERE "status" IN ('active', 'acknowledged');
  CREATE INDEX "lastTriggeredAt_idx" ON "alerts" USING btree ("last_triggered_at");
  CREATE INDEX "system_events_event_type_idx" ON "system_events" USING btree ("event_type");
  CREATE INDEX "system_events_severity_idx" ON "system_events" USING btree ("severity");
  CREATE INDEX "system_events_device_idx" ON "system_events" USING btree ("device_id");
  CREATE INDEX "system_events_alert_idx" ON "system_events" USING btree ("alert_id");
  CREATE INDEX "system_events_rule_idx" ON "system_events" USING btree ("rule_id");
  CREATE INDEX "system_events_user_idx" ON "system_events" USING btree ("user_id");
  CREATE INDEX "system_events_service_account_idx" ON "system_events" USING btree ("service_account_id");
  CREATE INDEX "system_events_occurred_at_idx" ON "system_events" USING btree ("occurred_at");
  CREATE INDEX "system_events_updated_at_idx" ON "system_events" USING btree ("updated_at");
  CREATE INDEX "system_events_created_at_idx" ON "system_events" USING btree ("created_at");
  CREATE INDEX "eventType_occurredAt_idx" ON "system_events" USING btree ("event_type","occurred_at");
  CREATE INDEX "severity_idx" ON "system_events" USING btree ("severity");
  CREATE INDEX "device_occurredAt_idx" ON "system_events" USING btree ("device_id","occurred_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_alert_rules_fk" FOREIGN KEY ("alert_rules_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_alerts_fk" FOREIGN KEY ("alerts_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_system_events_fk" FOREIGN KEY ("system_events_id") REFERENCES "public"."system_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_alert_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("alert_rules_id");
  CREATE INDEX "payload_locked_documents_rels_alerts_id_idx" ON "payload_locked_documents_rels" USING btree ("alerts_id");
  CREATE INDEX "payload_locked_documents_rels_system_events_id_idx" ON "payload_locked_documents_rels" USING btree ("system_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "alert_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "alert_rules_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "alerts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "system_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "alert_rules" CASCADE;
  DROP TABLE "alert_rules_rels" CASCADE;
  DROP TABLE "alerts" CASCADE;
  DROP TABLE "system_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_alert_rules_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_alerts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_system_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_alert_rules_id_idx";
  DROP INDEX "payload_locked_documents_rels_alerts_id_idx";
  DROP INDEX "payload_locked_documents_rels_system_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "alert_rules_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "alerts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "system_events_id";
  DROP TYPE "public"."enum_alert_rules_rule_type";
  DROP TYPE "public"."enum_alert_rules_metric";
  DROP TYPE "public"."enum_alert_rules_condition";
  DROP TYPE "public"."enum_alert_rules_scope";
  DROP TYPE "public"."enum_alerts_type";
  DROP TYPE "public"."enum_alerts_metric";
  DROP TYPE "public"."enum_alerts_severity";
  DROP TYPE "public"."enum_alerts_status";
  DROP TYPE "public"."enum_system_events_event_type";
  DROP TYPE "public"."enum_system_events_severity";
  DROP TYPE "public"."enum_system_events_source";`)
}
