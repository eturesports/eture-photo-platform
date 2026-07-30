CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "access_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"photo_id" uuid,
	"person_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appearance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"person_id" uuid,
	"bbox" jsonb NOT NULL,
	"face_score" real,
	"number_read" smallint,
	"number_score" real,
	"combined_score" real NOT NULL,
	"source" text NOT NULL,
	"state" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"granted" boolean NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "face_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"aws_face_id" text,
	"embedding" vector(512),
	"crop_key" text NOT NULL,
	"origin" text NOT NULL,
	"quality" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_ref_aws_face_id_unique" UNIQUE("aws_face_id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"slug" text NOT NULL,
	"role" text NOT NULL,
	"birth_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"batch_id" uuid,
	"storage_key" text NOT NULL,
	"web_key" text,
	"thumb_key" text,
	"sha256" text NOT NULL,
	"phash" bigint,
	"width" smallint,
	"height" smallint,
	"bytes" bigint,
	"shot_at" timestamp with time zone,
	"photographer" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"faces_detected" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"held_on" date NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"opponent" text,
	"venue" text,
	"numbers_visible" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"program" text NOT NULL,
	"season" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_member" (
	"squad_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"shirt_number" smallint,
	"joined_on" date,
	"left_on" date,
	CONSTRAINT "squad_member_squad_id_person_id_pk" PRIMARY KEY("squad_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "upload_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer" text NOT NULL,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received" smallint DEFAULT 0 NOT NULL,
	"duplicates" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appearance" ADD CONSTRAINT "appearance_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance" ADD CONSTRAINT "appearance_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_ref" ADD CONSTRAINT "face_ref_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_batch_id_upload_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."upload_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_member" ADD CONSTRAINT "squad_member_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_member" ADD CONSTRAINT "squad_member_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appearance_person_state_idx" ON "appearance" USING btree ("person_id","state");--> statement-breakpoint
CREATE INDEX "appearance_queue_idx" ON "appearance" USING btree ("state","combined_score");--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_unique_confirmed_idx" ON "appearance" USING btree ("photo_id","person_id") WHERE "appearance"."state" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "consent_person_scope_idx" ON "consent" USING btree ("person_id","scope");--> statement-breakpoint
CREATE INDEX "face_ref_person_idx" ON "face_ref" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "face_ref_vector_idx" ON "face_ref" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "person_role_idx" ON "person" USING btree ("role");--> statement-breakpoint
CREATE INDEX "photo_session_status_idx" ON "photo" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "photo_sha_idx" ON "photo" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "photo_phash_idx" ON "photo" USING btree ("phash");--> statement-breakpoint
CREATE INDEX "session_squad_date_idx" ON "session" USING btree ("squad_id","held_on");--> statement-breakpoint
CREATE INDEX "squad_member_number_idx" ON "squad_member" USING btree ("squad_id","shirt_number");