CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text DEFAULT 'sign_in' NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "guardian_login_tokens_purpose_ck" CHECK ("guardian_login_tokens"."purpose" in ('sign_in')),
	CONSTRAINT "guardian_login_tokens_expiry_ck" CHECK ("guardian_login_tokens"."expires_at" > "guardian_login_tokens"."created_at"),
	CONSTRAINT "guardian_login_tokens_email_ck" CHECK ("guardian_login_tokens"."used_at" is not null or "guardian_login_tokens"."email" is not null)
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_id_family_uq" UNIQUE("id","family_id"),
	CONSTRAINT "guardians_email_ck" CHECK ("guardians"."email" = lower("guardians"."email") and length("guardians"."email") between 3 and 254)
);
--> statement-breakpoint
CREATE TABLE "child_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"nickname" varchar(32) NOT NULL,
	"pin_hash" text,
	"pin_set_at" timestamp with time zone,
	"pin_failures" smallint DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"created_by_guardian_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "child_profiles_player_uq" UNIQUE("player_id"),
	CONSTRAINT "child_profiles_id_family_uq" UNIQUE("id","family_id"),
	CONSTRAINT "child_profiles_nickname_ck" CHECK (length(btrim("child_profiles"."nickname")) between 1 and 32 and "child_profiles"."nickname" = btrim("child_profiles"."nickname")),
	CONSTRAINT "child_profiles_pin_ck" CHECK (("child_profiles"."pin_hash" is null) = ("child_profiles"."pin_set_at" is null)),
	CONSTRAINT "child_profiles_pin_failures_ck" CHECK ("child_profiles"."pin_failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"child_profile_id" uuid,
	"created_by_guardian_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_device_session_id" uuid,
	CONSTRAINT "device_auth_codes_expiry_ck" CHECK ("device_auth_codes"."expires_at" > "device_auth_codes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"guardian_id" uuid,
	"active_child_profile_id" uuid,
	"token_hash" text NOT NULL,
	"origin" text NOT NULL,
	"label" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_guardian_id" uuid,
	"authority_expires_at" timestamp with time zone,
	CONSTRAINT "device_sessions_origin_ck" CHECK ("device_sessions"."origin" in ('email_link', 'device_code')),
	CONSTRAINT "device_sessions_expiry_ck" CHECK ("device_sessions"."expires_at" > "device_sessions"."created_at"),
	CONSTRAINT "device_sessions_authority_ck" CHECK ("device_sessions"."authority_expires_at" is null or "device_sessions"."guardian_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "identity_throttles" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "identity_throttles_pk" PRIMARY KEY("scope","key_hash"),
	CONSTRAINT "identity_throttles_count_ck" CHECK ("identity_throttles"."count" >= 0),
	CONSTRAINT "identity_throttles_scope_ck" CHECK (length("identity_throttles"."scope") between 1 and 48)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"family_id" uuid,
	"subject_type" text,
	"subject_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_actor_ck" CHECK ("audit_events"."actor_type" in ('guardian', 'device', 'system', 'operator')),
	CONSTRAINT "audit_events_meta_ck" CHECK (jsonb_typeof("audit_events"."meta") = 'object')
);
--> statement-breakpoint
CREATE TABLE "legacy_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_system" text DEFAULT 'hopquest' NOT NULL,
	"exported_at" timestamp with time zone,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"loaded_by" varchar(40),
	"family_count" integer NOT NULL,
	"kid_count" integer NOT NULL,
	CONSTRAINT "legacy_batches_source_ck" CHECK ("legacy_batches"."source_system" in ('hopquest')),
	CONSTRAINT "legacy_batches_counts_ck" CHECK ("legacy_batches"."family_count" >= 0 and "legacy_batches"."kid_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "legacy_claim_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"legacy_family_row_id" uuid NOT NULL,
	"issued_by" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_guardian_id" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "legacy_claim_codes_expiry_ck" CHECK ("legacy_claim_codes"."expires_at" > "legacy_claim_codes"."created_at"),
	CONSTRAINT "legacy_claim_codes_use_ck" CHECK (("legacy_claim_codes"."used_at" is null) = ("legacy_claim_codes"."used_by_guardian_id" is null))
);
--> statement-breakpoint
CREATE TABLE "legacy_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"legacy_family_id" text NOT NULL,
	"email_match_hmac" text NOT NULL,
	"status" text DEFAULT 'unclaimed' NOT NULL,
	"family_id" uuid,
	"claimed_by_guardian_id" uuid,
	"claimed_at" timestamp with time zone,
	"claim_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_families_status_ck" CHECK ("legacy_families"."status" in ('unclaimed', 'claimed', 'withdrawn')),
	CONSTRAINT "legacy_families_hmac_ck" CHECK ("legacy_families"."email_match_hmac" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legacy_families_method_ck" CHECK ("legacy_families"."claim_method" is null or "legacy_families"."claim_method" in ('verified-email-match', 'operator-code')),
	CONSTRAINT "legacy_families_claim_ck" CHECK (("legacy_families"."status" = 'claimed' and "legacy_families"."family_id" is not null and "legacy_families"."claimed_by_guardian_id" is not null and "legacy_families"."claimed_at" is not null and "legacy_families"."claim_method" is not null)
        or ("legacy_families"."status" <> 'claimed' and "legacy_families"."family_id" is null and "legacy_families"."claimed_by_guardian_id" is null and "legacy_families"."claimed_at" is null and "legacy_families"."claim_method" is null))
);
--> statement-breakpoint
CREATE TABLE "legacy_kids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_family_row_id" uuid NOT NULL,
	"legacy_kid_id" text NOT NULL,
	"legacy_username" varchar(40),
	"grade_band" varchar(16),
	"child_profile_id" uuid,
	"linked_at" timestamp with time zone,
	CONSTRAINT "legacy_kids_link_ck" CHECK (("legacy_kids"."child_profile_id" is null) = ("legacy_kids"."linked_at" is null))
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_created_by_guardian_id_guardians_id_fk" FOREIGN KEY ("created_by_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_created_by_guardian_id_guardians_id_fk" FOREIGN KEY ("created_by_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_used_by_device_session_id_device_sessions_id_fk" FOREIGN KEY ("used_by_device_session_id") REFERENCES "public"."device_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_child_family_fk" FOREIGN KEY ("child_profile_id","family_id") REFERENCES "public"."child_profiles"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_revoked_by_guardian_id_guardians_id_fk" FOREIGN KEY ("revoked_by_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_guardian_family_fk" FOREIGN KEY ("guardian_id","family_id") REFERENCES "public"."guardians"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_child_family_fk" FOREIGN KEY ("active_child_profile_id","family_id") REFERENCES "public"."child_profiles"("id","family_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_claim_codes" ADD CONSTRAINT "legacy_claim_codes_legacy_family_row_id_legacy_families_id_fk" FOREIGN KEY ("legacy_family_row_id") REFERENCES "public"."legacy_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_claim_codes" ADD CONSTRAINT "legacy_claim_codes_used_by_guardian_id_guardians_id_fk" FOREIGN KEY ("used_by_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_families" ADD CONSTRAINT "legacy_families_batch_id_legacy_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."legacy_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_families" ADD CONSTRAINT "legacy_families_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_families" ADD CONSTRAINT "legacy_families_claimed_by_guardian_id_guardians_id_fk" FOREIGN KEY ("claimed_by_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_kids" ADD CONSTRAINT "legacy_kids_legacy_family_row_id_legacy_families_id_fk" FOREIGN KEY ("legacy_family_row_id") REFERENCES "public"."legacy_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_kids" ADD CONSTRAINT "legacy_kids_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_login_tokens_hash_uq" ON "guardian_login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guardian_login_tokens_expires_idx" ON "guardian_login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_email_uq" ON "guardians" USING btree ("email");--> statement-breakpoint
CREATE INDEX "guardians_family_idx" ON "guardians" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "child_profiles_family_idx" ON "child_profiles" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_auth_codes_hash_uq" ON "device_auth_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "device_auth_codes_family_idx" ON "device_auth_codes" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_sessions_token_hash_uq" ON "device_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_sessions_family_idx" ON "device_sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "identity_throttles_window_idx" ON "identity_throttles" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "audit_events_family_idx" ON "audit_events" USING btree ("family_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action","at");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_claim_codes_hash_uq" ON "legacy_claim_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "legacy_claim_codes_family_idx" ON "legacy_claim_codes" USING btree ("legacy_family_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_families_legacy_id_live_uq" ON "legacy_families" USING btree ("legacy_family_id") WHERE "legacy_families"."status" <> 'withdrawn';--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_families_match_live_uq" ON "legacy_families" USING btree ("email_match_hmac") WHERE "legacy_families"."status" <> 'withdrawn';--> statement-breakpoint
CREATE INDEX "legacy_families_family_idx" ON "legacy_families" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_kids_legacy_kid_uq" ON "legacy_kids" USING btree ("legacy_kid_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_kids_profile_uq" ON "legacy_kids" USING btree ("child_profile_id") WHERE "legacy_kids"."child_profile_id" is not null;--> statement-breakpoint
CREATE INDEX "legacy_kids_family_idx" ON "legacy_kids" USING btree ("legacy_family_row_id");