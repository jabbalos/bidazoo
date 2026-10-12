-- Database-level guards for the trust model. These do not replace application checks; they make
-- the important invariants true even if a bug (or a future module) tries to break them.

-- 1. Attempts and ledgers are append-only.
--    UPDATE is always refused. DELETE is refused unless a deliberate erasure routine (for example
--    a future "delete this child's data" job) opens its transaction with
--    SET LOCAL bidazoo.allow_erasure = 'on'.
CREATE FUNCTION bidazoo_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only: UPDATE is not allowed', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('bidazoo.allow_erasure', true), '') <> 'on' THEN
    RAISE EXCEPTION '% is append-only: DELETE is not allowed outside an erasure routine', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER attempts_append_only BEFORE UPDATE OR DELETE ON attempts
  FOR EACH ROW EXECUTE FUNCTION bidazoo_append_only();
--> statement-breakpoint
CREATE TRIGGER wallet_transactions_append_only BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION bidazoo_append_only();
--> statement-breakpoint
CREATE TRIGGER xp_events_append_only BEFORE UPDATE OR DELETE ON xp_events
  FOR EACH ROW EXECUTE FUNCTION bidazoo_append_only();
--> statement-breakpoint

-- 2. A served question is frozen once issued. Only answered_at may change, and only once
--    (null -> timestamp). In particular served_at, the start of the authoritative response
--    timer, can never be reset, and the answer key can never be rewritten.
CREATE FUNCTION bidazoo_served_questions_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.play_session_id IS DISTINCT FROM OLD.play_session_id
     OR NEW.sequence IS DISTINCT FROM OLD.sequence
     OR NEW.skill_key IS DISTINCT FROM OLD.skill_key
     OR NEW.selection_reason IS DISTINCT FROM OLD.selection_reason
     OR NEW.public_payload IS DISTINCT FROM OLD.public_payload
     OR NEW.private_grading_data IS DISTINCT FROM OLD.private_grading_data
     OR NEW.served_at IS DISTINCT FROM OLD.served_at THEN
    RAISE EXCEPTION 'served_questions rows are frozen once issued' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.answered_at IS NOT NULL AND NEW.answered_at IS DISTINCT FROM OLD.answered_at THEN
    RAISE EXCEPTION 'a served question can only be marked answered once' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER served_questions_guard BEFORE UPDATE ON served_questions
  FOR EACH ROW EXECUTE FUNCTION bidazoo_served_questions_guard();
