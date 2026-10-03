# Kyler's answers to everything open (2026-10-03)

Recorded as PLAN §20 D455–D460. Verbatim:

1. Byte-exact reopening (editor-core 1): (b) for this release. Keep what #196 does: edits are replayed with today's code, and a project saved under an older version may reopen a few bytes different (D382 allows it). Storing the finished map, option (a), is not a release blocker: it comes with D367 part 1 after the release (opening a stored map from its stored state), built once there. When it does, undo below the save point follows this rule: on reopen, replay the log once and compare it with the stored map; if they match byte for byte, undo below the save point works as normal; if they don't, undo stops at the save point, never an approximate replay. Option (c) is not pursued.

2. Undo after a reopen (editor-core 7): (a). Save the step grouping in the project: each logged operation gets an optional field marking where its step begins, with the step's label. Old projects open as today, one operation per step; an older app ignores the field. One undo takes back one whole step after a reopen. Update EDITOR_PLAN; move the finding's test into tests/contract once it passes.

3. Water 4, an imported map's unfed pond: keep it. An imported map's own water stays in the live water and in the export alike; the game evaporates it in its own time. D420 stays as it is for generated maps and Real places. Move the finding's test into tests/contract once it passes.

4. Lake Basin round 2: adopt it on M9b (D453). Bring the ported patch onto the branch again; Kyler approves the permission prompt.

5. Naturalize's sound (D387 (5)): you build it, as a one-time exception to D388 for src/editor/juice/palette.ts and calibration.ts only. Find one clean CC0 recording that fits the palette's "dry leaves, irregular, delicate detail", wire it in those two files the way the other brushes' sounds are, and credit it where the other sounds are credited. Tell Kyler when it's on dev, so the page session merges dev before touching those files. Kyler judges it by ear.

6. The coherence review (D386): not yet. Kyler says when he's satisfied.

7. The selection note: already sent to the page session this morning; nothing for you to do.

8. The README's three lines on the forces: fine as they are. Clear the item.

9. The pending defaults (#83, #110–#117): they stand. Kyler overrules any when he looks; clear the item from "Waiting for Kyler".

10. The Dependabot majors (#24 TypeScript 7.0, #25 @types/node 26): merge them after M9b's release, once CI and the nightly suite are green on them. No quiet slot needed (D453, D454).

Number and record 1–5 and 10, and clear 1–5 and 7–10 from STATUS.
