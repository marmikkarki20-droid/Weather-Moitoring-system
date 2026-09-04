import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_notification_preferences_minimum_severity" AS ENUM('warning', 'critical');
  CREATE TYPE "public"."enum_notification_preferences_weekly_digest_day" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  CREATE TYPE "public"."enum_notification_outbox_notification_type" AS ENUM('alert-created', 'alert-escalated', 'alert-resolved', 'device-offline', 'device-recovered', 'daily-digest', 'weekly-digest');
  CREATE TYPE "public"."enum_notification_outbox_status" AS ENUM('pending', 'processing', 'sent', 'retry', 'failed', 'cancelled');
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'notification-queued';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'notification-sent';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'notification-retry-scheduled';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'notification-failed';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'notification-cancelled';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'daily-digest-generated';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'weekly-digest-generated';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'notification-preferences-updated';
  CREATE TABLE "notification_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"email_enabled" boolean DEFAULT false NOT NULL,
  	"minimum_severity" "enum_notification_preferences_minimum_severity" DEFAULT 'warning' NOT NULL,
  	"alert_created" boolean DEFAULT true NOT NULL,
  	"alert_escalated" boolean DEFAULT true NOT NULL,
  	"alert_resolved" boolean DEFAULT true NOT NULL,
  	"device_offline" boolean DEFAULT true NOT NULL,
  	"device_recovered" boolean DEFAULT true NOT NULL,
  	"all_devices" boolean DEFAULT true NOT NULL,
  	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
  	"quiet_hours_start" varchar,
  	"quiet_hours_end" varchar,
  	"timezone" varchar DEFAULT 'UTC' NOT NULL,
  	"daily_digest_enabled" boolean DEFAULT false NOT NULL,
  	"daily_digest_time" varchar,
  	"weekly_digest_enabled" boolean DEFAULT false NOT NULL,
  	"weekly_digest_day" "enum_notification_preferences_weekly_digest_day",
  	"weekly_digest_time" varchar,
  	"include_p_d_f_report" boolean DEFAULT false NOT NULL,
  	"last_daily_digest_at" timestamp(3) with time zone,
  	"last_weekly_digest_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"locations_id" integer,
  	"devices_id" integer
  );
  
  CREATE TABLE "notification_outbox" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"notification_type" "enum_notification_outbox_notification_type" NOT NULL,
  	"recipient_user_id" integer NOT NULL,
  	"recipient_email" varchar NOT NULL,
  	"alert_id" integer,
  	"device_id" integer,
  	"status" "enum_notification_outbox_status" DEFAULT 'pending' NOT NULL,
  	"subject" varchar NOT NULL,
  	"template_data" jsonb NOT NULL,
  	"attempt_count" numeric DEFAULT 0 NOT NULL,
  	"next_attempt_at" timestamp(3) with time zone NOT NULL,
  	"locked_at" timestamp(3) with time zone,
  	"locked_by" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"provider_message_id" varchar,
  	"last_error_category" varchar,
  	"last_error_message" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_preferences_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_outbox_id" integer;
  ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_preferences_rels" ADD CONSTRAINT "notification_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notification_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notification_preferences_rels" ADD CONSTRAINT "notification_preferences_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notification_preferences_rels" ADD CONSTRAINT "notification_preferences_rels_devices_fk" FOREIGN KEY ("devices_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");
  CREATE INDEX "notification_preferences_updated_at_idx" ON "notification_preferences" USING btree ("updated_at");
  CREATE INDEX "notification_preferences_created_at_idx" ON "notification_preferences" USING btree ("created_at");
  CREATE INDEX "notification_preferences_rels_order_idx" ON "notification_preferences_rels" USING btree ("order");
  CREATE INDEX "notification_preferences_rels_parent_idx" ON "notification_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "notification_preferences_rels_path_idx" ON "notification_preferences_rels" USING btree ("path");
  CREATE INDEX "notification_preferences_rels_locations_id_idx" ON "notification_preferences_rels" USING btree ("locations_id");
  CREATE INDEX "notification_preferences_rels_devices_id_idx" ON "notification_preferences_rels" USING btree ("devices_id");
  CREATE UNIQUE INDEX "notification_outbox_idempotency_key_idx" ON "notification_outbox" USING btree ("idempotency_key");
  CREATE INDEX "notification_outbox_notification_type_idx" ON "notification_outbox" USING btree ("notification_type");
  CREATE INDEX "notification_outbox_recipient_user_idx" ON "notification_outbox" USING btree ("recipient_user_id");
  CREATE INDEX "notification_outbox_alert_idx" ON "notification_outbox" USING btree ("alert_id");
  CREATE INDEX "notification_outbox_device_idx" ON "notification_outbox" USING btree ("device_id");
  CREATE INDEX "notification_outbox_status_idx" ON "notification_outbox" USING btree ("status");
  CREATE INDEX "notification_outbox_next_attempt_at_idx" ON "notification_outbox" USING btree ("next_attempt_at");
  CREATE INDEX "notification_outbox_updated_at_idx" ON "notification_outbox" USING btree ("updated_at");
  CREATE INDEX "notification_outbox_created_at_idx" ON "notification_outbox" USING btree ("created_at");
  CREATE INDEX "status_nextAttemptAt_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");
  CREATE INDEX "recipientUser_notificationType_idx" ON "notification_outbox" USING btree ("recipient_user_id","notification_type");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_preferences_fk" FOREIGN KEY ("notification_preferences_id") REFERENCES "public"."notification_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_outbox_fk" FOREIGN KEY ("notification_outbox_id") REFERENCES "public"."notification_outbox"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_notification_preferences_i_idx" ON "payload_locked_documents_rels" USING btree ("notification_preferences_id");
  CREATE INDEX "payload_locked_documents_rels_notification_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("notification_outbox_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notification_preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_preferences_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_outbox" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "notification_preferences" CASCADE;
  DROP TABLE "notification_preferences_rels" CASCADE;
  DROP TABLE "notification_outbox" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_outbox_fk";
  
  ALTER TABLE "system_events" ALTER COLUMN "event_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_system_events_event_type";
  CREATE TYPE "public"."enum_system_events_event_type" AS ENUM('alert-created', 'alert-escalated', 'alert-acknowledged', 'alert-resolved', 'device-offline', 'device-recovered', 'rule-created', 'rule-updated', 'rule-disabled', 'service-account-used', 'ingestion-rejected', 'simulation-command-created', 'simulation-command-published', 'simulation-command-acknowledged', 'simulation-started', 'simulation-completed', 'simulation-failed', 'simulation-cancelled', 'simulation-expired', 'mqtt-device-disconnected', 'mqtt-device-reconnected', 'invalid-simulated-payload-rejected', 'duplicate-message-ignored', 'gateway-buffered-message', 'gateway-buffer-flushed', 'report-exported');
  ALTER TABLE "system_events" ALTER COLUMN "event_type" SET DATA TYPE "public"."enum_system_events_event_type" USING "event_type"::"public"."enum_system_events_event_type";
  DROP INDEX "payload_locked_documents_rels_notification_preferences_i_idx";
  DROP INDEX "payload_locked_documents_rels_notification_outbox_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_outbox_id";
  DROP TYPE "public"."enum_notification_preferences_minimum_severity";
  DROP TYPE "public"."enum_notification_preferences_weekly_digest_day";
  DROP TYPE "public"."enum_notification_outbox_notification_type";
  DROP TYPE "public"."enum_notification_outbox_status";`)
}
