# Chat handoff: how Kyler and his planning chat work

Written 2026-10-01 (refreshed in the evening) for a new planning chat in claude.ai. Read this first, then `docs/PERFECT.md` (the yardstick),
`docs/STATUS.md` (its summary for Kyler), `EDITOR_PLAN.md`, `PLAN.md` §20 (every decision, D1–D379) and
`docs/HANDOFF.md`, all from github.com/timbermods/dam-good-maps (public). The previous version is
`docs/chats/2026-10-01.md` (the morning's version; the one before is `docs/chats/2026-09-27.md`). Past planning chats are searchable: use them for detail on any decision.

## Roles

- **Kyler** (he/him) decides everything; his eye is the final judge. A one-person passion project with no launch
  date: realising his vision matters more than speed.
- **The planning chat** (claude.ai) is his advisor and reviewer. It reads the repo, branches, PRs and captures
  itself, gives brutally honest and specific feedback, and writes the exact prompts he sends elsewhere.
- **The milestone session** (Claude Code, Opus 5.5 at high) is the only session that changes `dev`, merges and
  releases. It orchestrates subagents, records Kyler's decisions in PLAN §20, and logs one line per event on the
  Progress log issue (#57). From 2026-10-01 it runs on another machine (`docs/HANDOFF.md`, "Resume here").
- **Codex** builds prototypes and audits on its own `investigation/<name>` branches. The milestone session merges
  them into `dev` as investigations (only Codex's own commits when a branch started from an unreleased branch), and
  Claude's agents adopt them on Kyler's yes.

## Kyler's standing rules and preferences

- **Brutal honesty.** Say when something is fluff, overengineered or wrong; praise only what earns it. Look at
  captures before judging them. Report what fell short as plainly as what worked.
- **Prompts stand alone.** Code blocks are the exact text Kyler sends; prose is for him. Each prompt says where it
  goes and needs nothing from the chat to make sense. A prompt is never assumed sent until Kyler says so.
- **Compute is a resource (D316–D318).** Effort matches the stakes; quality is never compromised. Invest in what
  compounds (shared modules, findings, history); spend little on ceremony. The cheapest model and effort that does
  the job; a real check before anything is reported done; short reports.
- **Pings (D332).** The session pings Kyler the moment his decision, eye or yes is needed, never for progress.
- **Green before merge (D341).** Nothing merges into `dev` red, ever. No test stays known-flaky: the cause is found.
- **A headless core (D342).** Every change to a map is an operation; all editing logic lives in `src/core/` and
  runs without the page; every refusal gives a one-line reason; contract tests exercise the core.
- **Tooltips (D351, D361, D368).** A short purpose phrase with the shortcut as a small key cap at the end; no second
  sentence, no key in brackets.
- **A force always has a visible effect (D356)** wherever it's used, even at Power 0 (the gentlest visible effect).
- **Only the player places objects (D368 (10)).** No force, brush or edit adds an object; problems go to the checks.
- **The first land shown is the map (D348, D370).** Every shaping step finishes before the land is shown; only water
  and D350's small outlet wear may follow.
- **Edits never replay onto new land (D336).** One key habit for every tool: F (or `{ }`) is Size, `[ ]` or F+scroll
  is strength (D368 (1), (11)).
- **Before a release, fix only what's wrong;** polish comes after, in its own step.
- **Performance is a requirement (D380).** Every feature meets its speed budget before it ships; a speed regression blocks a
  merge like a failing test, measured in a quiet window.
- **The Rust order (D381).** The exact core moves to Rust, each port byte-identical and tagged before its TypeScript is
  deleted: water, the five forces, their planning and the checks, new forces directly, the generator, perhaps the editor's
  operations. The interface and rendering stay in TypeScript.
- **No outside users for now (D382).** Only Kyler uses it: no compatibility constraint on old share links, seeds or project
  files; re-pin freely. His own saved maps and projects keep opening or convert automatically.
- **The licence is the AGPL v3 or later (D379);** versions before 2026-10-01 stay MIT.
- **Probe batches** (the only way Timberborn is launched) need Kyler's yes in chat every time on any machine but the
  dedicated one (D117, D218).
- Kyler batches hands-on reviews into single sittings: collect what's ready on the preview and give him one
  checklist of only what changed.

## Codex: models and prompts

- **GPT-6.1 Sol at high** is the default: force demos, physics, audits, performance and architecture work.
  **GPT-6 Astra at high** is for look work, where its judgment has the track record. Choose by the kind of work.
- Codex prompts start with HARD RULES: the authorization to push one named branch and open one PR; no merges,
  approvals, auto-merge, other branches, tags or releases; work only in its own folder; large generated results out
  of git (D195, the text in `investigation/README.md`); original or clearly licensed assets only; a `git diff` check
  before the PR; "don't wait for my replies". Each branch gets an INTEGRATION.md for adoption.
- Shared-code findings are reported separately from a prototype's own shaping, so Claude's agent fixes each once.
- **Quiet windows:** Codex's performance measurements need the machine quiet; the session pauses every heavy job
  for the window Kyler names.

## The milestone order (D349, as amended) and where each step stands

1. **Finish the editor as players will know it.**
   - **Released 2026-10-01:** the forces (`forces-done`, #149, D375) and the High look (`map-look-2-done`, #151, D378).
   - **Right after** (not blocking): the post-release list below, in order.
   - **M9b's release** (`feature/m9b`, #70): in progress, with the adoption order below.
   - **The parity batch** (#95), then **"The page is the editor"** (#92, `docs/UI-BRIEF.md`), with startup part 2.
   - **The Weather view** (#73) with day stepping (D361), then **custom map sizes** (D357), then **the dam sketch tool**
     (D383; needs the Rust water and "The page is the editor"), closing step 1.
2. **3D, terrain above terrain:** foundations (#71), the view (Codex's proposal approved, D365), then Erode (built in Rust,
   D381) and the Block tool.
3. **Polish until mature:** Kyler's editor UI audit, the design pass, M13, and the 20-second live tour of the editor's best
   controls (D377; per-tool "Show me" later on the same machinery).
4. **Collaborative editing** (`docs/COLLAB-BRIEF.md`, D362; short join codes, #150, feed it).
5. **M12** (Claude in the editor).

Alongside the steps, **the Rust order (D381)** runs as its own thread: the water port first, then the five forces, and so on.

## Open items, with owner and next step

### Released today

The forces, the High look and the AGPL licence (above). The setup command, the branch cleanup and the docs-only CI are done.

### The post-release list, in order (owner: the milestone session, `build` agents)

1. **The quick-click bug** (D378): Craterize clicked quickly sometimes skips the new crater's strike animation; the previous force
   should skip to its end while the new one plays in full. Check every force.
2. **Tests for an eruption in High and for the highlight on High's basin sources** (D378).
3. **Moving water and the Flow view** (Codex's flow investigation): always-on moving water in both looks; the Flow view's
   lanes off by default; paths built in the water worker; it must pass the smoothness harness. Then **renderer R1** from the
   performance audit (#152), using the smoothness investigation's traced stall causes: water blending, brush updates, the
   High look's lighting.
4. **Carve's river born as it cuts** (D371), **Glaciate's Fast timing** (D374), **startup part 1** (D367); **Carve's
   Maturity** (D355) and **Deposit's adoption** (D364) are built directly in Rust after the forces' port (D381).
5. **Shift+F resets what F changes on every tool** (a force's Size and Power to Auto; a brush's Size and strength to
   defaults); it never starts resizing or triggers Shift's invert.
6. **A Strength slider for Smooth and Naturalize** in their settings row, moving live with F+scroll and `[ ]`.
7. **Trees on soil an edit has dried out** get a "dry soil, will die" hint in the readout and with Markers on (D376).
8. **After the forces' Rust port:** a **Sources setting for every force** (Ride, the default; Keep; Clear) in More.
9. **Check whether the README and the website need a line about the High look.**
10. **Batch jobs** (M9b's measures, theme measures, nightly checks) run independent maps across all CPU threads.
11. **One quiet measuring window**, once Codex's current tasks land, timing every speed investigation in turn (the faster
    settle, D359, among them).
12. **Later: a Codex round on Canyon and Highlands at 96².**
Then the parity batch (#95) and "The page is the editor" (#92) with startup part 2.

### The Codex verdicts (2026-10-01)

- **Approved, to merge as investigations** (the milestone session merges them at a boundary; only Codex's own commits where
  a branch started from an unreleased one):
  - **Short join codes** (#150): findings go into `docs/COLLAB-BRIEF.md` (the codec; a QR code next; WebKit and
    cross-network still unverified).
  - **The performance audit** (#152): its ranked roadmap guides the order of the speed work.
  - **Small starts** (#153).
  - **Generation speed, rounds 1 and 2** (#155): round 1 is byte-identical, about 6% less CPU at 256²; round 2 about 12%
    fewer redraws with every quality share equal or better, zero must-pass failures, shown land unchanged and identical
    across three engines. **Adopt round 1, then round 2.**
- **The smoothness investigation (#107): paused.** Kyler sees no large-brush freeze on his own machine, so the 3–4 s
  stall is most likely an artefact of measuring under 100% load. Merge it as an investigation (its harness and
  findings) and adopt none of its fixes (the buffer experiment showed no gain). Its harness is the gate that renderer R1
  and moving water must pass, measured in a quiet window. The water status "0%" after undo is confirmed fixed on `dev`.
- **The Rust water port (#156): approved** (D381). Adopt the native build for batch jobs now (M9b's measures, theme
  measures, nightly checks: the 840-map settle batch drops from 281 s to 146 s), without waiting for M9b's release. In
  the browser, use the Rust settle in Chromium (about 1.7–2.5× faster) and keep TypeScript in Firefox and WebKit
  (Firefox's WebAssembly was about 4× slower, WebKit slightly slower) until a short Codex round explains Firefox's
  slowdown. Threading stays experimental. Add Rust 1.90, the wasm32 target and the Rust build to CI and the setup
  command.
- **Scaling round 4 (#132): approved for adoption.** Files about a quarter of round 3's (7 MiB at 256², 20 MiB at
  512²), reopening about 1–4 s, a single undo at any depth a few milliseconds or less. Adoption checks: a 100-step
  jump back (1.5–6 s today), memory over a long session, and native Safari storage.
- **M9b's adoption order** (`feature/m9b`, #70): small starts, then generation speed (round 1, then round 2), then Lake
  Basin round 2 (only after a quiet-machine timing shows it is no slower than today), then the settings round 2 last
  (still held: theme-outcome regressions, small lake gains, speed misses); re-measure after each. **M9b must not
  release slower than `dev` at 256²** (D380). Three contract tests were already failing on the base (#155 disclosed
  them): confirm what they are (likely the pending re-pins) and fix or re-pin them; none may stay unexplained.
- **In flight with Codex:** multi-core water (`investigation/parallel-water`, #130) and the Rust water's Firefox slowdown.

### M9b (owner: the `m9b-build` agent; hand-over in `docs/progress/m9b.md`)

- **Adopted:** Codex's Islands, Delta and River Valley shaping, on the strict D348 base, with the shared fixes (the
  channel carved through planned lakes, channels sized for joined flow, the mine pair, river joins, one shared
  reading of the colony's reach).
- **Measured** (840 maps, seeds 1–40 of every theme; `feature/m9b` e292cefe): failing absolutes 2 / 0 / 0 at 96² /
  128² / 256²; first maps meeting all three outcomes 213 / 228 / 229 of 280. Lake Basin (12–13 of 20 at every size),
  and Canyon and Highlands at 96², are under two-thirds.
- **Failing maps and their plans:** the 96² start class (Any 31, Islands 4: no start with room for two mine sites;
  Highlands 14 passes only by luck, its starts' water moves). The dam walls are fixed. Still to try: keeping planned
  lakes at their planned level, which may lift Lake Basin.
- **Order from here:** the Codex verdicts above (small starts, generation speed, Lake Basin round 2, settings round 2
  last); the canyon measure's separate effect; speed at 256² (it must not be slower than `dev`); the D148 re-pins; the
  three contract tests that failed on the base; then the review set for Kyler's eye and one pooled probe batch (his yes).

## Codex investigations

| Investigation | PR | State | Still to decide |
|---|---|---|---|
| Determinism | #122 → #123 | merged; adopted on `feature/forces` (D366) | nothing |
| Startup | #127 | merged; approved (D367) | adoption in two parts; the laptop test |
| Collaboration spike and architecture | #109, #119 → #120 | merged (D362) | built at step 4 |
| 3D view | #116 → #117 | merged; approved (D365) | adopted at 3D step 2 |
| Deposit | #104 → #114 | merged; approved (D364) | adopted after the forces release |
| Landslide | #101 → #103 | merged, not adopted (D354) | nothing |
| Meander | #106 | merged, folds into Carve (D355) | Carve's Maturity, after the release |
| Rift, Erode, Block tool, flow arrows, High look, faster settle | merged | approved | adoption per ROADMAP |
| M9b theme audits (seven) | #143 | merged (D370): three adopted, four held | re-audits; settings round 2 |
| Smoothness (performance) | #107 | paused (Kyler sees no freeze on his machine); merge as an investigation, adopt none of its fixes | its harness gates renderer R1 and moving water |
| Multi-core water (parallel-water) | #130 (draft) | in flight with Codex | whether to adopt; hosting follows |
| Scaling to 512 | #132 | round 4 approved for adoption | the 100-step jump back, long-session memory, native Safari storage |
| Short join codes | #150 | approved; merge as an investigation | findings into COLLAB-BRIEF; QR next |
| Performance audit | #152 | approved; merge | its ranked roadmap guides the speed work |
| Small starts | #153 | approved; merge | adopted first on M9b |
| Generation speed, rounds 1 and 2 | #155 | approved; merge | adopt round 1, then round 2 |
| Rust water | #156 | approved (D381) | native builds for batch jobs now; Chromium in the browser; Firefox's slowdown (Codex round) |

## Ideas parked for later

- **Hosting on Cloudflare Workers with Static Assets:** when multi-core water is adopted (GitHub Pages can't set
  the isolation headers; today's plan is a service worker).
- **Custom map sizes** (D357): end of step 1; curves checked at 512².
- **Collaborative editing** (`docs/COLLAB-BRIEF.md`): step 4.
- **Co-op starts:** an idea only, nothing decided.

## How the planning chat checks in

`git fetch` the repo (all branches), read the summary at the top of `docs/STATUS.md`, the Progress log issue (#57),
recent commits and open PRs, and view captures with `git show`. Prefer git over the GitHub REST API, which
rate-limits quickly from shared addresses.

**The next free decision number is D384.**
