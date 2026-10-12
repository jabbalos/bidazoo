CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "play_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"seed" text NOT NULL,
	"total_questions" smallint NOT NULL,
	"answered_count" smallint DEFAULT 0 NOT NULL,
	"correct_count" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "play_sessions_id_player_uq" UNIQUE("id","player_id"),
	CONSTRAINT "play_sessions_status_ck" CHECK ("play_sessions"."status" in ('active', 'completed', 'expired')),
	CONSTRAINT "play_sessions_total_ck" CHECK ("play_sessions"."total_questions" > 0),
	CONSTRAINT "play_sessions_progress_ck" CHECK ("play_sessions"."answered_count" between 0 and "play_sessions"."total_questions" and "play_sessions"."correct_count" between 0 and "play_sessions"."answered_count"),
	CONSTRAINT "play_sessions_completed_ck" CHECK (("play_sessions"."status" = 'completed') = ("play_sessions"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "served_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"play_session_id" uuid NOT NULL,
	"sequence" smallint NOT NULL,
	"skill_key" text NOT NULL,
	"selection_reason" text NOT NULL,
	"public_payload" jsonb NOT NULL,
	"private_grading_data" jsonb NOT NULL,
	"served_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "served_questions_session_sequence_uq" UNIQUE("play_session_id","sequence"),
	CONSTRAINT "served_questions_id_session_uq" UNIQUE("id","play_session_id"),
	CONSTRAINT "served_questions_sequence_ck" CHECK ("served_questions"."sequence" > 0),
	CONSTRAINT "served_questions_reason_ck" CHECK ("served_questions"."selection_reason" in ('new', 'due', 'review', 'retry')),
	CONSTRAINT "served_questions_time_ck" CHECK ("served_questions"."answered_at" is null or "served_questions"."answered_at" >= "served_questions"."served_at")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"served_question_id" uuid NOT NULL,
	"play_session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"submitted_response" integer NOT NULL,
	"correct" boolean NOT NULL,
	"fluent" boolean NOT NULL,
	"response_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_served_question_uq" UNIQUE("served_question_id"),
	CONSTRAINT "attempts_player_idempotency_uq" UNIQUE("player_id","idempotency_key"),
	CONSTRAINT "attempts_response_ms_ck" CHECK ("attempts"."response_ms" >= 0),
	CONSTRAINT "attempts_fluent_ck" CHECK (not "attempts"."fluent" or "attempts"."correct")
);
--> statement-breakpoint
CREATE TABLE "skill_mastery" (
	"player_id" uuid NOT NULL,
	"skill_key" text NOT NULL,
	"box" smallint DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"fluent_days" integer DEFAULT 0 NOT NULL,
	"last_fluent_day" date,
	"last_attempt_at" timestamp with time zone,
	"next_review_at" timestamp with time zone NOT NULL,
	"mastered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_mastery_player_id_skill_key_pk" PRIMARY KEY("player_id","skill_key"),
	CONSTRAINT "skill_mastery_box_ck" CHECK ("skill_mastery"."box" between 0 and 5),
	CONSTRAINT "skill_mastery_counts_ck" CHECK ("skill_mastery"."streak" >= 0 and "skill_mastery"."attempts" >= 0 and "skill_mastery"."correct_count" between 0 and "skill_mastery"."attempts" and "skill_mastery"."fluent_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"play_session_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_idempotency_uq" UNIQUE("idempotency_key"),
	CONSTRAINT "wallet_transactions_source_uq" UNIQUE("source_type","source_id","reason","currency"),
	CONSTRAINT "wallet_transactions_currency_ck" CHECK ("wallet_transactions"."currency" in ('coins')),
	CONSTRAINT "wallet_transactions_amount_ck" CHECK ("wallet_transactions"."amount" <> 0),
	CONSTRAINT "wallet_transactions_source_ck" CHECK ("wallet_transactions"."source_type" in ('attempt', 'play_session'))
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"play_session_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_events_idempotency_uq" UNIQUE("idempotency_key"),
	CONSTRAINT "xp_events_source_uq" UNIQUE("source_type","source_id","reason"),
	CONSTRAINT "xp_events_amount_ck" CHECK ("xp_events"."amount" > 0),
	CONSTRAINT "xp_events_source_ck" CHECK ("xp_events"."source_type" in ('attempt', 'play_session'))
);
--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "served_questions" ADD CONSTRAINT "served_questions_play_session_id_play_sessions_id_fk" FOREIGN KEY ("play_session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_session_fk" FOREIGN KEY ("served_question_id","play_session_id") REFERENCES "public"."served_questions"("id","play_session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_player_fk" FOREIGN KEY ("play_session_id","player_id") REFERENCES "public"."play_sessions"("id","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_play_session_id_play_sessions_id_fk" FOREIGN KEY ("play_session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_play_session_id_play_sessions_id_fk" FOREIGN KEY ("play_session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_sessions_token_hash_uq" ON "guest_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guest_sessions_player_idx" ON "guest_sessions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "play_sessions_one_active_uq" ON "play_sessions" USING btree ("player_id","game_id") WHERE "play_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "play_sessions_player_idx" ON "play_sessions" USING btree ("player_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "served_questions_one_open_uq" ON "served_questions" USING btree ("play_session_id") WHERE "served_questions"."answered_at" is null;--> statement-breakpoint
CREATE INDEX "served_questions_skill_idx" ON "served_questions" USING btree ("skill_key");--> statement-breakpoint
CREATE INDEX "attempts_session_idx" ON "attempts" USING btree ("play_session_id");--> statement-breakpoint
CREATE INDEX "skill_mastery_review_idx" ON "skill_mastery" USING btree ("player_id","next_review_at");--> statement-breakpoint
CREATE INDEX "wallet_transactions_player_idx" ON "wallet_transactions" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_transactions_session_idx" ON "wallet_transactions" USING btree ("play_session_id");--> statement-breakpoint
CREATE INDEX "xp_events_player_idx" ON "xp_events" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_events_session_idx" ON "xp_events" USING btree ("play_session_id");