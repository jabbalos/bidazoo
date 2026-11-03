# 07 Facial Expression and State System

Status: PROPOSED. Only `idle`, `happy`, and `tryAgain` exist in code today. All other states are
proposals, not locked, and not implemented.

**Owner decisions applied (October 12, 2026).** `tryAgain` is **GENTLE DETERMINATION** (RESOLVED).
Presentation states and motion animations are **two separate vocabularies** (RESOLVED, section 2b).

## 1. Principles

1. A miss is never a punishment. `tryAgain` means **gentle determination** (RESOLVED): encouraged,
   focused, resilient, ready to try again. The sheet-07 *Determined* expression is usable as a
   reference only if it reads that way. It must NOT read angry, ashamed, distressed, punished, or
   visibly disappointed in the learner.
2. Head size, silhouette, and every locked identity trait stay constant across all states.
3. Expression changes only three things: eyes, brows, mouth (plus a small body cue).
4. Every state must read at 48 px. If it needs detail to read, simplify it.
5. In this phase, states are presentation only. They never imply anything about difficulty,
   mastery, XP, or coins.

## 2. States

| State | Status | Meaning | Eyes | Brows | Mouth | Body cue |
| --- | --- | --- | --- | --- | --- | --- |
| `idle` | Implemented | Resting, friendly | Open, forward | Neutral | Soft smile | Relaxed |
| `happy` | Implemented | Celebrating a correct answer | Bright, slightly narrowed | Raised | Open smile | Small hop |
| `tryAgain` | Implemented (tone RESOLVED: gentle determination) | Encouraged, ready to try again | Steady, focused, forward | Softly level or lifted, never furrowed hard | Small calm smile or set mouth | Light head wobble or a small resolute nod |
| `ready` | PROPOSED | About to start a run | Wide, focused | Level | Small set smile | Lean forward |
| `thinking` | PROPOSED | Considering a question | Looks up and aside | One brow up | Closed, small | Head tilt |
| `discover` | PROPOSED | Found something new | Widest | High | Small open "oh" | Point or lean |
| `cheer` | PROPOSED | Big celebration (run finished well) | Closed-happy arcs | High | Big open smile | Arms or wings up |
| `proud` | PROPOSED | Results screen, steady achievement | Warm, half-lidded | Relaxed | Closed smile | Chest out |
| `wave` | PROPOSED, Click only | Greeting | Open | Raised | Smile | Arm wave |
| `point` | PROPOSED, Click only | Showing a route or option | Open, toward target | Raised | Smile | Arm point |

## 2b. Two vocabularies (RESOLVED)

**Presentation / emotional states** (this document; candidates, not every character needs every one):
`idle`, `happy`, `tryAgain`, `thinking`, `cheer`, `discover`, `ready`, `proud`, `point`, `wave`.

**Motion / gameplay animations** (separate; see [13](13-phaser-asset-spec.md)): `idle-loop`, `run`,
`jump`, `land`. More may be proposed later. `run` and `jump` are NOT expression states and must not
appear in the list above. `idle` (a presentation pose) and `idle-loop` (a motion cycle) are different
things and may be different assets.

## 3. Per-character tells (PROPOSED)

| Character | Primary expression channel | Watch out for |
| --- | --- | --- |
| Click | Ears and arms | Never stern or flat |
| Dino | Wide eyes and mouth | Keep spikes visible in every state |
| Koala | Brows over glasses, small mouth | Keep eyes visible behind lenses |
| Tarsier | Eyes (highlights, gaze) | Do not shrink the eyes; soften the gaze |
| Eagle | Brows and head angle | Brows must soften in `tryAgain`; never scowl. The head must still read white. |
| Bronco | Ears and mane movement | Keep the bandana level and visible |

## 4. Expression parameters (PROPOSED)

Define each state by these knobs so the five starters stay consistent:

- `eyeOpen` 0 to 1, `gazeX` and `gazeY` in -1 to 1.
- `browInner` and `browOuter` height offsets.
- `mouthShape` in {smile, openSmile, mild, oh, closed}.
- `headTilt` in degrees (limit to plus or minus 9).
- `bodyCue` name.

## 5. Motion timing (PROPOSED, based on the current code)

The current `celebrate()` is a 160 ms hop with a 1.12x scale yoyo. `wobble()` is a plus or minus 9
degree shake, three passes of 90 ms. Production motion keeps these durations as the baseline so
gameplay pacing does not change.

## 6. Reduced motion

Every animated state needs a static single-frame fallback. Honor reduced-motion preferences.

## 7. Not allowed in any state

Tears, angry or sneering faces, shame, distress, a punished or visibly disappointed look, shaking
that looks like fear, or any face that implies the child failed. (The Eagle's TRY AGAIN in the
production matrix reads stern; that is flagged, not adopted.) The red X error panel is REJECTED (see
[10](10-ui-component-style.md)).

## 8. Ingestion findings (production sheet 07)

Source: `07_Expressions_Proportions_Palettes.png`. Full detail in
[INGESTION-REPORT.md](INGESTION-REPORT.md) section 4. No expression is forced into a state that its
visual does not clearly support.

The 07 matrix has six columns for all six characters: IDLE (Neutral), HAPPY (Joyful), THINKING
(Curious), CELEBRATE (Excited; the header prints "CELERRATE"), SURPRISED (Wow), TRY AGAIN
(Determined).

| State | Verdict from the renders |
| --- | --- |
| `idle` | Clearly supported by IDLE (Neutral) |
| `happy` | Clearly supported by HAPPY (Joyful); every sheet has a Happy |
| `tryAgain` | Supported **as Determined** (fists, furrowed brows, smirks). RESOLVED: use as reference only where it reads gentle determination; soften furrowed brows and stern looks. Click's "Concerned" is softer but is not in 07. |
| `ready` | Not supported by any clear visual |
| `thinking` | Clearly supported by THINKING (Curious) |
| `discover` | Only partly supported (SURPRISED; Tarsier binoculars; Dino Curious). Not forced. |
| `cheer` | Clearly supported by CELEBRATE (Excited) |
| `proud` | Not supported by any clear visual |
| `wave` (Click) | Not shown |
| `point` (Click) | Supported by Click's pointing action pose |

All of these remain PROPOSED, not locked, and not implemented. A *Surprised* expression appears for
all six characters and could be proposed as a new state later; that is an observation, not a
decision. Character-specific expressions in the per-character sheets (Click Encouraging and
Concerned; Koala Focused, Analytical, Kind; Tarsier Observant, Playful; Eagle Bold, Determined;
Bronco Energetic, Resilient, Determined) are not part of the 07 matrix.
