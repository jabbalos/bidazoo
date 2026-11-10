-- Gear purchases (Lane C item C3). Additive guards on the coin ledger only.
--
-- A purchase in the outfitter is one NEGATIVE wallet_transactions row with source_type
-- 'gear_purchase', source_id = the buying player and reason 'gear:<item id>'. The existing unique key
-- (source_type, source_id, reason, currency) then makes each item purchasable once per player, and
-- the existing append-only trigger keeps the row immutable. The price comes from the server's own
-- catalog; the balance check happens in the API inside a transaction that locks player_progress.
--
-- New guards:
--   wallet_transactions_source_ck   also allows 'gear_purchase'.
--   wallet_transactions_debit_ck    a row is negative exactly when it is a gear purchase: earnings
--                                   stay positive, a purchase can never ADD coins.
--   wallet_transactions_gear_ck     a gear purchase is keyed to the player who pays for it.

ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_source_ck";
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_source_ck"
	CHECK ("wallet_transactions"."source_type" in ('attempt', 'play_session', 'gear_purchase'));
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_debit_ck"
	CHECK (("wallet_transactions"."source_type" = 'gear_purchase') = ("wallet_transactions"."amount" < 0));
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_gear_ck"
	CHECK ("wallet_transactions"."source_type" <> 'gear_purchase' or "wallet_transactions"."source_id" = "wallet_transactions"."player_id");
