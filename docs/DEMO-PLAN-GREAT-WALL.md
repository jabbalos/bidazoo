# Demo plan: Great Wall Expedition (the first real destination)

Owner decision, Sunday, November 8, 2026, 1:45 AM CST: build one real destination end to end so BidaZoo
reads as a game, not a quiz with a mascot. Great Wall first. This file is the source of truth for the build
sessions; chat history is not.

Live today (`390e0b4` on play.bidazoo.com): Choose a buddy, walk a 1.5-screen Basecamp, step into a gate,
answer 10 tap questions with buddy reactions, see a Results card. Everything below wraps that; nothing below
replaces the server-authoritative session, grading, XP or coins.

## What the kid experiences (the demo)

1. **Basecamp.** Walk to the **map board** (already drawn in the painted plaza): it opens as a card showing
   the seven destinations. Great Wall is unlocked; the rest are locked silhouettes with a padlock. Tap Great
   Wall. (The gate still works and still starts a plain run; the map is the new front door.)
2. **Trailhead.** A one-line card: "Great Wall Expedition: 5 challenges to the summit beacon." Tap Go.
3. **The path.** A side-scrolling painted ridge, 6 to 8 screens long (three parallax layers: misty peaks,
   ridge wall with beacons, near trees and stair rails; palette and rules from
   [visual/12](visual/12-destination-worlds.md) section 1 and [visual/11](visual/11-environment-style.md)).
   Same controls as Basecamp (hold a side, arrow keys). Along the path:
   - **5 encounter nodes** (a beacon platform each). Walking onto one opens a **challenge**: two questions
     from the live session, in the existing question UI, with the painted expressions. Pass or fail, the
     node lights its beacon and the path continues. 5 nodes x 2 questions = the existing 10-question
     session, unchanged on the server.
   - **5 artifacts** between the nodes (a lantern, a tally stone, a brush, a kite, a compass): walk through
     one to collect it, with a chime and a counter in the HUD.
   - A **streak counter** in the HUD; three correct in a row makes the buddy cheer.
4. **Summit.** At the last beacon the Results logic runs as today (XP, coins, mastery), presented as a
   **summit card**: beacon lit, artifacts shown, and a **passport stamp** slammed onto a Great Wall page.
   "Next: Petra Rose Canyon unlocks at 3 stamps" (or the rule below). Back to Basecamp lands at the map board.
5. **Basecamp afterwards.** The map board shows the stamp on Great Wall. Tapping the lodge opens the
   **passport**: one page per destination, artifacts collected, best streak.

Unlock rule for the demo: Great Wall unlocked for everyone; Petra unlocks after one Great Wall stamp; the
other five stay locked ("coming soon"). Replaying Great Wall is always allowed and re-stamps the page.

## What it is not (demo non-goals)

- No new question content, no grading change, no XP or coin formula change, no identity or family changes.
- No free-roaming 2.5D or 3D world. One scrolling path per destination. The 3D ambition stays a later track.
- No second destination built; Petra exists only as an unlockable silhouette on the map.
- No new art style. Painted-v1 rules, Character Bible LOCKED rules, Nunito Sans.

## Architecture (small, additive)

- **Client (games/zoo-sprint):** new `ExpeditionScene` (the path) reusing Basecamp's walker, parallax and
  input code (extract shared pieces into `presentation/` rather than copying); the challenge UI is the
  existing RunScene question/feedback components hosted inside the expedition (RunScene stays for the gate's
  plain run). New `SummitScene` (Results presented as a summit card; reuse ResultsScene's data path). Map
  board and passport are overlays on BasecampScene. Flow: Menu -> Basecamp -> (map) -> Expedition -> Summit
  -> Basecamp.
- **Server (apps/api), one additive migration:** `StartPlaySessionRequest.destination?: 'great-wall'`
  stored on the play session; `GET /api/v1/me/expedition` returns `{ stamps: { 'great-wall': { count, bestStreak,
  artifacts } }, unlocked: ['great-wall', ...] }` derived from completed sessions plus an `expedition_events`
  table for artifacts (one row per collected artifact per session; written through the existing session
  routes, never trusted from the client for XP or coins). Nothing else changes. Guests keep working exactly
  as today (progress keyed the way sessions already are).
- **Content:** `games/zoo-sprint/assets/world-expedition/destinations/great-wall/` with `manifest.json`
  (layers, node and artifact positions as fractions of path length, palette) and `PROVENANCE.json` per file,
  same conventions as `basecamp/`. Code-drawn fallbacks for every asset, as the Basecamp has.
- **Audio:** `assets/audio/` with CC0 sources only (Kenney or equivalent), credits in `CREDITS.md`: a music
  bed, step, collect, correct, wrong, beacon-lit, stamp. Muted by default on first launch with a visible
  toggle; the choice persists per device.
- **QA hooks:** `data-scene`, `data-node`, `data-artifacts`, `data-streak`, `data-stamp`, like the Basecamp
  hooks, so Playwright can drive the path without pixel-hunting.

## Build sessions (three; each ends with something the owner plays on his phone)

| Session | Builds | Done when |
| --- | --- | --- |
| **S1: playable path** (Sonnet) | ExpeditionScene with code-drawn placeholder art, 5 nodes hosting the real 10-question session, 5 artifacts, HUD with streak, Summit card with the real results, map board card opening the expedition. Server: the `destination` field and `/me/expedition`. | The owner plays Great Wall start to summit on his phone from the local preview. |
| **S2: look and feel** (Sonnet; art through the owner's OpenArt pipeline) | Three painted ridge layers, node beacons, 5 artifact sprites, summit and stamp art, passport page, map board art; all seven sounds and the music bed; transitions and challenge countdown. | Side-by-side with the Basecamp it reads as one game. |
| **S3: hub, hardening, ship** (Sonnet build, Fable review) | Passport overlay, unlock rule, Petra silhouette, phone and rotation checks, Playwright coverage for the path (one spec), integration tests for the migration and endpoint, docs. One Studio validation, one deploy. | `PASS` on the Studio PC; live on play.bidazoo.com; the owner's kids play it unprompted for 20 minutes. |

Rules for the sessions, from the owner: build on `feature/great-wall-expedition` off the validated `390e0b4`;
no checkpoint reports to approve between sessions (the playable build is the report); no backups discussed
beyond the one the deploy script already takes; no renaming anything in the Character Bible; ask before
inventing content (question text, destination facts, names). Validation counts will change; update
`STUDIO-VALIDATION.md` in S3 with the new baseline.

## Model use

Sonnet for the build sessions (pattern-following work against this spec and the existing code). Fable (or
Opus) for two things only: this spec, and the S3 review before validation. Do not spend Fable on build loops.

## Risks to say out loud

- Art generation is the long pole in S2; if the ridge layers take more than two passes, ship S2 with the best
  pass and iterate after the demo. Fallbacks mean the game never breaks on missing art.
- Challenges hosted inside the expedition must keep the same a11y live region and the same QA hooks the
  existing tests rely on; S1 runs `play.spec.ts` and `basecamp.spec.ts` before handing over.
- Sound on iPad Safari needs a user gesture before playback; the Go button on the trailhead card is that gesture.
