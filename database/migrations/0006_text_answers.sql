-- Text answers (owner-approved November 9, 2026; Lane C item C-text).
--
-- attempts.submitted_response held the player's answer as an integer. Text questions (for example a
-- spelling or word choice) need a string, so the column becomes text and the server stores
-- String(response): a number answer 56 is stored as '56'. Existing rows convert by cast, so no
-- data is lost. The attempts append-only trigger fires on row UPDATE and DELETE; a column type
-- change rewrites the table without running it, so the immutable-rows guarantee is untouched.

ALTER TABLE "attempts" ALTER COLUMN "submitted_response" SET DATA TYPE text USING "submitted_response"::text;
