# Copy: every string a child reads

Rule 7 of the plan of record: text a kid reads is owner-approved before deploy. Every new string lands here as
**PENDING**. Nothing PENDING is deployed until the owner marks it APPROVED (or rewrites it). Placeholders such as
`{n}` are filled by the game.

Status values: PENDING (placeholder, not approved), APPROVED, CHANGED (owner rewrote it; the new text is in the row).

## Encounters (Lane A, merged `573068b`)

Reused unchanged from RunScene (already live): "Getting your question…", "Checking…", "Can’t reach BidaZoo.",
"Something went wrong.", "Try again", "Continue", "Not quite. The answer is {n}".

| String | Where | Status |
| --- | --- | --- |
| Strike! | Feedback, correct answer | PENDING |
| Quick strike! | Feedback, correct and fluent | PENDING |
| Special move! Double strike! | Feedback, special move | PENDING |
| {Buddy name}’s special move! | Banner during a special move | PENDING |
| Special move ready! | Feedback while the meter is full | PENDING |
| Beacon lit! | End banner, node won | PENDING |
| Nice try! The path goes on. | End banner, node lost | PENDING |
| You beat the summit challenger! | End banner, boss won | PENDING |
| Good climb! Keep going. | End banner, boss lost | PENDING |
| Last stand! Answer the rest of the questions. | Banner when the boss's hearts reach 0 with questions left | PENDING |
| Last stand | Feedback line during last-stand questions | PENDING |
| Correct! | Feedback, correct last-stand answer | PENDING |
| Hearts {h} of 3. Strikes {s} of {n}. Charge {c} of 3. | Screen-reader status line | PENDING |
| Ridge Takin | Great Wall node challenger name | PENDING |
| Can you climb past me? | Node challenger taunt | PENDING |
| These steps are mine to guard! | Node challenger taunt | PENDING |
| Show me your best math! | Node challenger taunt | PENDING |
| Summit Snow Leopard | Great Wall boss name | PENDING |
| Only the bravest reach the top! | Boss taunt | PENDING |
| Five questions stand between you and the summit. | Boss taunt | PENDING |

## Expedition, map board and summit (Lane B, `lane/expedition` at `67ce214`, not merged yet)

| String | Where | Status |
| --- | --- | --- |
| Open the map | Basecamp hotspot chip | PENDING |
| Visit the lodge | Basecamp hotspot chip | PENDING |
| Look at the banner | Basecamp hotspot chip | PENDING |
| Choose your expedition | Map board title | PENDING |
| The seven destination names | Map tiles (in the manifests) | PENDING |
| Open from the start. | Great Wall unlock rule | PENDING |
| Earn the Great Wall stamp. | Petra unlock rule | PENDING |
| The other five unlock rules | Locked map tiles (in the manifests) | PENDING |
| Light 5 beacons, then reach the summit. | Trailhead card | PENDING |
| Back / Start | Trailhead card buttons | PENDING |
| Hold left or right to walk | Path hint | PENDING |
| Nice view. Ready to go on? | Rest-bench buddy quip | PENDING |
| The expedition could not start. | Path error panel | PENDING |
| Something went wrong with the question. | Path error panel | PENDING |
| Try again / Back to Basecamp | Path error panel buttons | PENDING |
| {n} of 5 beacons lit | Summit card | PENDING |
| {n} of {m} correct | Summit card | PENDING |
| +{x} XP +{y} coins | Summit card | PENDING |
| Your results are not ready yet. | Summit card | PENDING |
| {n} of {m} artifacts found | Summit card | PENDING |
| Basecamp / Again | Summit card buttons | PENDING |
| Close the map, Go to the next stop, and the other screen-reader labels | Scene and overlay files | PENDING |
| Challenger names and taunts per destination | Destination manifests (not shown on the path yet) | PENDING |

## Content (Lane D)

Imported Hop Quest math items (372, owner-owned bank) are shown as written in the bank. No new interface strings.

## Progression and gear (Lane C, C3 merged with the outfitter)

Item names and prices are placeholders. A full, perfect session earns about 30 coins, so items cost 1 to 4 sessions.

| String | Where | Status |
| --- | --- | --- |
| Sun Hat (20 coins) | Gear: hat | PENDING |
| Ranger Hat (40 coins) | Gear: hat | PENDING |
| Wool Beanie (60 coins) | Gear: hat | PENDING |
| Explorer Helmet (90 coins) | Gear: hat | PENDING |
| Red Scarf (15 coins) | Gear: scarf | PENDING |
| Striped Scarf (30 coins) | Gear: scarf | PENDING |
| Woven Scarf (50 coins) | Gear: scarf | PENDING |
| Silk Scarf (80 coins) | Gear: scarf | PENDING |
| Bamboo Stick (25 coins) | Gear: trail stick | PENDING |
| Oak Trail Stick (45 coins) | Gear: trail stick | PENDING |
| Lantern Stick (70 coins) | Gear: trail stick | PENDING |
| Compass Stick (100 coins) | Gear: trail stick | PENDING |
| Outfitter | Outfitter title | PENDING |
| Hats / Scarves / Trail Sticks | Outfitter section labels | PENDING |
| Owned / Wearing / Close | Outfitter card states and button | PENDING |
| Opening the outfitter... | Outfitter loading line | PENDING |
| The outfitter is closed right now. Come back soon! | Outfitter unavailable | PENDING |
| Not enough coins yet. Play a run to earn more! | Purchase refused | PENDING |
| That did not work. Please try again. | Outfitter error | PENDING |
| Outfitter. You have {n} coins. Tap an item to buy it, wear it, or take it off. | Screen reader | PENDING |
| Buy {name} for {price} coins / Wear {name} / Take off {name} / Close the outfitter | Screen reader | PENDING |
| Not enough coins. | API error message (shown through the outfitter) | PENDING |
