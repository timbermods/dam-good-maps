import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync('checks/'+name+'.json','utf8'));
const core=read('core'),browser=read('browser'),comparison=read('comparison'),audio=read('audio');
const hero=core.cases.find(c=>c.id==='default'),kyler=core.cases.find(c=>c.id==='kyler');
const f=x=>Number(x).toFixed(1),signed=x=>(x>=0?'+':'')+x;
const sizes=readdirSync('captures').map(name=>statSync('captures/'+name).size);
const table=core.cases.map(c=>{const m=c.metrics;return `| ${c.id} | ${m.dryFloor} | ${f(m.wetShare*100)}% | ${f(m.length)} / ${f(m.valleyLength)} | ${m.longestWall} | ${m.buildableBefore} → ${m.buildableAfter} | ${signed(m.buildableGain)} | ${signed(m.directGain)} |`;}).join('\n');
const material=core.cases.map(c=>{const m=c.metrics;return `| ${c.id} | ${m.cut} / ${m.deposited} | ${m.ratio.toFixed(3)} | ${m.floorWidth} | ${m.outwashDry} | ${c.basins.map(b=>b.depth).join(', ')||'none'} | ${m.treesMoved} / ${m.objectsRemoved} |`;}).join('\n');
const frameRows=[['Advance',browser.advance],['Retreat',browser.retreat],['Whole run',browser.all]].map(([n,t])=>`| ${n} | ${t.count} | ${f(t.median)} | ${f(t.p95)} | ${f(t.worst)} |`).join('\n');
const report=`# Glaciate — Round 2, after Kyler's review

![Default before and after on the same untouched map](captures/default-before-after.png)

**The default now leaves a broad dry valley with a narrow stream.** On River Valley 18, 128², the same head (64,16), Flow / Power 60 / Size Auto / Meltwater on gives **${hero.metrics.dryFloor.toLocaleString()} dry, level floor tiles**, **${f(hero.metrics.wetShare*100)}% of the trough under water**, and **${signed(hero.metrics.buildableGain)} buildable tiles overall** in the affected region. Its centreline runs ${f(hero.metrics.length)} tiles, ${f(hero.metrics.length/128*100)}% of the map width. The largest measured cardinal run on its curved outline is ${hero.metrics.longestWall} tiles. This is a modest net land gain on an input valley that was already largely buildable, not thousands of newly created building sites.

Changed: the full-width stepped-basin recipe is gone. A dry bank datum follows the existing valley; a narrow, continuously draining channel lies below it. There is room for a small head tarn and one terminal ribbon lake, with lakes omitted on short, cramped tongues. The lobe sweeps forward into an open scoured area. Aim has a broad natural bend. Non-plants swept by the floor are removed rather than left on islands. The visible tongue has a travelling rounded nose and moving surface streaks; no radial swelling. Terrain is committed during advance, before retreat finishes at both tested sizes.

Kept: deterministic seeds, a literal result operation, exact replay/undo/cancellation, retained water, source feed, the floor/22 ceiling, one material ledger, moved trees, recorded CC0 foley, and the editor's chunk renderer. No production files changed. [Round 1 report](https://github.com/timbermods/dam-good-maps/blob/f63e4aea0d24b63088e1fe4556b95ee8f0cbf8d1/investigation/glaciate/REPORT.md) remains in history; its lake-chain goal is superseded.

## Kyler's Power 47 case

![Untouched land, reproduced Round 1 failure, and Round 2 at Power 47](captures/kyler-review.png)

The review did not contain saved pointer coordinates. Running the old implementation at the original default head **(64,16), River Valley 18, Power 47, seed 891** reproduces the lake with ruin columns left in its floor. This is a matching reproduction, not recovered click telemetry. The same input now has **${kyler.metrics.dryFloor} dry floor tiles**, **${f(kyler.metrics.wetShare*100)}% water**, and **${signed(kyler.metrics.buildableGain)} buildable tiles**. Swept ruin columns are removed under the force's excavation policy. The exact pinned reference, coordinates and surviving Round 1 ruin IDs are recorded in [checks/kyler-reproduction.json](checks/kyler-reproduction.json); its large result stays in ignored local storage.

## Carve gives you water; Glaciate gives you land

![Same valley and gesture, Glaciate beside Round 2 Carve](captures/carve-comparison.png)

Both start from the identical untouched River Valley 18 map and head. Carve uses the pinned Round 2 code at cd9225c: **Power 100, Width 24, Depth 12, Steep, Wander 5, Keep river**, seed 891. Glaciate uses the default settings above. The oracle is read-only and is not imported by the demo.

| Same input | Glaciate | Carve |
| --- | ---: | ---: |
| Net buildable tiles, whole affected region | ${signed(comparison.glaciate.buildableGain)} | ${signed(comparison.carve.buildableGain)} |
| Cut blocks | ${comparison.glaciate.cut} | ${comparison.carve.cut} |
| Deposited blocks | ${comparison.glaciate.deposited} | ${comparison.carve.deposited} |
| Changed terrain cells | ${comparison.glaciate.changed} | ${comparison.carve.changed} |

The visual difference is now the broad green floor and dry land beside the narrow stream, with receiving ground at the end. The cliffs remain recognisably related to Carve's block-scale cut. The small lakes are secondary. This comparison does not claim Carve cannot leave land, deposit sediment or retain oxbows in its other settings. [Full comparison evidence](checks/comparison.json).

## The two acts

![Recorded flowing advance and retreat](captures/two-acts.gif)

![Two-act contact sheet from the actual browser](captures/two-acts.png)

A real pointer click starts the default event. Fixed ribbon geometry covers the valley; a rounded leading edge travels from head to snout, reaching the end at about three seconds. Advected surface bands make the downstream motion visible. Retreat removes the ice from snout back to head. The flat-ground lobe uses this same directional tongue. Ice does not grow by scaling a disc. The renderer remeshes changed integer chunks and adds the overlay; no terrain GPU morph is used.

The browser compares every displayed terrain height with the literal final plan. On 128², the terrain was exact **${f(browser.terrain128.finalMs)} ms after input**, before retreat ended at ${f(browser.terrain128.retreatEndMs)} ms. On 256² it was exact at **${f(browser.terrain256.finalMs)} ms**, before retreat ended at ${f(browser.terrain256.retreatEndMs)} ms. Terrain and object changes finish during advance; water may continue settling afterwards. The overlay animates on the main thread independently of water work. Esc and Undo are checked during advance, retreat and final settling, including rejection of a late completion.

## The land and its limits

Flow's priority-flood route follows existing low corridors. Power controls requested reach; boundaries and the protected start can shorten it. The default now covers a useful part of the 128² map. Auto width is 8 + 36 × Power/100, rounded, giving **30 tiles nominal at Power 60**; manual Size remains 4–64. Width varies along the land, and the tongue narrows near the boundary so its end is not clipped into a square. The player still gets only Mode, Power, Size and Meltwater, plus Try another.

The floor meets the original upper shoulder as a steep curved wall. Its longitudinal datum descends in terraces, above a separately incised stream. Existing wet tributary entrances get connections into that stream. Outlets reach the actual map boundary: stopping two rows inside the map had created accidental dams during development. Meltwater sources use real exported source entities, with strength 0.4 + 0.025 × nominal width, capped at 2. Wider existing 256² rivers get more channel capacity. Lakes, where there is room, are small pockets below the channel outlet and are stored in the operation.

Cut material first grades receiving ground where a dry forward fan fits; the stream remains open. Low terminal arcs and lateral ridges follow the footprint. Remaining material fills narrow ledges against existing terraces. Paired one-block cuts/fills join broken pads while conserving volume. There is no uniform circular outer apron. Trees move to actual supported edge positions, retaining IDs/species/components; swept non-plants are removed. Pinned objects and the start remain protected. Slopes whose connections are lost are pruned before export.

![Gallery reference terrain](captures/gallery-comparison.png)

Glencoe is the clearest dry-floor composition reference. Lauterbrunnen and Hooker Valley are also shown as unchanged bundled heightfields at normalized framing; they are not photographs or identical physical scales. The generated floor is still more regular than the real valleys. River Coe is absent from this checkout's gallery, and Yosemite remains excluded. Elevation attribution is in [ATTRIBUTION.md](ATTRIBUTION.md).

![Aim, lobe, low ground, and tall terrain](captures/edge-cases.png)

Aim bends through the range and uses the same dry-bank/stream rules. The lobe is mostly dry scoured ground with a small wet pocket and an open moraine edge. Low ground widens and uses real shoulder material to raise dry land. A fan is not guaranteed when the glacier ends near an edge, a protected start, an existing river or rising ground. The table reports zero where no new dry fan was made; it does not relabel a side ridge as outwash.

![Power 15, 60 and 95](captures/power.png)

Same Power-comparison input as Round 1: head (96,32), River Valley 18, Power 15/60/95, Auto Size. This head is close to the map boundary, so all three reaches are boundary-limited. Low and high Power can still lose building space there; the exact values are reported below. A universal positive-gain guarantee for every possible gesture is not claimed.

![Three deterministic alternatives](captures/alternatives.png)

These are the same original terrain and gesture with three successors of seed 891. They vary widths, tarns and moraines without changing the underlying drainage route or stacking glaciers. All three default variations are required by tests to gain building space.

## Measurements that count dry land

A **buildable tile** is dry (water depth ≤0.05) and belongs to at least one level 2×2 pad. Trees are assumed clearable; other entity footprints and the start are excluded. This is building space, not a claim of path access from the start or an in-game construction probe. **Dry floor** applies this test only inside the broad trough footprint. Water share counts every footprint tile above the same depth threshold.

The before/after counts use exactly the same **affected region**: the trough, changed ground, wet/dry transitions and changed non-plant footprints, with a one-tile collar because a neighbouring edit changes a 2×2 pad. Tests require its net gain to equal the whole-map gain, preventing an omitted downstream loss from improving the result. The **direct-only** column separately counts just the trough and height-changed cells; large-map, Aim and another-2 gain overall despite losing building space inside those cells, because of drainage and adjacent-pad changes. Both figures are shown rather than hiding this distinction.

Length is the centreline arc length versus the portion of the valley followed. They are equal by construction for Flow; this is not the full length of the valley to the sea. The default sinuosity is ${hero.metrics.centreline.toFixed(4)} versus ${hero.metrics.valley.toFixed(4)} for its followed route. Aim compares with its aimed curve, not a geographic valley. Wall run is the longest exact horizontal or vertical segment of the rasterized trough outline, including caps; it is not a guarantee about every diagonal or every pre-existing map wall. The regenerated captures were inspected for square ends and long straight cuts.

| Case | Dry level floor | Trough wet | Length / followed valley | Longest wall | Buildable before → after | Net affected | Direct-only net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

| Case | Cut / deposited blocks | Ratio | Median dry bank width | New dry outwash tiles | Basin depths below outlet | Trees moved / non-plants removed |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
${material}

Dry bank width is the longest contiguous dry, equal-height run across each sampled normal section, then the median; the river splits the two banks. It is not the full nominal width, and submerged floor is no longer counted as building land. The raw record still includes cross-section range and flat share for comparison with Round 1. Every individual basin's floor, outlet, depth, area and feed reachability is in [checks/core.json](checks/core.json).

## Performance and verification

Chrome ${browser.browser}, 1200×820, headless, **${browser.renderer}**. Normal speed, warmed sound on; the performance run takes no screenshots. Values are requestAnimationFrame intervals on this host, not in-game FPS.

| Interval at 256² | Frames | Median ms | p95 ms | Worst ms |
| --- | ---: | ---: | ---: | ---: |
${frameRows}

Long tasks: **${browser.longTasks.length}**. Planning: ${f(browser.planningMs)} ms. First terrain commit: ${f(browser.firstTerrainMs)} ms. Full endpoint, including the final water solve: **${f(browser.totalMs/1000)} seconds**, ${browser.water.ticks} water ticks. The terrain timing above is measured separately from that endpoint. [Browser evidence](checks/browser.json).

The model suite passes **${core.checks} assertions**, plus 12 schema/malformed-operation checks and exported-file checks on ${core.cases.length} endpoints. Coverage retains determinism, exact literal replay, atomic invalid import, undo/cancel, material accounting, bounds, retained water/feed and alternate seeds. Round 2 adds dry-majority floors, few basins, no swept non-plant survivors, no invented water on previously dry advance tiles, final terrain by the end of advance, outline runs at most 12 tiles, correct region accounting, and positive gain for the default, Power 47, the near-edge default-Power case and three default variations. Browser checks cover the real click, both terrain deadlines and cancellation through final settling. Typecheck and Vite build pass; the standalone bundle retains the size advisory.

The standard-map exports pass the repository's load/design checks, including valid GUIDs, slopes and a 960×540 thumbnail. No Timberborn launch was performed. The tall VT85 pre-build still lacks a playable start, so its game download is refused. The tall solver can reach its tick cap; the UI and raw results say so rather than calling it settled. The existing dev editor has no Verticality control: this labelled generator pre-build remains a substitute study, not an editor acceptance test.

The five CC0 recordings and their provenance are unchanged. The actual recipe measures ${f(audio.strongest100msDbFS)} dBFS in its loudest 100 ms window and ${f(audio.peakDbFS)} dBFS peak. Sound can be turned off; the low groan is still pitched wood foley, not a glacier field recording. [Manifest](bank.json), [audio checks](checks/audio.json).

Remaining limits: some constrained gestures lose land; outwash needs forward room; narrow or very steep terrain can leave shelves; source/catchment capacity is approximate; cliff regularity and sonic likeness still need Kyler's eye and ear. No fifth control was added. An ice-sheet mode remains a possible later investigation and is not built.

## Run and adopt

[README](README.md) runs the demo; [INTEGRATION](INTEGRATION.md) updates the adoption proposal. Everything changed is under investigation/glaciate/. Captures total **${(sizes.reduce((a,b)=>a+b,0)/1048576).toFixed(2)} MiB**, largest **${(Math.max(...sizes)/1048576).toFixed(2)} MiB**; large reference/results stay ignored. This round updates the existing investigation/glaciate branch and PR #69. No merge, approval, auto-merge, other branch, tag or release is part of this task.
`;
writeFileSync('REPORT.md',report);console.log('Round 2 report generated from checked measurements');
