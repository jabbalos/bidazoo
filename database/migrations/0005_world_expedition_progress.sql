-- World Expedition progression (proposal section 2.3; Lane C item C1). Additive only.
--
-- player_progress     one row per player: gear (owned and equipped item ids), daily streak.
--                     Level and XP are NOT stored here: XP is the sum of xp_events (rewards ledger)
--                     and the level is derived from it by a pure function (item C4).
-- destination_stamps  one row per (player, destination): passport stamps earned and artifacts found.
--                     Written only by the server (stamp = at least 3 of 5 beacons lit in the
--                     server's own replay of its stored answers; item C2).
-- expedition_events   append-only facts about an expedition run, one row per (session, kind). The
--                     unique key is the exactly-once guard for anything a completed session awards.
--
-- Guests keep working: every table keys off the existing players.id.

CREATE TABLE "player_progress" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"gear" jsonb DEFAULT '{"owned":[],"equipped":[]}'::jsonb NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_play_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_progress_gear_ck" CHECK (
		jsonb_typeof("player_progress"."gear") = 'object'
		and jsonb_typeof("player_progress"."gear" -> 'owned') = 'array'
		and jsonb_typeof("player_progress"."gear" -> 'equipped') = 'array'
	),
	CONSTRAINT "player_progress_streak_ck" CHECK ("player_progress"."streak_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "destination_stamps" (
	"player_id" uuid NOT NULL,
	"destination" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destination_stamps_pk" PRIMARY KEY("player_id","destination"),
	CONSTRAINT "destination_stamps_destination_ck" CHECK ("destination_stamps"."destination" ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
	CONSTRAINT "destination_stamps_count_ck" CHECK ("destination_stamps"."count" >= 0),
	CONSTRAINT "destination_stamps_best_streak_ck" CHECK ("destination_stamps"."best_streak" >= 0),
	CONSTRAINT "destination_stamps_artifacts_ck" CHECK (jsonb_typeof("destination_stamps"."artifacts") = 'array')
);
--> statement-breakpoint
CREATE TABLE "expedition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"play_session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expedition_events_session_kind_uq" UNIQUE("play_session_id","kind"),
	CONSTRAINT "expedition_events_kind_ck" CHECK ("expedition_events"."kind" ~ '^[a-z][a-z_]{0,31}$'),
	CONSTRAINT "expedition_events_payload_ck" CHECK (jsonb_typeof("expedition_events"."payload") = 'object')
);
--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_stamps" ADD CONSTRAINT "destination_stamps_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_events" ADD CONSTRAINT "expedition_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The session belongs to the player: an event cannot join one player's session to another player.
ALTER TABLE "expedition_events" ADD CONSTRAINT "expedition_events_session_player_fk" FOREIGN KEY ("play_session_id","player_id") REFERENCES "public"."play_sessions"("id","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expedition_events_player_idx" ON "expedition_events" USING btree ("player_id","created_at");--> statement-breakpoint
-- Events are facts: append-only, like attempts and the reward ledgers (function from 0002).
CREATE TRIGGER expedition_events_append_only BEFORE UPDATE OR DELETE ON expedition_events
  FOR EACH ROW EXECUTE FUNCTION bidazoo_append_only();
