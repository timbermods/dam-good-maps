# Glossary

The shared terms of Dam Good Maps, each defined once, with the decision that set it in [docs/decisions/](decisions/README.md). Where a meaning changed, the entry gives today's meaning and names the decision that changed it. Retired terms are not defined here; `tools/retired-terms.json` is the list CI enforces.


## The editor

**Force.** A force of nature that reshapes land from a gesture: Carve, Craterize, Quake, Erupt, Glaciate. It runs on its own copy of the map at ten steps a second, is bound only by nature, and its result is stored literally, so a replay never reruns it. ([D194](decisions/README.md), [D202](decisions/forces.md), [D206](decisions/README.md), [D246](decisions/README.md), [D320](decisions/README.md))

**Brush.** One of Raise, Lower, Flatten, Smooth, Naturalize: it paints land under a ring, and one stroke is one undo step. Raise, Lower and Flatten take a target level and work like the game editor's relative raise, relative lower and absolute flatten (item 37). ([D182](decisions/editor.md), [D184](decisions/editor.md), [D322](decisions/README.md))

**Selection.** The area the player marks with Select (Rectangle, Circle, Brush, Freehand or Wand). It is also the working area. ([D259](decisions/editor.md), [D254](decisions/README.md))

**Working area.** While a selection is active, every tool and force works only inside it; the rest is locked, dimmed, and unbreakable rock to the forces. Effects feather toward its edge. It is the selection. ([D254](decisions/README.md), [D259](decisions/editor.md))

**Wand.** Select's mode: a click on land selects the ground joined to it at that level; a click on water selects that river's or lake's visible water. A snapshot at the click. ([D261](decisions/README.md))

**Smart Lower.** A Lower stroke that starts in or beside water carves a bed that keeps flowing downhill; anywhere else it is an ordinary Lower. A new channel is about one tile deep, and a pass along an existing channel deepens it by exactly one level. ([D184](decisions/editor.md), [D263](decisions/README.md))

**Ride · Keep · Clear.** The brushes' three-way choice for sources under a stroke ("Sources: Ride · Keep · Clear", feedback item 31). Ride, the default, moves them with the ground (D249); Keep leaves them and the ground they stand on unchanged; Clear removes them. Old strokes replay exactly. ([D249](decisions/editor.md), [D322](decisions/README.md))

**Auto.** Every force detail behind More starts on Auto: the force picks from the land and the seed. Setting a detail pins it; a detail still on Auto shows the value it just took, with one click to pin it. Try another re-rolls only the details on Auto. ([D309](decisions/README.md))

**More (a force's).** The button at the end of a force's row that opens its details (Carve's width, depth, walls and wander, and so on). Closed by default; it remembers how it was left. ([D309](decisions/README.md))

**More (the strip's).** The last tile of the candidates strip: it makes further siblings in the background while the player keeps editing. ([D325](decisions/README.md), [D329](decisions/README.md))

**Floor (a force's).** A setting for every force that digs: the lowest level it ever cuts to (default 1, pinnable, not Auto). Where it stops a force, the result runs shallower. Not the starting-logs floor or the water floor. ([D321](decisions/README.md))

**Slow forces.** One toggle in the view bar beside Sound. Off is Fast: the land is final in about two seconds. On plays each force out slowly, about four times as long; a new gesture, Esc or a click jumps it to the final land. Nothing to do with the water's pace. ([D321](decisions/README.md), [D268](decisions/README.md))

**Show column.** The view switches at the map's top left (Heights, Lines, Markers, Flow, See-through, Badwater, Legend), each a checkbox row; Top-down, Reset view, Slow forces and Sound are at the top right (Layout 2). ([D184](decisions/editor.md), [D287](decisions/README.md), [D248](decisions/README.md))

**Shelf.** The controls around the map: the view bar, the tools, the forces, then the active tool's settings with More. Its left side places things (Water source, Badwater source, Start, trees and so on). The structure is item 9 (D323); the design pass styles it. ([D184](decisions/editor.md), [D226](decisions/README.md), [D323](decisions/README.md))

**Checks dot.** The small quiet dot that reports the map's checks. It sits beside Save to Timberborn and offers the one-click fixes. ([D184](decisions/editor.md), [D330](decisions/editor.md))

**Your maps.** The player's edited maps, kept in the browser until the player deletes them. Each reopens as it was left. It lives in the side panel; replacing an edited map saves it there first. ([D234](decisions/README.md), [D330](decisions/editor.md))

**Sources: Placed · None.** A water setting carried in share links. None generates as usual, then removes every water and badwater source and its water, keeping the dry valleys, basins and pits; on a real place it also removes the water floor's spring. The checks dot says "No water source" as information. ([D330](decisions/editor.md), [D331](decisions/README.md))


## The generator

**Intention.** Zero, one or two outcomes a map is steered toward, never built, each written as what a player finds. It only nudges the genome and the settler; a check on the finished map confirms it, and a failed one is dropped, never forced. ([D138](decisions/generator.md))

**Standout.** A map's standout intention: what gives it a character. Every map has at least one, and its one-line description names it. ([D273](decisions/generator.md), [D278](decisions/generator.md))

**The three outcomes.** What a candidate must meet: the theme's promise, at least one standout intention, and readable water. The generator's choice and the candidates strip use these three. ([D273](decisions/generator.md), [D278](decisions/generator.md), [D329](decisions/README.md))

**Theme's promise.** The signature each theme must show, checked like an intention: River Valley, a main river through a broad valley; Canyon, a river cut deep between cliffs; Highlands, high rugged ground with plateaus and valleys; Lake Basin, big lakes that dominate the water; Delta, a river splitting into channels; Islands, land broken into islands. Any makes no promise. Themes lean the generator and are not templates. ([D273](decisions/generator.md), [D208](decisions/product.md))

**Candidate.** A map the generator has built and is judging. The first that passes the absolutes is shown at once and never swapped; a later one that meets all three outcomes goes into the strip. ([D278](decisions/generator.md), [D325](decisions/README.md), [D329](decisions/README.md))

**Sibling.** Another map of the same theme, settings and intentions but different land, with its own share link, never a clone. Made by More in the candidates strip. ([D278](decisions/generator.md), [D325](decisions/README.md))

**Candidates strip.** The row of thumbnails in the side panel for generated maps: empty unless the shown map missed an outcome or More made siblings. A click opens one; the shown map never swaps by itself. ([D325](decisions/README.md), [D329](decisions/README.md), [D330](decisions/editor.md))

**Source group, source row.** Water and badwater sources come in rows and clusters as in the official maps: for clean water, a row across the flow at a river's head with the strength shared; for badwater, a single source or a close pair. It applies where a tool places sources itself (the generator, Real places, Carve's source, Glaciate's meltwater). A source from the shelf stays single, and Unleash places none. The rule is `src/core/water/sourceGroups.ts`. ([D314](decisions/README.md))

**Tall map.** A map whose land rises above level 16, up to 22. Any map that goes above 16 simply becomes tall (its description says so, and it is exported and validated as tall), and is standard again if editing brings it back to 16 or below. ([D172](decisions/README.md), [D244](decisions/README.md))

**Ceiling.** The highest level any tool that raises land may reach: 22, on every map, and nothing in the interface shows it. Generation is separate: its Verticality setting decides how tall a generated map gets. ([D244](decisions/README.md), [D172](decisions/README.md))


## Rules and floors

**The absolutes.** What must never fail: the map plays exactly right in Timberborn, what you see is what you get, and the starting-logs floor. For generated maps D325 adds item 47's must-haves. Everything else is judged by Kyler's eye. Real places take only the floors, and only where they don't change the real land. ([D245](decisions/real-places.md), [D325](decisions/README.md), [D331](decisions/README.md))

**Starting-logs floor.** The logs reachable on foot within about 40 tiles' walk of the start, at every difficulty, computed from the game's own data: the worst viable route to a Forester plus the first essentials plus 10%, never below 120 (178 for 1.1.2.4). Pinned in `src/core/data/log-floor.json`. "The floor" alone means this one. ([D224](decisions/generator.md), [D227](decisions/README.md))

**Water floor.** Like the starting-logs floor, for Real places: every place has water a pump can reach from the start. Where a place has none in its square, one natural spring stands where the land drains near the start, the smallest that works. ([D300](decisions/README.md), [D331](decisions/README.md))

**A place's signature.** The feature a real place is known for. It is the focal point of the map, and a place is judged on whether someone who knows it recognises it. Real places keep the real land. ([D245](decisions/real-places.md), [D306](decisions/README.md), [D331](decisions/README.md))

**The probe.** The DGM Probe: the runner that launches Timberborn for an automated batch to check that the game loads maps and their water as the tools say. Claude runs it only after asking Kyler in chat and getting his yes for that batch. ([D117](decisions/how-we-work.md))

**Re-pin.** Updating the tests and golden fixtures that pin exact map results after a deliberate change to generated maps. Done once for a set of changes, with one set of batches, not once per change. ([D308](decisions/README.md), [D325](decisions/README.md))
