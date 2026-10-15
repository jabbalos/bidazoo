# 14 DO / DON'T Anti-Drift Guide

Status: PROPOSED. Use as a checklist at every review. Items tagged LOCKED come from the Bible.

## Project and cast

| DO | DON'T |
| --- | --- |
| Call the project **BidaZoo World Expedition** | Rename it to Adventure Academy |
| Keep exactly five selectable starters (LOCKED) | Add, merge, or blend characters |
| Keep Click the host, never selectable (LOCKED) | Put Click in the starter list or let Click replace the learner |
| Keep Dino to exactly one backpack, no second bag, no chest pack, no duplicate backpack (LOCKED) | Add anything that visually reads as a second bag, chest pack, or duplicate backpack |
| Keep Koala free of a backpack (LOCKED) | Add anything that reads as a backpack. Other accessories stay OPEN. |
| Keep Tarsier small with huge eyes and goggles (LOCKED) | Shrink the eyes or drop the goggles |
| Keep Eagle white-headed, brown-winged, in a green varsity jacket with an original "A" (LOCKED) | Copy any school letter, crest, or mascot |
| Keep Bronco's bandana maroon (LOCKED) | Drift the bandana to bright red or drop it |
| Retain established reference traits that do not conflict (hat, fedora, hood) | Remove a reference trait only because the Bible is silent |
| Give Click no invented birthplace | Assign Click a home region or flag |

## Characters and states

| DO | DON'T |
| --- | --- |
| Keep head size and silhouette constant across states | Change a character's proportions to show emotion |
| Make `tryAgain` gentle and encouraging | Show tears, red X marks, or angry faces |
| Soften Eagle's brows in `tryAgain` | Let Eagle look aggressive |
| Pass the 48 px silhouette test | Rely on color alone to tell characters apart |
| Mark new states PROPOSED until reviewed | Mark proposed states LOCKED or implement them early |

## Worlds and environment

| DO | DON'T |
| --- | --- |
| Use recognizable-place inspiration with original shapes | Copy a theme-park or copyrighted rendition |
| Use grounded timber, stone, canvas, bamboo, brass | Use castles, turrets, princess or fairy-tale architecture |
| Use maps, routes, paths, and discovery cues | Use generic fantasy kingdom scenery |
| Keep heritage subtle, tasteful, and abstract across the hub | Make the whole platform exclusively Filipino-themed |
| Treat the Philippine destination as the strongest explicit expression | Reduce any culture to a costume or a single prop |
| Keep backdrops contrasting with characters | Camouflage Dino, Koala, Eagle, Bronco, or Tarsier |

## UI

| DO | DON'T |
| --- | --- |
| Use the field-journal and map-table language | Use glossy app chrome or preschool clip-art |
| Keep 44 px minimum tap targets | Shrink targets for decoration |
| Use orange/amber for a miss (RESOLVED) | Use red failure styling or a red X |
| Keep hit-target ids, rectangles, and `data-*` attributes | Change geometry the tests read |

## Code and scope boundaries

| DO | DON'T |
| --- | --- |
| Keep this visual-production phase presentation only | Let destination or starter choice change difficulty, grading, timing, mastery, XP, coins, or progression in this phase |
| Leave future destination uses (navigation, curriculum grouping, game selection, story progression, unlocks, routing) OPEN | Lock those product decisions in or out through the visual guide |
| Keep assets in `games/zoo-sprint/assets/world-expedition/` | Add a `packages/assets` dependency yet |
| Keep the code-drawn art as a fallback | Replace art in code without review |
| Leave account UI, `apps/play/src/account/*`, `account.html`, guardian/device/legacy routes, auth cookies, schema, identity contracts, SMTP, deployment, and `C:\BidaZoo-beta\app` untouched | Edit any of them |
| Use docs-only commits for docs | Mix docs and code in one commit |

## Review checklist before approving any art

1. Does it pass every LOCKED rule above?
2. Does it pass the 48 px silhouette test?
3. Is the palette within [09](09-palette.md)?
4. Has the look-alike review been done for the Eagle "A", Bronco star, and destinations?
5. Does it read against its backdrop?
6. Is there a static fallback?

## Added by the production pack ingestion

| DO | DON'T |
| --- | --- |
| Keep Eagle's eyes blue (RESOLVED); treat code yellow as transitional | Carry the yellow code eyes into production art |
| Resolve render color disagreements by the order: sheets 01–06, 07, 00, legacy board, code | Average colors or lock a hex early |
| Treat nonmatching package environments as mood/composition/material/lighting reference only | Rename or merge a canonical destination from a render |
| Keep Click out of every selectable list, profile picker, and chip row of starters (LOCKED) | Draw Click as a profile or avatar choice beside the five starters |
| Show Click as host and guide only | Give Click a birthplace or home region |
| Keep Eagle's head clearly white at gameplay and portrait size (LOCKED; crest correction required in the future render) | Treat the sweeping brown crest as canonical |
| Make the Bronco bandana read as maroon (LOCKED, RESOLVED) | Let it read as crimson or bright red in final art |
| Keep Dino's spikes reading as orange (LOCKED) | Push them toward red |
| Keep Dino's chest strap visibly part of the one backpack | Let any strap or pouch read as a second bag |
| Treat 07's height lineup as a PROVISIONAL working reference; keep Tarsier smallest and Click/Bronco among the taller | Treat the numbers or printed head counts as canonical |
| Note when two production sheets disagree and report it | Average, merge, or invent a compromise |
| Lock semantic color identities; mark hex values PROVISIONAL until the owner approves a palette | Treat sampled or printed hex as final |
| Treat Click-as-selectable on sheet 08 as NONCANONICAL | Copy the Click profile card or chip |
| Use gentle determination for `tryAgain`; use the orange/amber miss language | Use a red X panel, or any angry, ashamed, distressed, punished, or disappointed look |
| Keep presentation states and motion animations as two vocabularies | Put `run` or `jump` in the expression-state list |
| Name the hub **BidaZoo World Expedition Basecamp**; use the owner's seven destinations | Use "Horizon Basecamp", or let render 09 override the lineup |
| Require cultural review for all seven destinations | Treat a destination as cleared because a concept exists |
| Keep human look-alike review for the Eagle "A", Bronco star, hat band | Remove common symbols merely because they are common |
| Keep the product name BidaZoo World Expedition | Use Adventure Academy as the product name (it may be an in-world facility only, never dominating hub branding) |
