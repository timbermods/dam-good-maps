# After Map look (2): Kyler's decisions

Recorded on 2026-09-25 (PLAN §20; decisions-pending #38 and #50 closed, #51–#53 new). The one-line
list of every decision since M8 is in [STATUS.md](../STATUS.md).

- D116: M9a's in-game gate is a DGM Probe batch, not Kyler's play test (amends D112 (3)).
- D117: the probe rule. The Probe may launch Timberborn only after Kyler's yes in chat, every batch
  (CLAUDE.md's standing rule; #50 decided).
- D118: real 3D terrain is essential; the terrain design's P3D-1 to P3D-9 are Kyler's decisions
  (D119–D127), with the 3D stages 3D-a, 3D-b and 3D-c after the Frame pass and before M10; I-1 puts
  runs in M9a's format 3.
- D128: the no-approximation measure allows 10% of a theme's maps under the workshop's p10 distance.
- D129: the audit's A1 and A2 go into M9a, A3 and A4 onto the Refinement list.
- D130: the simulation speedups join M9a's build plan as proposals, each proved bit for bit.
- D131: the techniques playbook as proposals; its conflicts are #51–#53.
- D132: Verticality beside Variety; above 16 only at high values, after a probe batch (#38 decided).
- D133: the Weather view with live water, after the 3D stages (`weather-view-done`).
- D134: keep M12 ready: each step before M12 adds tool entries and suite requests, and re-runs the
  suite.
- D135: Map look's clean default look and information layer; Kyler approves the appeal from
  captures.
- D136: Real places, a gallery of 88 real-terrain maps, right after Map look (`real-places-done`).
- D137: the workshop ratings are dropped; the score is a mild tiebreaker; in-site feedback proposed.
- D115, final version: Kyler's one rule, applied to every step's acceptance in ROADMAP.
- D138: maps feel authored: one or two intentions per map in design version 2.
- D139: Claude steers the generator and never hand-builds the map (a product principle);
  "describe the map you want" in M12; the Claude suite's requests sorted in M12-INTEGRATION.md §13.
- D140: M12's model layer is provider-neutral.
- D141: an MCP server after M12.
- D142: the agent guide after M9a.
- D143: Variations of this map, in M9c.
- D144: a contact-sheet image at every map-changing step (CLAUDE.md).
- D145: Kyler's answers to STATUS.md's eight flags: Verticality in M9a (above 16 locked until a
  probe batch), 3D-b's gate a probe batch, `start.dry` measured first, the one rule's lists stand,
  CI timing tests reported, M9a–M9c approved, character requests steer, M13's rating form dropped.
- Design version 2 is built on `investigation/generative-v2` (not started).

### Repo improvements (PR #21, merged 2026-09-25)

- The PR checks fail only on breakage; the software-rendered orbit check watches 8 s in CI (the assertion is unchanged).
- Timing budgets are reported in the job summaries and uploaded as artifacts, not asserted (Kyler's one rule, D145).
- The heavy vitest suites, the full oracle and the 100-seed batches run nightly (`.github/workflows/nightly.yml`); a failure opens or updates a `nightly` issue. PR checks take about 6 minutes instead of about 12.5.
- `investigation/README.md` indexes every investigation, with its status, PR and where its adopted pieces live; `tests/unit/boundaries.test.ts` keeps `src/` from importing any of them.
- Dependabot (weekly npm and GitHub Actions updates, into `dev`) and CodeQL code scanning are added; both start on their schedules once these files reach `main` with the next release.

- Kyler's roadmap decisions: a Map quality checkpoint after the M9 build (D146) and Map look 2: high fidelity before the Frame pass (D147, `map-look-2-done`).
- PR #18 (the DGM Probe) merged into `dev`; its INTEGRATION.md adopted as proposals (D149); two conflicts logged as pending #54 (where results go) and #55 (a manual play after the probe), with the recorded decisions as defaults.
- Kyler's dependency rule (D150): Actions and minor or patch npm updates merged when CI is green; majors (TypeScript 7.0 #24, @types/node 26 #25) held for the deliberate upgrade step (refinement, item 10); Dependabot regrouped into one weekly pull request per ecosystem. CodeQL flagged `live-check.yml`'s privileged `workflow_run` checkout; the live check is now called by `deploy.yml` with the commit it deployed.
- Tall maps probe (D172): after Kyler's yes, run 20260925-tall played 4 maps with terrain up to 22: 23 checks passed, 0 failed, and the screenshots are whole. Kyler's saves, settings and mods were untouched; only Steam's two `steam_autocloud.vdf` files changed, as Kyler accepted. Results are in `C:\dgm-probe\results\20260925-tall\`. D172 (1) applies: both validators allow heights up to 22, built in the start and edge rules step.
- Released `preview-workflow-done` (PR #39, merge commit 0e46e3d; deploy and live check passed). The deploy workflow then published `feature/live-editing` at fac7679 to `/preview/` (run 36216068564; live check passed).
- Kyler's Map look fixes: badwater blends smoothly into clean water (D177, `look/badwater-blend`); mine sites and ruins get models of our own (D178, `look/mine-site`). Kyler decides each from before and after captures.
- Merged #34 (Pick a place with designed water and quiet retries) at this boundary, as a merge commit (9310a11). Its INTEGRATION.md is adopted as proposals for Pick a place (D166); its one conflict, showing the best failed map when no map passes, is pending #56 with the recorded rule as the default.
- The probe leaves nothing in `Documents\Timberborn` (merged from `chore/probe-docs-clean`): the tall-maps run had created no DGMProbe folder (its Performance Log sessions were moved out as designed), and the restore now also covers the other mods' folders and any DGMProbe folder, with a final listing that must show nothing new after DGM Probe is removed (exit code 6 otherwise). Kyler had deleted the old 208 MB DGMProbe folder by hand.
- Kyler decided #56: a failed Pick a place map is never shown.
- Kyler's decision D179: Live editing is how you edit a map, the editor's core principle. Every tool becomes live, in pushes, water first; relayed to the Live editing work.
- Live editing push 0 (the live shape tools and handles, 2f08e79) published on `/preview/` (deploy and live check passed). Kyler's additions recorded as D180 and relayed.
- Resources like the official maps (D167–D170) built on PR #43; Kyler: "look much better". It merges after the start and edge rules, and the Real places are rebuilt through the same planner (`planMapResources`).
- Kyler approved the sapling fix; merged #44 (the start and edge rules: D151–D153, D164, D171, D172 (1); generator 0.6.1) into dev at 8f3958b. Resources (#43) follows once its conflicts are resolved and the combined generator is re-verified (0.6.2), then the Real places rebuild.
- Merged #40 (Save to Timberborn, with "Name (2)") and #42 (mine sites and ruins; Kyler approved the mine and the far ruins, and the fourth ivy round was checked here). Release boundary docs check (D188): README gains Save to Timberborn for the generator and Real places; its editor section still describes the released editor and changes with `live-editing-done`.
- At the release boundary: merged #45 (Pick a place's signature water, `investigation/pickplace-water2`; its INTEGRATION.md adopted as proposals for Pick a place, its designed water replacing #34's where they differ, ESA WorldCover credited, D192) and #38 (Map look 2's investigation, `investigation/maplook2`; its INTEGRATION.md adopted as proposals for Map look 2, which reads the shared water palette, D147, D177). #45 adds about 98 MB of result files (about 35 MB compressed). #47 (`investigation/carve`) is held until Kyler says it's ready (D194).
- Deployed: `look-mine-ruins-done`, `start-edge-rules-done` and `save-to-timberborn-done` (all at 6290989), released through PR #48 (merge commit 868323e). Deploy run 36228454705: build, deploy and the live check passed. The live download for seed 4242 changed on purpose with the start and edge rules (generator 0.6.1).
- Deployed: `look-badwater-done` (b3d3bc1; #41: badwater blends into clean water through a warm midpoint, one shared water palette), released through PR #49 as a merge commit. Deploy run 36230261763: build, deploy and the live check passed; `/preview/` republished (run 36230350787).
- Merged #43 (resources like the official maps, D167–D170; generator 0.6.2; batches 100% final in all 36 runs; oracle 0 disagreements) into dev at 8c9e987 (Kyler approved the look). Started the badwater step (D200, `feature/badwater-source`) and the Real places rebuild (`feature/real-places-2`: no walls, the resources planner, about 150 places, badwater once it lands).
- Kyler approved design version 2 (D209): merged #32 (f04674d) and started the M9a build on `feature/m9a`. The M9 agent definitions (D210) are in `.claude/agents/`; they load from the next session, so tonight's M9a agent runs on Opus 5.5 at the session's effort.
