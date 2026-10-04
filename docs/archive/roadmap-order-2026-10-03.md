# The order of work, as it stood on 2026-10-03

Superseded by ROADMAP.md, "The order of work". Verbatim.

## The order of work

Two sessions run in parallel (D388). The **page session** (Fable 5.1, high; its own worktree `-page` and branch
`feature/page`, created fresh from `dev`, D395) builds only the page. The **milestone session** (Opus 5.5, high)
builds everything else. Neither touches the other's files: the page session owns the page, the editor's interface,
`Editor.tsx` and its split; the milestone session owns the core, the water, the generator and the documents it owns.
Models and effort: D389.

**1. Before the next release** (D385–D387)

- **The release gate (D385):** the water and the editor's core must be perfect; anything Kyler finds in them blocks the
  release until fixed.
- **The editor-core items (D387):**
  1. the hover readout refreshes live whenever the water under the pointer changes (the Weather view's days, the settle,
     any edit), without re-hovering;
  2. **Remove unfed water**, map-wide from the ⋯ menu or within a selection in Select, showing first what it will remove
     ("12 pools, 3,400 tiles of water"), one undo step; water fed by sources is untouched;
  3. **Fill**, standing water to a chosen level with no source, built on the retained-water path (D216) as the oxbow lakes'
     retained water is, so the settle's game rules evaporate it (D394: 1e-4 per second, 1e-3 under 0.02 deep, times the
     saturation modifier), showing roughly how long it will last; the sealed-basin rule in `water.settles` (D222) applies;
  4. **Naturalize's land effect** weathers like nature (cliffs retreat into irregular slopes with scree at their feet,
     edges soften, contours stay coherent, at a scale that follows Size and Strength), never single-tile speckle; Kyler
     will show his before-and-after terraces as the target;
  5. **Naturalize's sound**: a clean, high-quality CC0 recording of a soft scrape and settle of earth and gravel, matched
     in loudness and character to the other tools' sounds.

  Remove unfed water and Fill: engine and tests in the core; their place in the page is agreed with the page session
  through Kyler.
- **The coherence review (D386):** once Kyler is satisfied with the quality, and before the next release, a
  whole-codebase review on Fable 5.1 at high (dead code, duplication, inconsistent patterns, things built twice), with
  a cleanup plan.

**2. The page session: "The page is the editor" with the design pass** (D384, D388). One look, designed once, with the
page it dresses, with Kyler's sittings at each checkpoint, and the first-visit map picker and parallel loading of startup
part 2 (D367, D397). Rebuilt fresh on `feature/page` from `dev`, not on part 1 (D395; part 1's headless core is salvaged onto
`dev` first, PR #161). The `/preview/` slot is the page session's while it works (D396). Section below.

**3. The milestone session, in order**

1. **The salvaged core** of the page's part 1 (PR #161, D395): its headless modules and contract tests onto `dev`; then the
   page session starts.
2. **M9b and its adoption order** (section below): small starts, generation speed (round 1, then round 2), Lake Basin
   round 2, the settings round 2 last.
3. **The Rust adoptions** (D442, D381; ahead of the post-release list, except what the release gate needs): one `build`
   sub-agent in its own worktree, in parallel with M9b, keeping CPU use reasonable while the page session runs its checks.
   No timing gates (D441, D453): a port is adopted when CI's byte-identity checks (D366) and the existing suites pass.
   Firefox's speed is never measured (D440).
   (a) Rust 1.90, the wasm32 target and the Rust build into CI and the setup command, with `portable.rs` (#171, narrowed;
   built on `feature/rust-toolchain`: `rust/`, `tools/rust/check.ts`, CI's `rust` job, the whole-source guard);
   (b) is wired on `feature/rust-water` (`rust/water`, the committed Wasm, `RustWaterSim`, the native batch binary,
   `tools/batch.ts --native`) but not switched on: Kyler, 2026-10-03, the switch, the identity run and the
   TypeScript's tag and deletion wait until M9b is on dev, and the Rust is re-ported to M9b's water.ts then;
   (b) the Rust water (#156), native for batch jobs and in the browser, in every engine at every size, its TypeScript
   tagged and deleted (D381); (c) the forces (#158) as soon as CI's byte-identity checks and the suites pass against the Rust (D453); (d) the analysis (#157) and the
   generator, after M9b's release. Details in "The Codex adoptions" below.
4. **The post-release list** (`build`, Opus 5.5, high; D378, D380, D381):
   1. **The quick-click bug** (D378; built by the renderer session on its own PR, merged when CI is green): Craterize clicked quickly sometimes skips the new crater's strike animation; the
      previous force should skip to its end while the new one plays in full. Check every force.
   2. **Tests for an eruption in High and for the highlight on High's basin sources** (D378; the renderer session, with item 1).
   3. **Moving water and the Flow view** (Codex's flow investigation; built by the renderer session on
      `feature/moving-water`, D398; this session merges its PR when green and Kyler says yes): always-on moving water in both looks; the Flow
      view's lanes off by default; paths built in the water worker; merged when CI is green (D453). Then **renderer
      R1** from the performance audit (#152), using the smoothness investigation's traced stall causes: water blending,
      brush updates, the High look's lighting.
   4. **Carve's river born as it cuts** (D371), **Glaciate's Fast timing** (D374), **startup part 1** (D367), each its
      own section below; **Carve's Maturity** (D355) and **Deposit's adoption** (D364) are built directly in Rust after
      the forces' port (D381).
   5. **Shift+F resets what F changes on every tool** (a force's Size and Power to Auto; a brush's Size and strength to
      defaults); it never starts resizing or triggers Shift's invert.
   6. **The Dependabot majors** (D460): #24 (TypeScript 7.0) and #25 (@types/node 26) merge after M9b's release, once CI
      and the nightly suite are green on them.
   6. **A Strength slider for Smooth and Naturalize** in their settings row, moving live with F+scroll and `[ ]`.
   7. **Trees on soil an edit has dried out** get a "dry soil, will die" hint in the readout and with Markers on
      (D376).
   8. **After the forces' Rust port:** a **Sources setting for every force** (Ride, the default; Keep; Clear) in More.
   9. **Check whether the README and the website need a line about the High look.**
   10. **Batch jobs** (M9b's measures, theme measures, nightly checks) run independent maps across all CPU threads.
   11. **Startup part 2's service worker** (D397): the one service worker (the caching and multi-core water's isolation),
       built with multi-core water's adoption (the page session builds the first-visit map
       picker and parallel loading).
   13. **Later: a Codex round on Canyon and Highlands at 96².**
   14. **"Designed for" removed from the core** (D449), after M9b's release: difficulty leaves the spec, the share link's
       `d` key, the generator's start rules, both validators (an imported map's designedFor ignored, Normal's values apply)
       and the description's wording; PLAN §5.6 rewritten; the "Difficulty" section's settings (Starting wood, Max walk to
       water, Starting berries, Start area, No ruins within) default to today's Normal values; re-pin freely (D382).
   15. **An Islands round** (D432), measured by `investigation/m9b/islands-reach.ts`: every map has an island of 150+ tiles
       to expand to, reachable from the start across water as the game allows; islands kept apart from the shore, and layouts
       that read as lakes or rivers redrawn (today 12 of 30 seeds at 128² fall short); it reports, at 96² and 128², the
       3-island promise (96² holds on 2 of 20 today) and that measure (D433).
5. **The Codex adoptions** (section below): the Rust water, the analysis (after M9b's release, D391) and the forces
   come first, as item 3 (D442); then multi-core water, scaling round 4, generation speed.

**6. Then, in order**

1. **The parity batch** (#95; D337–D339) with **Crop map to selection** (D340).
2. **The Weather view** (Drought and Badtide day by day, #73), which closes step 1 of D349's order.
3. **Custom map sizes** (D357), then **the dam sketch tool** (D383).
4. **Pick a place** (placement as written in its section; the design pass now comes earlier, D384).
5. **The four 3D steps** (terrain above terrain): Foundations starts alongside M9b (new modules only); the view, creating
   them (Erode, in Rust after #158's adoption, D438, and the Block tool), generation.
6. **Polish until mature:** every feature feeling finished; the 20-second tour (D377) and **M13** (problem reports,
   shortcuts and help, a final performance pass), all done before collaborative editing's first users (D349).
7. **Collaborative editing** (D349), then **M12 (Claude)** (D277, D342), then **Later**.
8. **Housekeeping** has no place in the order: each item ships on its own when convenient, with its own test.
   **Real places' second round** is parked (D319) until Kyler says it resumes.

The Rust order (D381) runs through all of it. Every step that changes generated maps commits a contact sheet
(CLAUDE.md).
