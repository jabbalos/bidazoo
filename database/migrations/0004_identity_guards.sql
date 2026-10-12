-- Checkpoint E: database-level guards for the identity tables. Like 0002, these do not replace
-- application checks; they make the important invariants true even if a bug tries to break them.
-- Everything here concerns NEW tables only. No existing table or trigger is changed.

-- 1. The audit trail is append-only. Reuses the function from 0002: UPDATE is always refused and
--    DELETE is refused outside a deliberate erasure routine (SET LOCAL bidazoo.allow_erasure = 'on').
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION bidazoo_append_only();
--> statement-breakpoint

-- 2. A child profile is a permanent handle on ONE player inside ONE family. The link can never be
--    re-pointed, so ownership and recovery can never be silently moved to another player.
CREATE FUNCTION bidazoo_child_profile_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.player_id IS DISTINCT FROM OLD.player_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'child_profiles identity columns are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER child_profiles_guard BEFORE UPDATE ON child_profiles
  FOR EACH ROW EXECUTE FUNCTION bidazoo_child_profile_guard();
--> statement-breakpoint

-- 3. A sign-in link is single use. Once used it can change no further, its hash and expiry never
--    change, and the pending email can only disappear (at the moment of use), never be rewritten.
CREATE FUNCTION bidazoo_login_token_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'guardian_login_tokens identity columns are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'a sign-in link can only be used once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.used_at IS NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'the pending email of an unused sign-in link cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.used_at IS NOT NULL AND NEW.email IS NOT NULL THEN
    RAISE EXCEPTION 'the pending email must be cleared when a sign-in link is used' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER guardian_login_tokens_guard BEFORE UPDATE ON guardian_login_tokens
  FOR EACH ROW EXECUTE FUNCTION bidazoo_login_token_guard();
--> statement-breakpoint

-- 4. A device session's identity never changes, and a revoked session can never be revived.
CREATE FUNCTION bidazoo_device_session_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.guardian_id IS DISTINCT FROM OLD.guardian_id
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'device_sessions identity columns are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (
       NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
       OR NEW.revoked_by_guardian_id IS DISTINCT FROM OLD.revoked_by_guardian_id
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.authority_expires_at IS DISTINCT FROM OLD.authority_expires_at
       OR NEW.active_child_profile_id IS DISTINCT FROM OLD.active_child_profile_id) THEN
    RAISE EXCEPTION 'a revoked device session cannot be changed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER device_sessions_guard BEFORE UPDATE ON device_sessions
  FOR EACH ROW EXECUTE FUNCTION bidazoo_device_session_guard();
--> statement-breakpoint

-- 5. Device authorization codes and legacy claim codes are single use, and their hashes never change.
CREATE FUNCTION bidazoo_code_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code_hash IS DISTINCT FROM OLD.code_hash THEN
    RAISE EXCEPTION '% identity columns are immutable', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'a % row can only be used once', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER device_auth_codes_guard BEFORE UPDATE ON device_auth_codes
  FOR EACH ROW EXECUTE FUNCTION bidazoo_code_guard();
--> statement-breakpoint
CREATE TRIGGER legacy_claim_codes_guard BEFORE UPDATE ON legacy_claim_codes
  FOR EACH ROW EXECUTE FUNCTION bidazoo_code_guard();
--> statement-breakpoint

-- 6. A legacy family moves only unclaimed -> claimed or unclaimed -> withdrawn, exactly once. A
--    claimed or withdrawn row is frozen, so a claim can never be undone or re-pointed, and the
--    match key and legacy ids never change.
CREATE FUNCTION bidazoo_legacy_family_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.legacy_family_id IS DISTINCT FROM OLD.legacy_family_id
     OR NEW.email_match_hmac IS DISTINCT FROM OLD.email_match_hmac
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'legacy_families identity columns are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'unclaimed' THEN
    RAISE EXCEPTION 'a % legacy family is frozen', OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER legacy_families_guard BEFORE UPDATE ON legacy_families
  FOR EACH ROW EXECUTE FUNCTION bidazoo_legacy_family_guard();
--> statement-breakpoint

-- 7. A legacy kid slot is linked to a child profile at most once, and never re-pointed.
CREATE FUNCTION bidazoo_legacy_kid_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.legacy_family_row_id IS DISTINCT FROM OLD.legacy_family_row_id
     OR NEW.legacy_kid_id IS DISTINCT FROM OLD.legacy_kid_id THEN
    RAISE EXCEPTION 'legacy_kids identity columns are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.child_profile_id IS NOT NULL AND NEW.child_profile_id IS DISTINCT FROM OLD.child_profile_id THEN
    RAISE EXCEPTION 'a legacy kid can only be linked once' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER legacy_kids_guard BEFORE UPDATE ON legacy_kids
  FOR EACH ROW EXECUTE FUNCTION bidazoo_legacy_kid_guard();
