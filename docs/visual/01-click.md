# 01 Click Production Sheet

Status: PROPOSED. Tags: LOCKED / CARRIED / PROPOSED / OPEN (see [00](00-master-direction.md)).

## Identity

| Trait | Tag |
| --- | --- |
| Orange/tan kangaroo | LOCKED |
| Platform host, guide, and mascot | LOCKED |
| Never selectable; not in the starter list | LOCKED |
| Never replaces the learner's chosen starter; guides alongside it | LOCKED |
| No invented birthplace or home region | Direction from project owner |

Click is not implemented in code today. No existing Clickaroo or Hop Quest artwork is reused
(Bible section 3). The reference roster image is the visual source.

## Carried from the reference art (CARRIED)

- Tall, upright ears with pink inner ear; expressive, friendly face; tan muzzle and belly.
- Orange body fur with darker orange shading; strong upright guide posture with a pointing or
  waving arm.
- Explorer gear: shoulder straps and a pack, with a round blue badge showing a letter "C".
- Big feet and a thick tail that read clearly in silhouette.

## Production notes (PROPOSED)

- **Role in frame.** Click stands beside or slightly behind the learner's starter and never takes
  its place. Click reads among the taller, larger characters (SPEC-LOCKED relative rule; exact numbers are
  PROVISIONAL, see [08](08-proportions-silhouettes.md)).
- **Silhouette signature.** Tall ears plus an upright lean plus a thick tail. At 48 px this must
  not be confused with Bronco's ears or Eagle's wings (see [08](08-proportions-silhouettes.md)).
- **Pack.** Click's gear is a satchel-style pack with a chest strap and the "C" badge, shaped
  differently from Dino's backpack so Dino's single backpack stays unique to Dino.
- **Face.** The friendliest, most open face of the cast. Eyes large and warm; mouth always
  smiling or gently encouraging. Never stern.
- **Hub presence.** Click greets at the Basecamp map room and points to routes.
- **Tone.** Encouraging, positive, knowledgeable, inclusive (as on the reference card).

## States

Core, implemented for starters today: `idle`, `happy`, `tryAgain`.
PROPOSED, not implemented, not locked: `ready`, `thinking`, `discover`, `cheer`, `proud`.
Click-only PROPOSED, not locked: `wave`, `point`.
See [07](07-expression-state-system.md).

## Click on selection screens (RESOLVED)

Click may appear on a profile or character-selection screen only as a host, guide, narrator,
helper, or a noninteractive (or separately interactive) guide element. The selectable starter set
stays exactly Dino, Koala, Tarsier, Eagle, Bronco. Exact placement is still OPEN (Bible section 3).

## Must not

- Be selectable, listed beside the starters, drawn as a selectable profile or avatar card, or take a
  starter slot.
- Replace or hide the learner's avatar.
- Carry a stated origin, flag, or home region.
- Copy any real mascot's face, costume, or pose.

## OPEN (from the Bible, section 3)

On-screen placement rules, how often Click appears, dialogue style, interaction pattern, and voice
or sound.

## Ingestion findings (production sheet 01)

Source: `01_Click_Character_Sheet.png`. Full catalog in [INGESTION-REPORT.md](INGESTION-REPORT.md).

- **Established by the render (CARRIED):** dark leather harness with yellow buckles, a back
  explorer pack with a paw-print patch, and a round chest emblem with a yellow "C" on blue.
- **Expressions shown:** Happy, Encouraging, Surprised, Thinking, Celebrate, Concerned. The action
  pose points ("Let's explore!"), which supports `point`. No wave is shown.
- **Scale:** on 07 Click is 1.00, equal to Bronco and taller than Dino, Koala, and Tarsier. The earlier
  "85 to 95 percent of a starter" guidance is withdrawn.
- **Sheet note:** "Not a starter character. Appears as host, guide and narrator throughout BidaZoo
  World Expedition." This matches the Bible.
- **RESOLVED (owner, October 12, 2026):** Click is NEVER selectable. The Profile Selection card and
  portrait chip that place Click among selectable options on `08` are a visual-concept error and are
  **NONCANONICAL**. Click himself is not redesigned because of it.
- **Colors:** fur orange differs between the 01 swatch, the 07 print, and the render. PROVISIONAL.
