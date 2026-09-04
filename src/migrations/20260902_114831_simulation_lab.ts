import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_simulation_commands_command_type" AS ENUM('high-temperature', 'high-humidity', 'abnormal-pressure', 'low-battery', 'high-latency', 'pause-telemetry', 'duplicate-message', 'delayed-message', 'out-of-order-message', 'invalid-payload', 'disconnect-mqtt', 'reset-normal');
  CREATE TYPE "public"."enum_simulation_commands_status" AS ENUM('queued', 'published', 'acknowledged', 'running', 'completed', 'failed', 'expired', 'cancelled');
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-command-created';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-command-published';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-command-acknowledged';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-started';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-completed';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-failed';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-cancelled';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'simulation-expired';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'mqtt-device-disconnected';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'mqtt-device-reconnected';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'invalid-simulated-payload-rejected';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'duplicate-message-ignored';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'gateway-buffered-message';
  ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'gateway-buffer-flushed';
  CREATE TABLE "simulation_commands" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"command_id" varchar NOT NULL,
  	"device_id" integer NOT NULL,
  	"command_type" "enum_simulation_commands_command_type" NOT NULL,
  	"status" "enum_simulation_commands_status" DEFAULT 'queued' NOT NULL,
  	"parameters" jsonb NOT NULL,
  	"duration_seconds" numeric,
  	"issued_by_id" integer NOT NULL,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"acknowledged_at" timestamp(3) with time zone,
  	"started_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"result" jsonb,
  	"failure_reason" varchar,
  	"alert_observed_at" timestamp(3) with time zone,
  	"recovery_observed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "simulation_commands_id" integer;
  ALTER TABLE "simulation_commands" ADD CONSTRAINT "simulation_commands_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "simulation_commands" ADD CONSTRAINT "simulation_commands_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "simulation_commands_command_id_idx" ON "simulation_commands" USING btree ("command_id");
  CREATE INDEX "simulation_commands_device_idx" ON "simulation_commands" USING btree ("device_id");
  CREATE INDEX "simulation_commands_status_idx" ON "simulation_commands" USING btree ("status");
  CREATE INDEX "simulation_commands_issued_by_idx" ON "simulation_commands" USING btree ("issued_by_id");
  CREATE INDEX "simulation_commands_issued_at_idx" ON "simulation_commands" USING btree ("issued_at");
  CREATE INDEX "simulation_commands_updated_at_idx" ON "simulation_commands" USING btree ("updated_at");
  CREATE INDEX "simulation_commands_created_at_idx" ON "simulation_commands" USING btree ("created_at");
  CREATE INDEX "device_status_idx" ON "simulation_commands" USING btree ("device_id","status");
  CREATE INDEX "issuedAt_idx" ON "simulation_commands" USING btree ("issued_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_simulation_commands_fk" FOREIGN KEY ("simulation_commands_id") REFERENCES "public"."simulation_commands"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_simulation_commands_id_idx" ON "payload_locked_documents_rels" USING btree ("simulation_commands_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "simulation_commands" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "simulation_commands" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_simulation_commands_fk";
  
  ALTER TABLE "system_events" ALTER COLUMN "event_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_system_events_event_type";
  CREATE TYPE "public"."enum_system_events_event_type" AS ENUM('alert-created', 'alert-escalated', 'alert-acknowledged', 'alert-resolved', 'device-offline', 'device-recovered', 'rule-created', 'rule-updated', 'rule-disabled', 'service-account-used', 'ingestion-rejected');
  ALTER TABLE "system_events" ALTER COLUMN "event_type" SET DATA TYPE "public"."enum_system_events_event_type" USING "event_type"::"public"."enum_system_events_event_type";
  DROP INDEX "payload_locked_documents_rels_simulation_commands_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "simulation_commands_id";
  DROP TYPE "public"."enum_simulation_commands_command_type";
  DROP TYPE "public"."enum_simulation_commands_status";`)
}
