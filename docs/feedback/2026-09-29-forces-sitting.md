# Kyler's forces sitting (2026-09-29)

Kyler's notes from the forces sitting on the preview (`feature/forces` at 9e14f189), recorded word for word. PLAN §20
records them as D344 (batch A) and D345 (batch B).

---

WHAT PASSED
Floor; Banks; Erupt's summit; curved Slide and curved fissures ("amazing"); Raise and Lower with Shift+scroll and Shift+click ("magical"); F to size a brush; placing from the shelf; edge walls; Quake and every key; sources; Back to editing; the four rows; 256² maps; Select overall; no start blocks the save; reload and the project file reopen identical; every force in Watch apart from Glaciate; no leaning trees after extreme Quakes; long undo and redo chains flawless. A heavily edited 256² map looks exactly the same in the game.

BATCH A, THE FORCES (build, Opus 5.5, high, feature/forces)
1. F + moving the mouse sets a force's Size and { } its Power, exactly as for brushes; setting either by hand takes it off Auto; the number shows beside the cursor while changing it.
2. Power and Size always show as numbers in the settings row ("Auto (68)" when Auto).
3. A drawn gesture shows as a band of its width along the path, with no circle, for every drawn gesture: Carve, Glaciate, Quake's fault, Erupt's fissure. A circle only for a click.
4. Esc: while drawing, it cancels the gesture; once a force is playing, it skips to the end; undo takes it back at any moment. This amends D341 where it made Esc revert a playing force. While a force plays, the hint line says "Esc to skip · Ctrl+Z to undo".
5. Carve: the carving animation follows the stroke from where it was started; the water still flows downhill as the land dictates (item 41's rule).
6. A drawn shape sets the force's extent; the Size setting is for clicks. A small loop gives a small eruption even at max Size. Every force with a drawn gesture.
7. Glaciate: the final land appears before its animation and sound finish. The land changes only as the ice passes (item 30) and settles as the animation and sound end.

BATCH B, THE EDITOR (build-light, Sonnet 5.5, high, since it touches layout and other batches' tests; its own worktree off feature/forces, merged before batch A)
1. Framing: every camera view (Top-down, the default view, Reset view) frames the map off-centre, well to the right with a big empty area on the left. Centre it.
2. The toolbar: long settings rows get a second line (Sources, Square and Straight lines below Size, Level and Mode). A tool's More opens as a compact panel laid out as a grid, not a longer row, for every tool.
3. The level control (▾ ∞ ▴) moves to the top right, beside the compass, larger and easier to see, as in Timberborn's own editor; Watch and Sound sit under it. This amends docs/UI-BRIEF.md §4's view bar: update it.
4. Source strength: Ctrl+scroll over an existing source changes that source's strength at once. Today it's held until the next click, which applies it and also places a second source at strength 1. Clicking an existing source with the shelf tool never places a duplicate.
5. Delete: its counts and "Everything" skip objects under water (a selection showed 11, and after deleting them 75 more appeared as the water drained). Everything means everything, submerged objects included.
6. Placing a mine site on uneven ground made water spill out and then drain: the levelling filled a wet tile, which D328 forbids (or its edge slopes did). Placing an object never visibly spills water.
7. X puts down whatever tool is held (brush, force, Select), leaving a plain pointer: click to select objects, drag to move them, the start included. It still closes a selection.
8. Select: Ctrl+click on land takes its level and Shift+scroll dials it, as for brushes. Whole map joins the marking icons on the left; the level actions read "Up 1" and "Down 1".
9. Max water depth gets a one-line tooltip: it raises the ground under deeper water so the water there is at most that deep.
10. Saved map names: dgm-<theme>-<seed>.timber (the theme the map actually got; a word seed made file-safe, lowercase with dashes; a real place by its name, as dgm-<place>). If the name exists, add a number (-2, -3) rather than overwrite.

FOR M9B (a check, not a new item): at 256² on the preview's generator, an Islands map had no sea and a Delta map had no braided river on a plain: both missed their theme's promise. Report the first-map share meeting all three outcomes for Islands and Delta at 256² specifically.

LATER: a Rift force (land cracking open and dropping, a rift valley or fissure going down, the opposite of Erupt's ridge). Add it to ROADMAP's Later list.

AFTER BOTH BATCHES: when they're merged into feature/forces and CI is green, refresh the preview and send me a short checklist of only the changed items. On my yes, release the forces.
