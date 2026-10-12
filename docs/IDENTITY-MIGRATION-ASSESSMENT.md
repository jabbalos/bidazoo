# Identity Migration Assessment: Hop Quest families into BidaZoo

Status: **PROPOSAL FOR REVIEW. October 12, 2026.** Read-only assessment. No BidaZoo code,
schema, or configuration was changed, and nothing in Hop Quest, the Accounts service, Caddy, or
Cloudflare was modified. Identity implementation is **not authorized** until this document is
reviewed and approved.

Baseline: `main` at `1a106bc` (Checkpoint D closed, validated commit `52547a3`).

## 1. Method and limits

- Read the BidaZoo docs (PROJECT-STATE, ARCHITECTURE, SECURITY, STUDIO-VALIDATION, CHANGELOG,
  README, REFERENCE-REVIEW, PRODUCT) and the BidaZoo identity code and schema
  (`players`, `guest_sessions`, `modules/identity`).
- Read the live Hop Quest source on the Studio PC (`lib/family.js`, `lib/api.js`, `server.js`) and
  inspected the **shape** of its stored data (field names, counts, types). To do that, copies of
  the three family files, the username index, and `hopquest.json` were staged **temporarily into
  the authoring session's private cloud workspace**, analyzed with scripts that print only
  structure, and then **deleted** from that workspace. Values (names, hashes, salts, emails,
  progress) were not printed, not copied into this repository, and not written into this
  document. The Hop Quest `.env` was not opened.
- The monthly answers log (`data/answers/*.jsonl`) was sized but not read.
- Reading is not execution. Behavior statements come from source. The Accounts service
  (`jonabalos.com`) is off limits and was not read; its behavior is inferred from how Hop Quest
  calls it.
- Not a legal review. Children's-data rules (for example COPPA) still need a proper review before
  real use, as already recorded in SECURITY.md.

## 2. What exists today

### BidaZoo

Guest only. `players(id, nickname, created_at)` plus `guest_sessions(token_hash, expires_at,
revoked_at, ...)`. One HttpOnly cookie, 90 days, SHA-256 hash stored. No parent, no family, no
recovery. Clearing cookies loses the player (documented limitation).

### Hop Quest (live)

| Concern | How it works |
| --- | --- |
| Parent identity | Not owned by Hop Quest. The shared jonabalos.com session cookie (`jab_session`) is exchanged with the Accounts service for a signed entitlement token. The parent id is the Accounts `userId` (`usr_...`) and the parent email is copied into the family file. |
| Family | One JSON file per parent: `{userId, email, created, settings, kids{}}`. |
| Kid profile | Entry in `kids{}`: `{id, username, pinHash, pinSalt, pinV, version, created, daily, loot?, state{}}`. |
| Kid credential | Username plus a **4-digit PIN**, sent over the internet to `POST /api/kid/login`. |
| PIN hash | `crypto.scryptSync(pin, salt, 32)` with Node default cost (N=16384, r=8, p=1). The salt is a 16-character string used as text. Stored base64url. |
| Kid session | `hqk1.<payload>.<HMAC>` bearer token, 30 days, renewable via `/api/kid/renew`, sent as an `X-HQ-Kid` header and kept in browser storage. Signed with one server-wide secret. |
| Revocation | Only by bumping that kid's `pinV` (kills every token for that kid at once). No per-device list. |
| Usernames | One global index (`usernames.json`: username to `{family, kid}`), pattern `^[a-z0-9][a-z0-9_-]{2,19}$`. |
| Cross-app hand-off | One-time 2-minute codes held in process memory. |
| Parent "grown-ups PIN" | Optional 4 to 8 digit PIN hash in family settings; none of the three families has set one. |
| Progress | A client-authored `state` object per kid (coins, sparks, streak, mastery, badges, pet, inventory, history, ...). The server stores what the browser sends (`PUT /api/kids/:id`, size-capped, a few fields stripped). |

### Inventory of the current data (shape only)

| Item | Count |
| --- | --- |
| Families (parent accounts) | 3 |
| Kid profiles | 8 (three families with 1, 6, and 1 kids) |
| Username index entries | 8 |
| Index entries that do not match a kid, or duplicate usernames | 0 |
| Kids with a PIN hash | 8 of 8 |
| Families with a grown-ups PIN | 0 of 3 |
| Kids with pending Boss Hop "loot" | 3 |

This is a **tiny** population. That changes the right migration strategy (section 5).

## 3. Can each item migrate?

| Item | Verdict | Why |
| --- | --- | --- |
| Family grouping (parent to kids) | **Yes, as structure** | The relationship is clean (every kid belongs to exactly one parent file). It maps directly to `family -> guardian -> child profiles`. Re-create it in BidaZoo; do not import the file. |
| Parent identity | **Yes, by re-proof, not by copy** | The parent id and email live in the Accounts service. BidaZoo must not read Accounts or reuse its cookie. The parent types their email into BidaZoo and proves control of it (a one-time emailed link). Only then is that *verified* address compared, as a keyed hash, with the legacy family's match key (section 5), and only a match links the legacy family to the new BidaZoo guardian account. BidaZoo never stores the legacy plaintext email. |
| Child display name | **Convert, minimize** | Legacy `state.name` is a short free-text name, likely a first name. BidaZoo wants nicknames. The parent chooses a nickname when claiming. Do not import the legacy name automatically. |
| Usernames | **As a label only, optional** | Legacy usernames are a global namespace and are the internet-facing half of a login. In BidaZoo, children should not need a globally unique login name. Keep the old username as an auditable legacy label and an optional per-family display handle. Do not make it a credential. |
| PIN hashes | **Not recommended** | They are technically safe to store (salted scrypt) but protect little: there are only 10,000 possible 4-digit PINs, so anyone who obtains the hash can recover the PIN almost instantly at scrypt cost. They also use a 16-character text salt and a one-server design. Importing them would carry a weak secret into a new system and would keep the "PIN is the password" model BidaZoo should leave behind. Reset instead (section 4). |
| Kid sessions / `hqk1` tokens / browser storage | **No** | Bearer tokens in browser storage, one shared signing secret, all-or-nothing revocation. Directly contrary to BidaZoo's HttpOnly, hashed, revocable session model. Never copy legacy cookies or tokens. |
| Hop Quest progress (coins, sparks, streak, badges, pet, inventory) | **Not as authoritative state** | It was authored by the browser and stored as sent. REFERENCE-REVIEW.md already classes this as DO NOT CARRY FORWARD: a child (or a script) could have set any value, so importing it into BidaZoo's append-only ledgers would launder untrusted numbers into trusted ones. |
| Hop Quest mastery | **Not mappable** | Legacy mastery is keyed by reading and math skill names (TEKS-style, grades K to 8). BidaZoo's `skill_mastery` is keyed by `mul:AxB` facts with server-measured Leitner state. There is no honest conversion, and the data was not server-timed. |
| Answer history | **Not as BidaZoo attempts** | `attempts` rows must reference a served question the server issued. They cannot be fabricated. |
| Marketing contacts / consent (`hopquest.json`) | **No** | Different purpose and consent. Contains emails of people who are not necessarily BidaZoo parents. Do not migrate. |

### Useful progress, safely

Nothing needs to be lost entirely. Two safe options, in order of preference:

1. **Archive, do not import.** Store a read-only, parent-visible legacy snapshot (bounded JSON per
   child) in a separate table. It is never read by gameplay, the ledger, or mastery.
2. **Optional fixed welcome grant.** If the owner wants continuity, the server alone decides a
   small, fixed, one-time "welcome back" grant per claimed child, written through the existing
   ledger with `source_type='legacy_welcome'` and a unique source id. The amount is a policy
   constant, not derived from legacy numbers.

Both are product decisions for the owner. This document recommends option 1 and treats option 2 as
optional.

## 4. Target model

```text
family
  -> guardian account (email, verified)
       -> child profile(s)  (nickname, optional profile PIN, no email)
            -> player (existing players row; unchanged)
  -> trusted devices (per device, individually revocable)
  -> legacy_families / legacy_kids (auditable mapping)
```

Principles:

- **BidaZoo-issued sessions only.** Same cookie model as today (random 32-byte token, SHA-256 hash
  stored, HttpOnly, SameSite=Lax, `__Host-`/Secure). No bearer tokens, nothing in `localStorage`.
- **Guardian is the only account that can authenticate over the internet.** Email proof of
  control (one-time link) with generic responses, rate limits, and expiry.
- **Children have no email and no internet-facing password.** A child plays through a
  **trusted-device session** the guardian authorizes once (guardian signed in on that device picks
  the child profile, or scans/enters a short one-time code from the guardian's device). The session
  is a long-lived BidaZoo cookie (persistent trusted-device login).
- **Optional profile PIN** (4 digits) is a *local lock* to switch profiles on an already-trusted
  device. It is never accepted as the sole credential from an untrusted device, and it is
  rate-limited and lockable per profile. This removes the Hop Quest internet brute-force surface
  (username enumeration plus 10,000 PINs).
- **Parent-controlled recovery.** A child who loses a device asks the guardian; the guardian
  signs in by email link and issues a new trusted-device authorization. No child email, no
  security questions.
- **Device and session revocation.** Guardian can list devices (label, first/last seen) and revoke
  one or all. Sessions already have `expires_at`/`revoked_at`; the new device record adds the
  per-device grouping.
- **Guest upgrade.** An existing BidaZoo guest (the current state of any beta tester) can be
  *claimed* into a family by an authenticated guardian from the same browser, attaching the
  existing `players` row to a child profile. This also closes the "clearing cookies loses
  progress" limitation for new users, independent of Hop Quest.
- **Invariants preserved.** The server still decides questions, grading, mastery, XP, coins.
  `players.id` is unchanged and remains the key for every ledger and attempt. Ownership checks
  keep resolving to a `playerId`; identity changes only *how* a request is authenticated to a
  player, not what that player can do.

### Proposed tables (sketch for review, not implemented)

| Table | Key columns | Notes |
| --- | --- | --- |
| `families` | `id`, `created_at` | A grouping row. |
| `guardians` | `id`, `family_id`, `email` (unique, lower-cased), `email_verified_at`, `created_at` | Only table with an email. |
| `guardian_login_tokens` | `token_hash`, `guardian_id` or `email`, `purpose`, `expires_at`, `used_at` | One-time links; hash stored, never the token. |
| `child_profiles` | `id`, `family_id`, `player_id` (unique), `nickname`, `pin_hash` (nullable), `pin_failures`, `locked_until`, `archived_at` | Links to the existing `players` row. |
| `device_sessions` | `id`, `family_id`, `child_profile_id` (nullable for guardian sessions), `token_hash`, `label`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, `revoked_by` | Replaces per-guest cookie semantics for family accounts; `guest_sessions` stays for guests. |
| `legacy_batches` | `id`, `source_system` (`hopquest`), `exported_at`, `loaded_at`, `loaded_by`, `row_count`, `superseded_by` | One row per manifest load; lets a stale export be replaced. |
| `legacy_families` | `id`, `batch_id`, `legacy_family_id` (unique per source), `email_match_hmac` (unique, bytea), `status` (`unclaimed`, `claimed`, `withdrawn`), `family_id` (null until claimed), `claimed_by_guardian_id`, `claimed_at`, `claim_method` (`verified-email-match` or `operator-code`) | Family-level record. **No plaintext email, no name.** |
| `legacy_kids` | `id`, `legacy_family_row` (FK), `legacy_kid_id` (unique per source), `legacy_username`, `grade_band`, `child_profile_id` (null until the guardian links one), `linked_at` | Per-child slot that the guardian fills in; the audit trail from old kid to new profile. |
| `legacy_claim_codes` | `code_hash`, `legacy_family_row`, `created_by`, `expires_at`, `used_at` | Fallback only (section 5); single use, hash stored. |
| `legacy_snapshots` (optional) | `legacy_kid_row`, `captured_at`, `snapshot` (jsonb, bounded) | Read-only archive; never read by gameplay. |
| `audit_events` | `id`, `at`, `actor_type`, `actor_id`, `action`, `subject`, `meta` (no secrets) | Needed anyway (SECURITY.md lists no audit logging). |

All new tables are additive. No change to `players`, `attempts`, ledgers, or `skill_mastery`.

## 5. Migration strategy

With 3 families and 8 kids, **bulk import is the wrong tool.** A script that reads another
product's family files is the riskiest path and buys almost nothing.

Recommended: **assisted claim, no automated import of legacy credentials or progress.**

### 5.1 What the manifest contains (and does not)

The manifest is the only legacy data BidaZoo ever receives. It holds, per family: the legacy
family id and the parent's email **as a match key only**; and per kid: the legacy kid id, the
legacy username, and a grade band. It does **not** hold names, PIN hashes or salts, tokens,
cookies, progress, marketing contacts, or consent records. Emails are the one piece of contact
data it must carry, so the rule is narrow and explicit:

- The plaintext email exists only in a **transient local export file on the Studio PC** that the
  operator produces and the loader consumes in the same sitting. It is never committed, never
  uploaded, and is deleted after loading.
- The loader converts it to the match key (5.2) and stores **only the key**. BidaZoo's database,
  logs, backups, and audit events never contain the legacy plaintext email.
- A guardian's *own* email (typed by them, verified by link) is stored in `guardians.email` as
  ordinary account data. That is a different value from the legacy match key and is created by the
  guardian, not imported.

### 5.2 Family-level legacy email match

One legacy family can be claimed by one BidaZoo family, once, by someone who can prove they own
the legacy parent address.

1. **Match key.** `email_match_hmac = HMAC-SHA-256(pepper, "bidazoo-legacy-match-v1:" + normalized_email)`.
   Normalization: Unicode NFKC, trim, lower-case the whole address. No provider-specific folding
   (no removing dots, no stripping `+tags`), so the match is exact and never merges two real
   people. `pepper` is a server secret (`LEGACY_MATCH_PEPPER`, at least 32 random bytes) held in
   the API environment, not in the database, not in git. A database leak alone does not reveal the
   emails.
2. **When matching may happen.** Only **after** the guardian's email is verified by a one-time
   link. Never at sign-up submission, never from a typed-but-unverified address. The match
   therefore cannot be used to probe which emails are Hop Quest parents.
3. **What the match does.** The verified email is normalized and keyed with the same pepper and
   looked up among `legacy_families` rows with `status='unclaimed'`. If one matches, the guardian
   is told: "We found a Hop Quest family for this email with N children. Bring them over?"
   The count and usernames are shown only to this verified owner. If nothing matches, the screen
   is exactly the ordinary new-account screen; it says nothing about legacy.
4. **Claim is family-wide and atomic.** Accepting claims the whole legacy family in one
   transaction: set `status='claimed'`, `family_id`, `claimed_by_guardian_id`, `claimed_at`,
   `claim_method='verified-email-match'`, and write an `audit_events` row. A unique constraint on
   `legacy_families` and a `WHERE status='unclaimed'` update make double claims impossible; a
   losing concurrent claim gets the neutral new-account screen.
5. **Kids are then linked one at a time by the guardian** (`legacy_kids.child_profile_id`), each
   with a nickname the guardian chooses. A child may also be skipped and linked later.
6. **Extra guardians.** A second parent is invited by the claiming guardian inside BidaZoo. They
   do not claim by email match; the legacy family is already claimed.
7. **Parent now uses a different email than Hop Quest.** No automatic match. Fallback: the
   operator (Jonathan) confirms the person out of band, then issues a single-use claim code
   (128 random bits, hash stored, 7-day expiry, bound to one `legacy_families` row), recorded as
   `claim_method='operator-code'`. With 3 families this is realistic and avoids loosening the
   automatic rule.
8. **Failure cases.** Two legacy families with the same normalized email: the loader refuses the
   batch (the unique constraint fails loudly) and the operator resolves it before loading. A
   family whose email changed in Hop Quest after export: re-export and load a new batch, which
   supersedes unclaimed rows only; claimed rows are never altered.
9. **Abuse limits.** Email-link requests return the same generic response for every address, are
   rate limited per address and per IP, and (for these flows) keep their counters in the database
   so a restart does not reset them.

### 5.3 Steps

1. **Export.** Jonathan runs a small read-only script on the Studio PC that writes the transient
   file described in 5.1. BidaZoo never reads Hop Quest's files directly.
2. **Load.** A BidaZoo loader (part of the future identity checkpoint, run on the Studio PC with
   the pepper) hashes each email, inserts `legacy_batches`, `legacy_families`, and `legacy_kids`
   with `status='unclaimed'`, then Jonathan deletes the transient file.
3. **Claim.** The guardian signs up, verifies their email, and goes through 5.2.
4. **Link kids.** The guardian creates or links a child profile per legacy kid (nickname, optional
   profile PIN), authorizes each child's device(s). Kid rows record `child_profile_id` and
   `linked_at`.
5. **Optional.** Archive snapshot and/or welcome grant (section 3), only if approved.

Rollback is trivial because nothing existing is modified: delete the `legacy_*` rows and the new
family tables; Hop Quest is untouched throughout.

## 6. Risks and how this design handles them

| Risk | Handling |
| --- | --- |
| Account takeover by someone who guesses an email | Matching happens only after the guardian proves control of the address by one-time link; no legacy hint appears before that; responses are identical for known and unknown emails; per-email and per-IP limits kept in the database; tokens expire and are single use. |
| Legacy emails exposed by a database or backup leak | Only a peppered HMAC match key is stored; the pepper lives outside the database; plaintext exists only in a transient local file that is deleted after loading. |
| Two people claiming one legacy family | Atomic family-wide claim with a unique constraint; the loser sees the neutral screen; extra guardians are invited, never matched. |
| Importing untrusted progress | Not imported. Archive or fixed grant only, server-decided. |
| Weak 4-digit PIN protecting an internet login | PIN is a local profile lock on trusted devices only, rate-limited, lockable, never sufficient alone. |
| Hop Quest and BidaZoo coupling | None at runtime. The manifest is a one-time offline hand-off. No shared cookies, tokens, secrets, or database access. |
| Exposing children's data | No child email; nickname instead of legacy name; the manifest carries no names, credentials, or progress, and parent emails appear only as a keyed match key; audit log holds no secrets. |
| Shared-device session theft | Per-device sessions, per-device revoke, HttpOnly cookie, optional PIN lock for profile switching. |
| Rate-limit store is in memory (Checkpoint D) | Login/claim limits need to survive restarts. Prefer storing token attempts and lockouts in the database for these flows. |
| Email delivery dependency | Needs a transactional sender for BidaZoo (a new sending domain, not `send.jonabalos.com`). A decision, see below. |
| Children's-data law | Parental-consent flow and legal review required before real children use accounts. Not solved here. |

## 7. Open questions for the owner

1. **Email provider** for guardian links: reuse the existing provider account with a new
   BidaZoo sending domain, or another? (Must not reuse the jonabalos.com sending identity.)
2. **Legacy continuity:** archive only (recommended), or archive plus a fixed welcome grant?
3. **Child name:** may parents see the legacy first name during the claim screen? (This design
   avoids loading it; the parent types a nickname.)
4. **Trusted-device length and rules:** 90 days like guests, or longer with periodic guardian
   re-confirmation?
5. **Closed beta ordering:** is identity required for the first closed beta, or do beta testers
   start as guests and claim later? The deployment workstream (separate document) works either
   way, because the current guest model is unchanged.
6. **Consent and legal review** timing relative to inviting real children.
7. **Custody of `LEGACY_MATCH_PEPPER`:** where it lives on the Studio PC (same restricted
   `config` folder as the other secrets) and whether it is destroyed after the last family
   claims, which also permanently disables automatic matching.

## 8. Recommended next steps (all gated on approval)

1. Review and approve or amend this assessment.
2. Authorize an **Identity checkpoint (E)** with its own scope, tests, and Studio validation:
   guardian accounts, child profiles, device sessions, guest claim, audit events, then the legacy
   manifest loader and claim flow last.
3. Keep identity and deployment as separate rollback boundaries. Deployment of the *current*
   guest-only build (see DEPLOYMENT-CLOSED-BETA.md) does not depend on any of this.

## 9. What this assessment deliberately did not do

- No identity code, schema, migration, or test was written.
- No Hop Quest data was copied into this repository or written into these documents. Copies staged
  into the session's private cloud workspace for a structure-only inspection were deleted.
- No legacy cookie, token, hash, salt, or secret was printed, copied, or reused.
- The Accounts service, `jonabalos.com`, and every existing Caddy site and tunnel were left alone.
