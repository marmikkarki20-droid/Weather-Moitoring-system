import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_system_events_event_type" ADD VALUE 'report-exported';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_events" ALTER COLUMN "event_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_system_events_event_type";
  CREATE TYPE "public"."enum_system_events_event_type" AS ENUM('alert-created', 'alert-escalated', 'alert-acknowledged', 'alert-resolved', 'device-offline', 'device-recovered', 'rule-created', 'rule-updated', 'rule-disabled', 'service-account-used', 'ingestion-rejected', 'simulation-command-created', 'simulation-command-published', 'simulation-command-acknowledged', 'simulation-started', 'simulation-completed', 'simulation-failed', 'simulation-cancelled', 'simulation-expired', 'mqtt-device-disconnected', 'mqtt-device-reconnected', 'invalid-simulated-payload-rejected', 'duplicate-message-ignored', 'gateway-buffered-message', 'gateway-buffer-flushed');
  ALTER TABLE "system_events" ALTER COLUMN "event_type" SET DATA TYPE "public"."enum_system_events_event_type" USING "event_type"::"public"."enum_system_events_event_type";`)
}
