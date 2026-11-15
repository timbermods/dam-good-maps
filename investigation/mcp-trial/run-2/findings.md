# MCP trial 2 findings (no-source rule kept: only initialize/tools/list/tool results used)

## Costly
1. twin-falls never emerged in 19 generates (canyon small/128, waterfalls many, riverValley, highlands, any; seeds 1-22). Description: "for 'a canyon with two waterfalls side by side', give {theme: canyon, intentions: [twin-falls]}" and "To try again for it, call generate with the same input and another seed". Following the example literally + retrying seeds did not work; no hint of hit-rate, no alternative (e.g. forceResult carve with settings.fall twice) offered. Ended with a canyon map without the twin falls and told the player so.
2. Open-map limit is silent: map-1..map-13 vanished ("There is no open map "map-1": the open maps are map-14..19"). Nowhere in descriptions. Had to regenerate from the same seed (which worked: same map).
3. save default folder does not exist here: "Timberborn's Maps folder was not found at /root/Documents/Timberborn/Maps: give the folder to save in" (description presents it as the default, no hint it may be missing). One wasted call.
4. save `name` ignored in file names: description "The files are named dgm- and the map's name in lower case with hyphens"; I gave name "Hollow Gorge", files were dgm-canyon-1808392761.* . Unclear whether the name was applied inside the project.
5. craterize size 16 changed 512 tiles over x10-40,y0-29 and moved the start (I had not yet moved it; order of my ops was my error but the "size: tiles across" text reads as local). The bowl is a very wide shallow dip: hard to see in the map picture.
6. moveEntity start refusals ("on an object", "in a river") give no nearby free tile; 3 guesses needed. Moving the start onto a tree succeeded elsewhere by felling trees silently-ish (reported in result "removed Pine 4, Oak 2"), but refused on a tree at (40,19): inconsistent ("on an object" vs felled).
7. No way to know the start entity id except describe -> objects (StartingLocation). Not stated in moveEntity text. Found by luck of reading describe.

## Smaller
- check output is huge: "advice" lists every berry bush id and tile (several KB). Cut or cap.
- apply picture:true returns no picture when no ground changed (placeEntity WaterSource), yet water changed (+238 wet tiles). Had to call picture.
- apply picture:true for a carve returned a picture of only the changed area; fine, but axes labelled differently every time (grid every 4 vs 8).
- Ambiguity in ask 3: "that project" is the saved pre-carve state, so the river carved in ask 2 (unsaved) is not in it. Nothing in descriptions tells you open reflects only the saved file, or that edits are not auto-saved. I used the generator's own river.
- "the lake" ambiguous (two lakes); describe's features list made it resolvable.
- "Erupt ... where the badwater is" cleared the badwater source (note given, good) - player may not want that; "ride" setting is mentioned in note and in apply text.
- placeEntity template name "WaterSource" was a guess (apply text: "Place a WaterSource ... with placeEntity"); it worked. Components not needed.
- Could not tell: whether crater lake is stable/fed at the level (wetAfter +238 only). check says nothing about it.
- describe.sources shows strength; no mention what typical values are.

## Worked well
- Result notes after forceResult (start moved, sources cleared, "give settings.sources ride") are excellent.
- Same seed regenerates same map (stated, true).
- undo returned the step name; badwater source and carve state correct after undo (verified with describe).
- check verdict sentence is plain-language and usable as the answer.
- Carve with origin+end worked first time; picture showed it.
- Error text for refusals is one line and clear.

## Call counts
Ask1: 23 calls (+init) vs 3 minimum (generate, check, save). Ask2: 5 vs 3 (describe, apply, apply, undo = 4). Ask3: ~15 vs ~6.
