CREATE TABLE "audiobook_chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"chapter_number" integer NOT NULL,
	"chapter_title" text,
	"text_content" text NOT NULL,
	"audio_file_name" text,
	"audio_duration_seconds" integer,
	"audio_size_bytes" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audiobook_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"source_language" text DEFAULT 'es',
	"voice_id" text NOT NULL,
	"voice_name" text,
	"cover_image" text,
	"total_chapters" integer DEFAULT 0,
	"completed_chapters" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"format" text DEFAULT 'mp3',
	"bitrate" integer DEFAULT 128,
	"speed" real DEFAULT 1,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"guide_type" text NOT NULL,
	"source_author" text,
	"source_idea" text,
	"source_genre" text,
	"pseudonym_id" integer,
	"series_id" integer,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "series_arc_milestones" DROP CONSTRAINT "series_arc_milestones_fulfilled_in_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "series_arc_verifications" DROP CONSTRAINT "series_arc_verifications_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "reedit_projects" ADD COLUMN "series_id" integer;--> statement-breakpoint
ALTER TABLE "reedit_projects" ADD COLUMN "series_order" integer;--> statement-breakpoint
ALTER TABLE "reedit_world_bibles" ADD COLUMN "author_notes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "series_arc_milestones" ADD COLUMN "fulfilled_volume_type" text DEFAULT 'project';--> statement-breakpoint
ALTER TABLE "series_arc_verifications" ADD COLUMN "volume_type" text DEFAULT 'project';--> statement-breakpoint
ALTER TABLE "world_bibles" ADD COLUMN "author_notes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "audiobook_chapters" ADD CONSTRAINT "audiobook_chapters_project_id_audiobook_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."audiobook_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_guides" ADD CONSTRAINT "generated_guides_pseudonym_id_pseudonyms_id_fk" FOREIGN KEY ("pseudonym_id") REFERENCES "public"."pseudonyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_guides" ADD CONSTRAINT "generated_guides_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reedit_projects" ADD CONSTRAINT "reedit_projects_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;