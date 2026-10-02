# After M7: plan updates and merges

On `dev` after `m7-done`. Plans only: no code, tests or tools changed.

- **`main` merged into `dev`** (eb8bac8): CLAUDE.md with the writing and deploying rules, the
  noindex deploy step and the live check.
- **PR #4 merged** (`investigation/workshop`): the study of 130 Steam Workshop maps
  ([WORKSHOP.md](../../../investigation/WORKSHOP.md)), and its integration plan
  ([WORKSHOP-INTEGRATION.md](../../../investigation/WORKSHOP-INTEGRATION.md)) adopted into ROADMAP and
  PLAN (D87), each item in the milestone it names. Kyler decided W4 (#34, badwater distances
  30 / 15 / 8) and the start thresholds (#39) in the amended Part A (D85). The other seven W
  decisions wait for Kyler (#31–#33, #35–#38): W1 Reservoir help (#31) and part of W7 (#37) keep
  the recorded decisions until Kyler answers, and #40 logs where the study conflicts with Map look.
- **PR #5 merged** (`investigation/claude`): the Claude groundwork for M12
  ([REPORT.md](../../../investigation/claude/REPORT.md)), and its integration plan
  ([M12-INTEGRATION.md](../../../investigation/claude/M12-INTEGRATION.md)) adopted into ROADMAP, PLAN
  and EDITOR_PLAN (D88–D96), merged with Kyler's M12 update: the vocabularies in M9, the rest in
  M12. P3, P5, P6 and P7 wait for Kyler (#41, #43–#45); P1 is settled by D84, and P2 is #28. #42,
  #46 and #47 log where it conflicts with D84 and D87.
- **M12 plan update** (Kyler, D84): compound requests, flow-relative places and a judgement-word
  table (both built in M9), and new suite requests; the loop's budget waits for Kyler (#28).
- **Refinement note** (Kyler): containment should look natural. A new Refinement phase in
  ROADMAP (after M11, before the design pass) lists it with Kyler's other notes: #2, #12, #13,
  #21, the river-pond crossing fix and the load checks. Its targets wait for Kyler (#29).
- **Part A, start requirements** (Kyler, D85; built at the start of M8, released with `m8-done`):
  three requirements that reject a map (clean water on the start's own level reached without
  stairs; **Minimum starting trees** and **Minimum starting bushes** within 20 tiles' walk); the
  other start rules become generation targets with advisory warnings. Also at the start of M8:
  editing generated outlines that leave the map (#30).
- **Part A amended** (Kyler, D85): thresholds by difficulty, as player settings that Designed for
  resets: water within 12 / 20 / 28 tiles' walk on the start's level, living trees 60 / 40 / 20,
  living bushes 40 / 30 / 20; badwater distances 30 / 15 / 8 as targets (W4); the start must reach
  water on its own level (D26's bench changes), with batches ≥ 98% per theme.
- **Part B, Map look** (Kyler, D86): a new step after M8, before M9. The 3D view moves closer to
  the game's look, its ground coloured by moisture; no map file changes. Released with M9 or as
  `map-look-done`.
- **New pending decisions:** #28–#47 (20 rows). #34 (W4) and #39 (the start thresholds) are
  already decided by Kyler (D85); the rest wait for Kyler, each with the default the plans follow.
  #31, #37 (in part), #40, #42, #46 and #47 are conflicts where the recorded decision stays.
