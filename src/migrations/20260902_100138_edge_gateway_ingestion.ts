import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_service_accounts_account_type" AS ENUM('edge-gateway');
  CREATE TABLE "service_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"account_type" "enum_service_accounts_account_type" DEFAULT 'edge-gateway' NOT NULL,
  	"active" boolean DEFAULT true NOT NULL,
  	"description" varchar,
  	"last_used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  ALTER TABLE "devices" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "service_accounts_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "service_accounts_id" integer;
  CREATE INDEX "service_accounts_updated_at_idx" ON "service_accounts" USING btree ("updated_at");
  CREATE INDEX "service_accounts_created_at_idx" ON "service_accounts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_accounts_fk" FOREIGN KEY ("service_accounts_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_service_accounts_fk" FOREIGN KEY ("service_accounts_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_service_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("service_accounts_id");
  CREATE INDEX "payload_preferences_rels_service_accounts_id_idx" ON "payload_preferences_rels" USING btree ("service_accounts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "service_accounts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "service_accounts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_service_accounts_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_service_accounts_fk";
  
  DROP INDEX "payload_locked_documents_rels_service_accounts_id_idx";
  DROP INDEX "payload_preferences_rels_service_accounts_id_idx";
  ALTER TABLE "devices" DROP COLUMN "active";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "service_accounts_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "service_accounts_id";
  DROP TYPE "public"."enum_service_accounts_account_type";`)
}
