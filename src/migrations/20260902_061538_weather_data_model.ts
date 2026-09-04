import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_devices_status" AS ENUM('online', 'offline', 'degraded', 'maintenance');
  CREATE TYPE "public"."enum_weather_readings_validation_status" AS ENUM('valid', 'invalid', 'stale', 'duplicate');
  CREATE TABLE "locations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"city" varchar NOT NULL,
  	"state_or_region" varchar,
  	"country" varchar NOT NULL,
  	"latitude" numeric NOT NULL,
  	"longitude" numeric NOT NULL,
  	"timezone" varchar NOT NULL,
  	"active" boolean DEFAULT true,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "devices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"device_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"location_id" integer NOT NULL,
  	"status" "enum_devices_status" DEFAULT 'offline' NOT NULL,
  	"simulation_enabled" boolean DEFAULT true,
  	"publishing_interval_seconds" numeric DEFAULT 10 NOT NULL,
  	"last_seen" timestamp(3) with time zone,
  	"firmware_version" varchar,
  	"description" varchar,
  	"latest_metrics_temperature" numeric,
  	"latest_metrics_humidity" numeric,
  	"latest_metrics_pressure" numeric,
  	"latest_metrics_rainfall" numeric,
  	"latest_metrics_wind_speed" numeric,
  	"latest_metrics_battery" numeric,
  	"latest_metrics_recorded_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "weather_readings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"device_id" integer NOT NULL,
  	"sequence_number" numeric NOT NULL,
  	"temperature" numeric NOT NULL,
  	"humidity" numeric NOT NULL,
  	"pressure" numeric NOT NULL,
  	"rainfall" numeric NOT NULL,
  	"wind_speed" numeric NOT NULL,
  	"battery" numeric NOT NULL,
  	"device_timestamp" timestamp(3) with time zone NOT NULL,
  	"gateway_timestamp" timestamp(3) with time zone NOT NULL,
  	"server_timestamp" timestamp(3) with time zone NOT NULL,
  	"latency_ms" numeric NOT NULL,
  	"validation_status" "enum_weather_readings_validation_status" DEFAULT 'valid' NOT NULL,
  	"raw_payload" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "locations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "devices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "weather_readings_id" integer;
  ALTER TABLE "devices" ADD CONSTRAINT "devices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "weather_readings" ADD CONSTRAINT "weather_readings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "locations_code_idx" ON "locations" USING btree ("code");
  CREATE INDEX "locations_city_idx" ON "locations" USING btree ("city");
  CREATE INDEX "locations_country_idx" ON "locations" USING btree ("country");
  CREATE INDEX "locations_active_idx" ON "locations" USING btree ("active");
  CREATE INDEX "locations_updated_at_idx" ON "locations" USING btree ("updated_at");
  CREATE INDEX "locations_created_at_idx" ON "locations" USING btree ("created_at");
  CREATE UNIQUE INDEX "devices_device_id_idx" ON "devices" USING btree ("device_id");
  CREATE INDEX "devices_location_idx" ON "devices" USING btree ("location_id");
  CREATE INDEX "devices_status_idx" ON "devices" USING btree ("status");
  CREATE INDEX "devices_updated_at_idx" ON "devices" USING btree ("updated_at");
  CREATE INDEX "devices_created_at_idx" ON "devices" USING btree ("created_at");
  CREATE INDEX "weather_readings_device_idx" ON "weather_readings" USING btree ("device_id");
  CREATE INDEX "weather_readings_server_timestamp_idx" ON "weather_readings" USING btree ("server_timestamp");
  CREATE INDEX "weather_readings_validation_status_idx" ON "weather_readings" USING btree ("validation_status");
  CREATE INDEX "weather_readings_updated_at_idx" ON "weather_readings" USING btree ("updated_at");
  CREATE INDEX "weather_readings_created_at_idx" ON "weather_readings" USING btree ("created_at");
  CREATE INDEX "device_serverTimestamp_idx" ON "weather_readings" USING btree ("device_id","server_timestamp");
  CREATE INDEX "serverTimestamp_idx" ON "weather_readings" USING btree ("server_timestamp");
  CREATE INDEX "validationStatus_idx" ON "weather_readings" USING btree ("validation_status");
  CREATE UNIQUE INDEX "device_sequenceNumber_idx" ON "weather_readings" USING btree ("device_id","sequence_number");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_devices_fk" FOREIGN KEY ("devices_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_weather_readings_fk" FOREIGN KEY ("weather_readings_id") REFERENCES "public"."weather_readings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");
  CREATE INDEX "payload_locked_documents_rels_devices_id_idx" ON "payload_locked_documents_rels" USING btree ("devices_id");
  CREATE INDEX "payload_locked_documents_rels_weather_readings_id_idx" ON "payload_locked_documents_rels" USING btree ("weather_readings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "locations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "devices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "weather_readings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "locations" CASCADE;
  DROP TABLE "devices" CASCADE;
  DROP TABLE "weather_readings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_locations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_devices_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_weather_readings_fk";
  
  DROP INDEX "payload_locked_documents_rels_locations_id_idx";
  DROP INDEX "payload_locked_documents_rels_devices_id_idx";
  DROP INDEX "payload_locked_documents_rels_weather_readings_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "locations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "devices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "weather_readings_id";
  DROP TYPE "public"."enum_devices_status";
  DROP TYPE "public"."enum_weather_readings_validation_status";`)
}
