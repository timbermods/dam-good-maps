# The archive

History, kept as written. Nothing here changes what gets built; the living documents (see [docs/README.md](../README.md))
say how things are and what is next. Archived files are never rewritten; only their relative links are kept working.

## What is in it

- [decisions.md](decisions.md): PLAN §20's full decision table as it stood at D390.
- [plan.md](plan.md), [editor-plan.md](editor-plan.md), [roadmap.md](roadmap.md): the superseded or finished parts of PLAN.md, EDITOR_PLAN.md and ROADMAP.md.
- [status-2026-10-01.md](status-2026-10-01.md), [handoff-2026-10-01.md](handoff-2026-10-01.md): STATUS.md and HANDOFF.md as they were before the prune.
- [decisions-pending.md](decisions-pending.md): the answered and closed rows of the pending-decisions list.
- "Stale findings", the last section of this file: the findings later ones replaced, moved from FINDINGS.md.
- [progress/](progress/README.md): the finished progress logs, one file per milestone and step.
- [progress-log/](progress-log/README.md): the Progress log issue's monthly copies.
- [chats/](chats/README.md): the previous versions of the planning chat's handoff (the latest, [2026-10-02](chats/2026-10-02.md), is the one before the prune).
- [feedback/](feedback/): Kyler's feedback files.
- [AUDIT.md](AUDIT.md): the early audit. [spike-m3.md](spike-m3.md): the delivery spike. [m9-design.md](m9-design.md): the generator's design (design version 2).
- [ingame-log.md](ingame-log.md): the in-game log. [merged-branches.md](merged-branches.md): branches merged and deleted.
- [UI-QUESTIONS.md](UI-QUESTIONS.md): the interface questions, superseded by [UI-BRIEF.md](../UI-BRIEF.md).

Left in place, because tools write to them or read them:

- `docs/progress/<name>/` (forces, glaciate, live-editing): capture images, linked from the progress logs here.
- `docs/look/`, `docs/map-look/`: look captures. `docs/sheets/`: the contact sheets, one per step.
- `investigation/` is the investigations' archive in place (code under `src/` and `tools/` names its folders); [investigation/README.md](../../investigation/README.md) is its index.

# The story

How Dam Good Maps' identity has changed, one short chapter per major turn (Kyler's decision, feedback item 33, D326).
Each chapter links to its decisions in [PLAN.md §20](../../PLAN.md#20-editor-decisions). The decision log stays as
written; where a later decision overturned an earlier one, the chapter says so. Add a chapter at every milestone or
major turn.

## 1. Maps are created, not copied (2026-09-24 to 2026-09-25)
The generator emits features and builds the map from them (D2), never approximating existing maps or stamping a few
archetypes (D108); no built dam walls (D111); Claude steers the generator and never hand-builds a map (D139).

## 2. The generator rebuilt from processes: design version 2 (2026-09-25)
The first generator was judged not good enough. A design step came before M9 (D109, D112): maps that feel authored,
each with one or two deliberate intentions steered into being by processes (D138), a frozen scope (D189) and approval
with conditions (D209). M9a built it and was released as `m9a-done` (0.7.0); themes became optional leanings (D208).

## 3. "M9 is the soul", then "the editor is where the magic happens" (2026-09-27)
Each M9 stage was to be judged by Kyler's eye (D252, D273); a day later the framing turned: the editor is where the
magic happens and the generator provides the canvas (D282). M9b's priorities follow from that.

## 4. The roadmap pruned (2026-09-27)
M10 and M11 were cut (D253); M9c was folded into M9b (D278); the Map quality checkpoint, the separate Frame pass and
the refinement milestone were cut (D283); slimmed steps and the time-lapse moved to Later (D285).

## 5. Live editing and the forces (2026-09-25 to 2026-09-28)
Live editing became how a map is edited (D158, D179, D184), with the editor as the page itself (D232-D234, D237).
Carve became a force of nature (D194), and the forces gained their principles: bound only by nature (D257), clean
gestures with no predicted paths (D258), a camera that moves only when the player moves it (D265) and their own pace
(D266). After Kyler's sitting the details came back behind More (D309) and the forces got a size ring (D312). One
forces branch carries them all (D320).

## 6. Real places: a canvas to reimagine (2026-09-24 to 2026-09-29)
A gallery of real landscapes (D136, D155-D157), kept on their own land rather than dropped for failing a check
(D245), and a canvas for every tool and force (D272). Later rounds set the water and the size (D271, D306). The
rebuild is parked until the changes to every map settle (D319).

## 7. 3D terrain, from deferred to core (2026-09-25 to 2026-09-27)
Generated terrain first stayed at 16 levels or below (D4). Caves, overhangs and arches became essential (D118-D127),
then a full scope built in four steps, with Erode as the player's force for it (D279-D281).

## 8. Compute is a resource, and the feedback build order (2026-09-28 to 2026-09-29)
Kyler's standing rule and the models (D316-D318) shaped how sessions work; his forces-preview feedback became six
parallel batches (D321-D326).

# Stale findings

Findings that a later finding replaced, moved here from [FINDINGS.md](../FINDINGS.md) by the document prune (PLAN §20 D390),
verbatim, each under the section and the finding it was marked on. What replaced each is named in its text.

From FINDINGS.md, "The game's water", under "Stacked-column water matches the game: 17 of the 19 official maps reproduce their stored water at IoU 0.99...":

- **Stale:** "a single-layer port is essentially exact" (WS Q2). It scores 0.19, 0.04 and 0.21 on Hollows, Nomads and
  Pressure. Replaced by D120 and D293.

From FINDINGS.md, "The game's water", under "The game resets water momentum at load unless the file stores the settled flows: Delta 128² seed 1 had...":

- **Stale:** "writing all-zero outflows is safe" (WS Q2, FMT §0). Replaced by the fix in M9A: the files store the flows.

From FINDINGS.md, "Sources", under "**Source groups (#78, D314).** Clean sources come in rows across the flow (25 of 31 rows across, none...":

- **Stale:** "rows of 3–8" (WS Q1) and D171's single sources placed side by side. D314 sets the rule.

From FINDINGS.md, "Terrain, height and support", under "**The ceiling is 22 (D172, D244).** Every editor tool goes to it on any map; land above 16 makes a tall...":

- **Stale:** "keep terrain at 16 or less" (BLK §5 implications). Replaced by D132, D172 and D244.

From FINDINGS.md, "The start", under "**The starting-logs floor (D224, amended D227): 178 logs for 1.1.2.4.** Grown trees by species yield,...":

- **Stale:** 167 logs (D224's first figure, before the Breeding Pod joined the essentials, D227); 60 / 40 / 20 trees
  (D164); 120 / 80 / 40 logs (#68); "at least 100 trees within 20 tiles" (NAV §11).

From FINDINGS.md, "The DGM Probe: confirmed behaviours", under "**M9a's 15 maps** (batch 20260927-1443, judged again under D297 and D302): 101 passed, 2 failed. Every map...":

- **Stale:** 98 passed, 5 failed (the 0853 batch, water momentum reset) and 99 / 4 (the 1443 batch before the recompare, a stale model reference).

From FINDINGS.md, "Generated maps: what the design measured", under "**Design version 2** (D138, approved): 0 dam walls and 0 edge walls on 3,353 maps; 100% final in every...":

- **Stale:** design version 1 ([REPORT](../../investigation/generative/REPORT.md)); its "current generator" column is m8-done (0.6.0).

From FINDINGS.md, "Generated maps: what the design measured", under "**Pick a place** (three rounds, each replaced by the next): round 1 passed 47 of 150; designed water 142...":

- **Stale:** [pickplace](../../investigation/pickplace/REPORT.md) and the 142 of 150 (a weaker gate; not comparable).

From FINDINGS.md, "Weather", under "The exact cycle model follows the game's own timings. In a badtide contamination moves by net flows, so it...":

- **Stale:** the first cycle model's estimates, which it replaces.

From FINDINGS.md, "Measured performance (where a decision uses it)", under "**Speedups (D130).** The five-change combination gives 1.19x canonical settle and 1.10x full generation;...":

- **Stale:** simspeed's 1.13x for the original cycle model; it does not apply to the exact model.
