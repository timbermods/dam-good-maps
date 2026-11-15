# MCP trial findings (no source read)
Cost-ranked:
1. Craterize with no settings: size default is huge (4015 tiles changed on a 96 map, wiped forests, MOVED the start from 82,70 to ~76,51, no water). `size` schema "minimum 4, maximum 180" has no unit/default. Two wasted calls (apply+undo). 
2. "Crater lake" = craterize + a water source; nothing in the tool descriptions says craterize makes no water (wetBefore==wetAfter was the only hint). Needed a 3rd call: placeEntity WaterSource at the crater centre.
3. generate twin-falls: 3 of 4 tries "did not emerge"; description only says retry on refusal, not on a non-emerged intention. Settings waterfalls few/many don't say how many. Seed luck (seed 12 worked).
4. describe lists lakes as `features:[{kind:"lake"}]` with NO position; the only way to find "the lake" was the picture. Rivers carved by apply do not appear in describe.rivers afterward (reopened map-5 still lists 5 original rivers). Can't tell if carve reached the lake except by picture.
5. "Is it playable?": check returns saves:true + 9 warnings incl. "No clean water within 64 tiles' walk of the start" even though the start is 3 tiles from a wide river. No single verdict, no explanation of why water counts as not clean/reachable. Fixes offered only for berries/oaks.
6. carve/erupt `where` needs coordinates; no NE hint other than describe.coordinates ("Y north"), found it only in describe, not in the apply description ("higher Y is up" is in picture). Tools/list does not state where origin/end go for carve; I guessed origin=[88,90] end=[52,72], worked with no settings.
7. Eruption "where the badwater is": badwater coords only from describe.sources (kind badwater 7,65) or features badwaterBasin.at. Erupt silently cleared the badwater source ("Erupt, a source cleared") - schema says sources default "clear" but the apply description doesn't.
8. save `name` is prefixed "dgm-" and collision suffix -2; open needs the full .damgoodmaps.json path (stated). generate named map "Split Level Gorge" but map renamed to my save name later - fine.
9. First generate: I forgot `intentions` (my truncated reading); description says "the settings and the intentions" but the 'twin' words only appear inside the intentions enum text. Waste 1 call.
10. size "small (96)" - descriptions DO tell me how to keep maps small. Good. Min 32.
Slow: generate 5-9 s each at 96.
Worked well: summary text per intention with "emerged/did not (reason)"; picture with grid margins and "north up"; undo names the step; apply result with wetBefore/After; save warnings text.
