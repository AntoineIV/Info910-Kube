CREATE TYPE "public"."run_status" AS ENUM('started', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "game_configs" (
	"hash" text PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"seed" integer NOT NULL,
	"config_hash" text NOT NULL,
	"upgrades" jsonb NOT NULL,
	"status" "run_status" DEFAULT 'started' NOT NULL,
	"events" jsonb,
	"end_tick" integer,
	"claimed_distance" integer,
	"claimed_coins" integer,
	"distance" integer,
	"coins" integer,
	"reject_reason" text,
	"verified_by" text,
	"verify_ms" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"engine" integer DEFAULT 0 NOT NULL,
	"tires" integer DEFAULT 0 NOT NULL,
	"suspension" integer DEFAULT 0 NOT NULL,
	"tank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_config_hash_game_configs_hash_fk" FOREIGN KEY ("config_hash") REFERENCES "public"."game_configs"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status","finished_at");--> statement-breakpoint
CREATE INDEX "runs_user_idx" ON "runs" USING btree ("user_id","distance");