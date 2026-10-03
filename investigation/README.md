# Investigations

The one index of every investigation: what it is, what it found, whether it was adopted, and its pull request. Each
folder holds its report, measurements and often prototype code. Decision numbers (D…) are PLAN.md §20's; where a
finding is a number later work uses, it is also in [docs/FINDINGS.md](../docs/FINDINGS.md).

The verdicts come from each folder's report, PLAN.md §20 and docs/HANDOFF.md §0 (the Codex verdicts of 2026-10-01 and
2026-10-02). Where none is recorded the cell says so. Folders marked "held" or "waits" are not in the product yet.

## Rules for an investigation

**Never imported by product code.** Nothing under `src/` imports from `investigation/`; `tests/unit/boundaries.test.ts`
fails if anything does. The prototype code here runs on its own and may lag the product. An adopted piece is ported or
moved into `src/` or `tools/`, with a comment naming its source. Tools and tests may read data files here at run time:
`notes/footprints.json` and the local-only `raw/` maps. `raw/` and `decompiled/` stay local (gitignored): copies of the
game's files, official and workshop maps and saves, and decompiled game code, none of it ours to redistribute.

**What an investigation commits** (Kyler's rule, D195):
- Commit the report, the code, small samples and a few captures.
- Keep large generated results (bulk JSON, thousands of files, anything over a few MB) out of git, in
  `investigation/<name>/local/` (gitignored) or attached to a GitHub Release.
- Say in the report how to regenerate them: the command, its inputs and roughly how long it takes.
- What's already merged stays as it is; history is not rewritten.

Paste this into every investigation prompt, for Claude or Codex:

> Repository size rule (Dam Good Maps, D195): commit your report, code, small samples and a few
> captures. Keep large generated results (bulk JSON, thousands of files, anything over a few MB) out
> of git: write them to `investigation/<your-folder>/local/` (gitignored) or attach them to a GitHub
> Release, and say in your report exactly how to regenerate them.

**Running a prototype.** Each folder's README or REPORT says how. Some have their own `package.json` (audit, cycles,
landscapes, simspeed, claude/harness, and the force demos), installed in that folder, for example
`npm ci --prefix investigation/cycles`. The rest use the root's packages and run from the root, for example
`npx tsx investigation/generative/batch.ts`.

## Index

PR links are the pull request that merged the folder into `dev`; where Codex's own pull request was closed and its work
merged through a second one, the second is shown (the first is named in "what it is" only when it matters).

| Investigation | What it is | What it found | Adopted? | PR |
| --- | --- | --- | --- | --- |
| **The first studies** | | | | |
| [REPORT.md](REPORT.md), [notes/](notes/), [calibration.json](calibration.json), `analyze_maps.py` | The first investigation: the game's code, blueprints and maps. | What a valid, playable map is, and the 19 official maps measured; the water, soil and load rules. | Adopted: FORMAT.md, PLAN.md, `src/core/sim/`, `src/core/validate/`, `src/core/gen/calibrated.ts` rest on it. | None (bcb04bd) |
| `decompile_all.sh`, `extract_builtin_maps.py`, `summarize_blueprints.py`, [figures/](figures/) | The collecting tools: decompile the game, copy its built-in maps, summarize its blueprints. | Nothing; they feed the local-only `decompiled/` and `raw/builtin/`. | Adopted as tools (the oracle and import tests read what they copy). | None (bcb04bd) |
| [workshop/](workshop/), [WORKSHOP.md](WORKSHOP.md), [WORKSHOP-INTEGRATION.md](WORKSHOP-INTEGRATION.md), `workshop.json` | 130 workshop maps and the 19 official ones measured against the generator. | Players' maps vary far more than ours; the start thresholds, walk distance and variety scale; Steam ratings gave no usable signal. | Partly adopted: the measures and start rules (D85, D87); the ratings dropped (D137). | [#4](https://github.com/timbermods/dam-good-maps/pull/4) |
| [audit/](audit/) | A first-pass audit of beta risks, each with a repro. | Four findings (A1–A4), none above P2. | Adopted: A1 and A2 fixed in M9a, A3 and A4 in #72 (D129). | [#13](https://github.com/timbermods/dam-good-maps/pull/13) |
| [source-groups/](source-groups/) | How the official maps group their water and badwater sources. | Clean sources in rows of about 3 across the flow, 0.5 each; badwater alone 83% of the time, otherwise a close pair. | Adopted: D314; the rule is `src/core/water/sourceGroups.ts`. | [#78](https://github.com/timbermods/dam-good-maps/pull/78) |
| [probe/](probe/) | DGM Probe: a mod and a runner that play maps in the game unattended and record what happens. | Tall maps, M9a's maps and the 3D cases behave in the game as the model says. | Adopted as a tool (D149); batches only under the probe rule (D117, D218). | [#18](https://github.com/timbermods/dam-good-maps/pull/18) |
| **The generator** | | | | |
| [generative/](generative/) | M9 design versions 1 and 2: a prototype generator that invents maps, with its measures and briefs. | Version 2: 0 dam or edge walls on 3,353 maps, no clones in six of six themes. | Adopted: version 2 approved (D209); built as M9a, M9b finishes it (D278). | [#14](https://github.com/timbermods/dam-good-maps/pull/14), [#32](https://github.com/timbermods/dam-good-maps/pull/32) |
| [m9a/](m9a/) | M9a's own measuring scripts (the Any theme, the straight-river reference). | Information only, never a gate (D115). | Adopted: our own work, run from M9a's build. | None (M9a's commits) |
| [techniques/](techniques/) | A cited terrain-technique playbook and two experiments. | Independent spatial controls did not reliably widen useful variety. | Partly adopted: the ideas as proposals for M9 and 3D (D131); the experiments not adopted. | [#19](https://github.com/timbermods/dam-good-maps/pull/19) |
| [landscapes/](landscapes/) | 4,050 real terrain patches turned into heightmaps, and a library of 88 validated maps. | 26.6% of 12,150 conversions passed; generated contours run straight 13.9% against 2.0% in real terrain. | Partly adopted: the library is Real places (D136), its rebuild parked (D319, #35); the rest fed M9. | [#16](https://github.com/timbermods/dam-good-maps/pull/16) |
| [names/](names/) | Map names and descriptions drawn from each map's features. | A name must point to a measured feature; chosen by rule priority, never at random. | Taken into M9b's names and one-line description (D278); ships with M9b. | [#12](https://github.com/timbermods/dam-good-maps/pull/12) |
| [mechanics/](mechanics/) | The game's map mechanics verified against its code, and each map's place on eight strategy axes. | 12 open facts settled; nearest badwater is 15–24 tiles from the start; Canyon keeps no clean water through a nine-day drought. | Held for the Weather view (D133, D285; #73 held). | [#11](https://github.com/timbermods/dam-good-maps/pull/11) (replaces closed #9) |
| [pickplace/](pickplace/), [pickplace-water2/](pickplace-water2/) | Pick a place: real land with designed water, then its signature water with ESA WorldCover. | Round 1 passed 47 of 150, designed water 142, signature water 102 (68%) on a stricter gate. | Adopted as proposals for Pick a place (D166, D192); not built yet. | [#34](https://github.com/timbermods/dam-good-maps/pull/34), [#45](https://github.com/timbermods/dam-good-maps/pull/45) |
| **M9b's theme audits** (Codex) | | | | |
| [islands/](islands/) | Sea-first Islands generator. | Majority sea on 60 of 60 maps; all three outcomes 100% at every size. | Adopted on `feature/m9b` (D369, D370); ships with M9b. | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #139) |
| [delta/](delta/) | Delta plain and braided rivers. | All-outcomes 90% / 100% / 85% at 96² / 128² / 256²; faster first land. | Adopted on `feature/m9b` (D370); ships with M9b. | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #134) |
| [river-valley/](river-valley/) | One dominant river and broader valley floors. | 90% / 90% / 85% with one inflow and joining tributaries. | Adopted on `feature/m9b`, its own shaping only (D370); ships with M9b. | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #141) |
| [canyon/](canyon/) | Canyon first-map audit and a held-inflow prototype. | Gain negligible (41 to 42 of 60); found D348 broken on every map, a width-blind signature and slow 256². | Held (D370); its shared findings fixed in M9b. Later: a Codex round at 96². | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #135) |
| [highlands/](highlands/) | Highlands first-map audit and small-map shaping. | Already strong; the 96² gain costs nearly three times the first-land time. | Held (D370). Later: a Codex round at 96². | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #137) |
| [lake-basin/](lake-basin/) | Lake Basin audit and a central-catchment prototype. | The weakest theme (47%); the prototype reached 67% on the old base, 48% on the new. | Held (D370); round 2 adopted on its merits (D453). | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #140) |
| [settings/](settings/) | Weak settings: Verticality and Lakes. | Fixes both nightly checks, but 7 of 350 maps fail and some steps don't increase. | Held, last in the order (D370); Codex round 2 from a69c9f11 or later. | [#143](https://github.com/timbermods/dam-good-maps/pull/143) (closed #138) |
| **The forces** | | | | |
| [carve/](carve/) | Carve: water cutting its own gorge, with bends and oxbow lakes. | Varied bends and sediment-sealed oxbows; an unfed oxbow evaporating is correct physics. | Adopted (D194, D199, D216); released with the forces (D375). | [#47](https://github.com/timbermods/dam-good-maps/pull/47) |
| [craterize/](craterize/) | Craterize: a giant impact. | Rays read as a starburst; Steep and Terraced walls differ. | Adopted (D216); released (D375). | [#51](https://github.com/timbermods/dam-good-maps/pull/51) |
| [erupt/](erupt/) | Erupt: a volcano. | Steep and Broad differ; lava lobes wind; the plume cools. | Adopted (D216, D226); released (D375). | [#50](https://github.com/timbermods/dam-good-maps/pull/50) |
| [quake/](quake/) | Quake: a fault, Lift or Slide. | Both modes work, with a 3–20 tile Slide. | Adopted (D219); released (D375). | [#52](https://github.com/timbermods/dam-good-maps/pull/52) |
| [glaciate/](glaciate/) | Glaciate: a glacial valley with a lake chain and hanging falls. | Round 4: trough 9–12% wet with 3–7 hanging falls; the one-river goal not yet met. | Adopted (D246, D291, D312, D320); released (D375). Fast timing next (D374). | [#69](https://github.com/timbermods/dam-good-maps/pull/69) |
| [forces-core/](forces-core/) | One shared core for the four forces, with a demo. | One literal result operation and one history entry serve all four. | Adopted (D220); released (D375). | [#59](https://github.com/timbermods/dam-good-maps/pull/59) |
| [meander/](meander/) | Meander: age an existing river. | Curvature widens bends; sediment seals an abandoned bend. | Adopted into Carve as its Maturity option (D355); built directly in Rust (D381). | [#106](https://github.com/timbermods/dam-good-maps/pull/106) (closed #105) |
| [deposit/](deposit/) | Deposit: an alluvial fan at a valley's mouth. | Round 2: cone relief and broad lobes; 576 setting combinations pass every check. | Approved (D364); built directly in Rust after the release (D381). | [#114](https://github.com/timbermods/dam-good-maps/pull/114) (closed #104) |
| [rift/](rift/) | Rift: land cracking open and dropping. | A dropped block between two rough faults reads as a rift; floor relief kept. | Approved (#99); built directly in Rust (D381). | [#99](https://github.com/timbermods/dam-good-maps/pull/99) (closed #98) |
| [landslide/](landslide/) | Landslide: a moving hillside and natural dam. | The idea works, but Quake and the Rift make its scarp and Raise its debris. | Not adopted (D354); kept for its spillway findings. | [#103](https://github.com/timbermods/dam-good-maps/pull/103) (closed #101) |
| [erode/](erode/) | Erode: wind and water wear rock into caves, overhangs and arches. | Round 9 calibration: byte-identical to round 7; 0 dropped voxels. | Approved, built at 3D step 3 (D281). | [#74](https://github.com/timbermods/dam-good-maps/pull/74) |
| [block-tool/](block-tool/) | The Block tool: precise block editing under the support rule. | 864 gestures, 0 dropped voxels or ghost mismatches against the game-rule oracle. | Approved (D335); built at 3D step 3. | [#89](https://github.com/timbermods/dam-good-maps/pull/89) |
| [juice/](juice/) | Procedurally synthesised editor sounds. | One small engine, no samples. | Adopted (D205, D220) in `src/editor/juice/`. | [#58](https://github.com/timbermods/dam-good-maps/pull/58) |
| [juice-2/](juice-2/) | The sounds' second round: 24 CC0 recordings and musical runs. | Recorded foley with a bounded pitch ladder reads better than synthesis. | Adopted (D226): `public/sounds/juice-2/`, `src/editor/juice/bank.ts`. | [#64](https://github.com/timbermods/dam-good-maps/pull/64) |
| **The look** | | | | |
| [maplook2/](maplook2/) | The High look's water shader, soft shadows and calibrated badwater colours. | Badwater colours measured in game. | Adopted: colours (D177), the High look (D284); released (D378). | [#38](https://github.com/timbermods/dam-good-maps/pull/38) |
| [maplook3/](maplook3/) | A higher-fidelity High look: warm light, occlusion, tone mapping, haze, sky, strata. | About 165 fps with all stages on at 128² and 256². | Adopted into the High look (D242, D284); released (D378). | [#65](https://github.com/timbermods/dam-good-maps/pull/65) |
| [vegetation/](vegetation/) | Original pine, birch, oak and bush models, with wind and LOD. | The new models cost more near; 60 fps unverified on real hardware. | Adopted into the High look (D241); released (D378). Standard unchanged. | [#66](https://github.com/timbermods/dam-good-maps/pull/66) |
| [maplook-finish/](maplook-finish/) | "Finish the world": the diorama edge, water's finishing touches, landmarks, poisoned soil. | About 165 fps; the tone pass costs about 0.04 ms. | Partly adopted (D250): released in the High look (D378); visible seasons wait for the Drought and Badtide branch (D286). | [#67](https://github.com/timbermods/dam-good-maps/pull/67) |
| [high-soul/](high-soul/) | The High look's Timberborn materials: warm earth, ruins, contamination veins, cliffs. | Follow the game's references and its readability trade-offs. | Adopted (D334) into the High look; released (D378). | [#90](https://github.com/timbermods/dam-good-maps/pull/90) (closed #87) |
| [flow-arrows/](flow-arrows/) | Moving water and the Flow view: lanes, foam threads, wakes. | 47 lanes instead of 387; frame time unchanged at 165 fps; path building must leave the main thread. | Approved (D353); to build after the release, through the smoothness harness. | [#102](https://github.com/timbermods/dam-good-maps/pull/102) (closed #91) |
| **3D terrain** | | | | |
| [terrain3d/](terrain3d/) | Terrain above terrain: the game's rules, prototypes, a staged design. | Stacked-column water matches 17 of 19 official maps at IoU 0.99; the support rule predicts the game. | Adopted (D118–D127, D279–D280); step 1 built on a branch, its wiring held (#71). | [#20](https://github.com/timbermods/dam-good-maps/pull/20) |
| [3d-view/](3d-view/) | The 3D view in High and Standard. | 256² cave maps hold 164 fps; Erode, Block and Rift playback with zero hitches. | Approved (D365); built at 3D step 2. | [#117](https://github.com/timbermods/dam-good-maps/pull/117) (closed #116) |
| **Speed, scale and portability** | | | | |
| [simspeed/](simspeed/) | Exact water speedups, M9 budgets, stacked layers. | Five changes give 1.19× settle; 7 of 12 cases still miss the 256² budget. | Adopted (D130) into M9a. | [#17](https://github.com/timbermods/dam-good-maps/pull/17) |
| [simspeed-cycles/](simspeed-cycles/) | Exact-weather speedups and scheduling. | Four changes give 1.4×; the first drought ends after about 7.5 s at 128². | Held for the Weather view (D173). | [#33](https://github.com/timbermods/dam-good-maps/pull/33) |
| [water-speed/](water-speed/) | A byte-identical faster water settle. | About 1.25× at the median, 1.4× on 256² lakes and seas; identical on every check. | Adopted (D359) on `feature/m9b`; reaches `dev` with M9b. | [#112](https://github.com/timbermods/dam-good-maps/pull/112) (closed #111) |
| [determinism/](determinism/) | Cross-browser determinism. | 533 mismatches in 28 cases today; portable maths gave zero across 358 cases. | Adopted (D366); in the forces release (D375). | [#123](https://github.com/timbermods/dam-good-maps/pull/123) (closed #122) |
| [startup/](startup/) | Maps open fast: stored-state hydration, parallel preparation. | Editable in 1.30–1.44 s median, byte-identical on every map. | Approved (D367): part 1 after the release, part 2 with "The page is the editor". | [#127](https://github.com/timbermods/dam-good-maps/pull/127) |
| **Collaboration** | | | | |
| [collab-spike/](collab-spike/) | Serverless two-player editing over WebRTC. | A two-code join works (324 characters); maps identical over 523 edits; other networks unverified. | Taken into the brief (D362, `docs/COLLAB-BRIEF.md`); the two-code join is superseded by D431; collaboration waits for polish (D349). | [#109](https://github.com/timbermods/dam-good-maps/pull/109) |
| [collab-architecture/](collab-architecture/) | Patches, claims, footprints and checkpoints, part 2. | The architecture holds; exact force warnings are too slow (190–690 ms at 256²). | Approved; amended the brief's §3 and §5 (D362). | [#120](https://github.com/timbermods/dam-good-maps/pull/120) (closed #119) |
| [cycles/](cycles/) | A weather-cycle simulator and viewer, with every timing from the game's code. | In a badtide contamination moves by net flows; Canyon loses all water in a 25-day drought. | Held for the Weather view (D133, D285); the product's drought is analytic. | [#15](https://github.com/timbermods/dam-good-maps/pull/15) (replaces #10) |
| [claude/](claude/) | Groundwork for M12: 120 requests, a place resolver, seven tools, a harness. | No verdict recorded beyond deferral: all M12 work waits (D277). | Held for M12 (D88, D277). | [#5](https://github.com/timbermods/dam-good-maps/pull/5) |

## Still on open pull requests

No folder on `dev` yet. Verdicts are HANDOFF §0's.

| Investigation | What it is | Verdict | PR |
| --- | --- | --- | --- |
| `investigation/short-codes` | Shorter serverless join codes. | Superseded by D431 (short room code through a relay). | [#150](https://github.com/timbermods/dam-good-maps/pull/150) |
| `investigation/perf-audit` | A performance architecture audit: exact core, renderer, storage. | Approved, to merge; its ranked roadmap guides the speed work (D381). | [#152](https://github.com/timbermods/dam-good-maps/pull/152) |
| `investigation/small-starts` | The 96² start class, with an adoption patch. | Approved, to merge; first in M9b's adoption order. | [#153](https://github.com/timbermods/dam-good-maps/pull/153) |
| `investigation/gen-speed` | Generation speed: exact reuse and fewer redraws. | Approved; adopt round 1 (byte-identical, about 6% less CPU), then round 2 (about 12% fewer redraws). | [#155](https://github.com/timbermods/dam-good-maps/pull/155) |
| `investigation/rust-water` | Byte-identical Rust water. | Approved (D381); Rust in Chromium and Firefox, Rust in WebKit for larger maps only; native builds for batch jobs now. | [#156](https://github.com/timbermods/dam-good-maps/pull/156) |
| `investigation/rust-analysis` | Exact Rust analysis. | Approved, byte-identical; Firefox being re-measured. | [#157](https://github.com/timbermods/dam-good-maps/pull/157) |
| `investigation/rust-forces` | Rust forces: partial planners, identity, timings. | Round 1 not adoptable (about 5× slower); round 2 in flight with Codex. | [#158](https://github.com/timbermods/dam-good-maps/pull/158) |
| `investigation/parallel-water` | Deterministic multi-core water settling. | Approved (2026-10-02): threads at 256² and up in Chromium and Firefox, gated on portable maths. | [#130](https://github.com/timbermods/dam-good-maps/pull/130) |
| `investigation/scaling` | Scaling to 512-side maps. | Round 4 approved for adoption (files about a quarter of round 3's); adoption checks listed in HANDOFF §0. | [#132](https://github.com/timbermods/dam-good-maps/pull/132) |
| `investigation/performance` | Large-brush stalls in the released editor. | Paused: merge as an investigation, adopt none of its fixes; its harness is the gate for renderer R1 and moving water. | [#107](https://github.com/timbermods/dam-good-maps/pull/107) |
| `investigation/dam-sketch` | The dam sketch tool's engine (D383). | In flight with Codex; no verdict recorded. | [#159](https://github.com/timbermods/dam-good-maps/pull/159) |

Also with Codex, no pull request yet: `investigation/portable-math` (portable maths everywhere, the gate for parallel
water) and `investigation/rust-threads` (Rust water with threads).
