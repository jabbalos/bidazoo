# Copy: every string a child reads

Rule 7 of the plan of record: text a kid reads is owner-approved before deploy. Every new string lands here as
**PENDING**. Nothing PENDING is deployed until the owner marks it APPROVED (or rewrites it). Placeholders such as
`{n}` are filled by the game.

All rows below were APPROVED by the owner on November 10, 2026 (validator run 20261110-161337 follow-up).

Status values: PENDING (placeholder, not approved), APPROVED, CHANGED (owner rewrote it; the new text is in the row).

## Encounters (Lane A, merged `573068b`)

Reused unchanged from RunScene (already live): "Getting your question…", "Checking…", "Can’t reach BidaZoo.",
"Something went wrong.", "Try again", "Continue", "Not quite. The answer is {n}".

| String | Where | Status |
| --- | --- | --- |
| Strike! | Feedback, correct answer | APPROVED |
| Quick strike! | Feedback, correct and fluent | APPROVED |
| Special move! Double strike! | Feedback, special move | APPROVED |
| {Buddy name}’s special move! | Banner during a special move | APPROVED |
| Special move ready! | Feedback while the meter is full | APPROVED |
| Beacon lit! | End banner, node won | APPROVED |
| Nice try! The path goes on. | End banner, node lost | APPROVED |
| You beat the summit challenger! | End banner, boss won | APPROVED |
| Good climb! Keep going. | End banner, boss lost | APPROVED |
| Last stand! Answer the rest of the questions. | Banner when the boss's hearts reach 0 with questions left | APPROVED |
| Last stand | Feedback line during last-stand questions | APPROVED |
| Correct! | Feedback, correct last-stand answer | APPROVED |
| Hearts {h} of 3. Strikes {s} of {n}. Charge {c} of 3. | Screen-reader status line | APPROVED |
| Ridge Takin | Great Wall node challenger name | APPROVED |
| Can you climb past me? | Node challenger taunt | APPROVED |
| These steps are mine to guard! | Node challenger taunt | APPROVED |
| Show me your best math! | Node challenger taunt | APPROVED |
| Summit Snow Leopard | Great Wall boss name | APPROVED |
| Only the bravest reach the top! | Boss taunt | APPROVED |
| Five questions stand between you and the summit. | Boss taunt | APPROVED |

## Expedition, map board and summit (Lane B, merged `a4111a2`)

| String | Where | Status |
| --- | --- | --- |
| Open the map | Basecamp hotspot chip | APPROVED |
| Visit the lodge | Basecamp hotspot chip | APPROVED |
| Look at the banner | Basecamp hotspot chip | APPROVED |
| Choose your expedition | Map board title | APPROVED |
| The seven destination names | Map tiles (in the manifests) | APPROVED |
| Open from the start. | Great Wall unlock rule | APPROVED |
| Earn the Great Wall stamp. | Petra unlock rule | APPROVED |
| The other five unlock rules (Andes changed to "Earn the Petra stamp." to match the server, which opens destinations in order) | Locked map tiles (in the manifests) | APPROVED |
| Light 5 beacons, then reach the summit. | Trailhead card | APPROVED |
| Back / Start | Trailhead card buttons | APPROVED |
| Hold left or right to walk | Path hint | APPROVED |
| Nice view. Ready to go on? | Rest-bench buddy quip | APPROVED |
| The expedition could not start. | Path error panel | APPROVED |
| Something went wrong with the question. | Path error panel | APPROVED |
| Try again / Back to Basecamp | Path error panel buttons | APPROVED |
| {n} of 5 beacons lit | Summit card | APPROVED |
| {n} of {m} correct | Summit card | APPROVED |
| +{x} XP +{y} coins | Summit card | APPROVED |
| Your results are not ready yet. | Summit card | APPROVED |
| {n} of {m} artifacts found | Summit card | APPROVED |
| Basecamp / Again | Summit card buttons | APPROVED |
| Close the map, Go to the next stop, and the other screen-reader labels | Scene and overlay files | APPROVED |
| Challenger names and taunts per destination | Destination manifests (not shown on the path yet) | APPROVED |

## Content (Lane D)

Imported Hop Quest math items (372, owner-owned bank) are shown as written in the bank. No new interface strings.

## Progression and gear (Lane C, C3 merged with the outfitter)

Item names and prices are placeholders. A full, perfect session earns about 30 coins, so items cost 1 to 4 sessions.

| String | Where | Status |
| --- | --- | --- |
| Sun Hat (20 coins) | Gear: hat | APPROVED |
| Ranger Hat (40 coins) | Gear: hat | APPROVED |
| Wool Beanie (60 coins) | Gear: hat | APPROVED |
| Explorer Helmet (90 coins) | Gear: hat | APPROVED |
| Red Scarf (15 coins) | Gear: scarf | APPROVED |
| Striped Scarf (30 coins) | Gear: scarf | APPROVED |
| Woven Scarf (50 coins) | Gear: scarf | APPROVED |
| Silk Scarf (80 coins) | Gear: scarf | APPROVED |
| Bamboo Stick (25 coins) | Gear: trail stick | APPROVED |
| Oak Trail Stick (45 coins) | Gear: trail stick | APPROVED |
| Lantern Stick (70 coins) | Gear: trail stick | APPROVED |
| Compass Stick (100 coins) | Gear: trail stick | APPROVED |
| Outfitter | Outfitter title | APPROVED |
| Hats / Scarves / Trail Sticks | Outfitter section labels | APPROVED |
| Owned / Wearing / Close | Outfitter card states and button | APPROVED |
| Opening the outfitter... | Outfitter loading line | APPROVED |
| The outfitter is closed right now. Come back soon! | Outfitter unavailable | APPROVED |
| Not enough coins yet. Play a run to earn more! | Purchase refused | APPROVED |
| That did not work. Please try again. | Outfitter error | APPROVED |
| Outfitter. You have {n} coins. Tap an item to buy it, wear it, or take it off. | Screen reader | APPROVED |
| Buy {name} for {price} coins / Wear {name} / Take off {name} / Close the outfitter | Screen reader | APPROVED |
| Not enough coins. | API error message (shown through the outfitter) | APPROVED |
