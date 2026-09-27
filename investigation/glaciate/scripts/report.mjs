import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync('checks/'+n+'.json','utf8')),core=read('core'),browser=read('browser'),exports=read('export'),audio=read('audio'),visual=read('visual');
const f=(n,d=1)=>Number(n).toFixed(d),pct=n=>f(n*100)+'%',signed=n=>(n>0?'+':'')+n,get=id=>core.cases.find(c=>c.id===id),time=id=>browser.timings.find(c=>c.id===id);
const fail=c=>Object.entries(c.guardrails).filter(([,v])=>!v).map(([k])=>({walls:'walls',waterfalls:'falls',water:'wet share',riverWidth:'river width',oneRiver:'one river'}[k])).join(', ')||'none';
const keyIds=['hero-canyon','hero-highlands','hero-tall','kyler-aim'];
const keyRows=keyIds.map(id=>{const c=get(id),q=c.metrics;return `| ${id} | ${pct(q.wetShare)} | ${q.riverWidthMin}–${q.riverWidthMax} | ${q.channels} | ${q.waterfalls} | ${q.longestWall} |`;}).join('\n');
const rows=core.cases.map(c=>{const q=c.metrics;return `| ${c.id} | ${c.x},${c.y}${c.end?' → '+c.end.join(','):''} | ${pct(q.wetShare)} | ${q.riverWidthMin}–${q.riverWidthMax} | ${q.channels} | ${q.waterfalls} / ${q.hangingValleys} | ${q.longestWall} | ${c.hydrology.offChannelWet} | ${fail(c)} |`;}).join('\n');
const land=core.cases.map(c=>{const q=c.metrics;return `| ${c.id} | ${q.dryFloor} | ${signed(q.buildableGain)} | ${q.wallMedian}/${q.wallMax} | ${q.widthMin}–${q.widthMax} | ${f(q.maxPoolJoin)} | ${f(time(c.id).terrainFinalMs)} | ${c.settled?'settled':'tick cap'} · ${c.ticks} |`;}).join('\n');
const materials=core.cases.map(c=>{const q=c.metrics;return `| ${c.id} | ${q.cut}/${q.deposited}/${q.carriedAway} | ${q.treesRemoved}/${q.objectsRemoved} | ${f(q.cleanAbsorbed,2)}/${f(q.badSwept,2)} |`;}).join('\n');
const heroes=core.cases.filter(c=>c.group==='hero').map(c=>`### ${c.map} · click ${c.x},${c.y}\n\n![${c.id}: valley view](captures/${c.id}-valley.png)\n\n![${c.id}: same-camera before and after](captures/${c.id}.png)\n\n[Full before](captures/${c.id}-before.png) · [Full after](captures/${c.id}-after.png). **${pct(c.metrics.wetShare)} wet**, **${c.metrics.waterfalls} falls**, river span **${c.metrics.riverWidthMin}–${c.metrics.riverWidthMax}**, maximum **${c.metrics.channels} wet passages**. Net buildable land **${signed(c.metrics.buildableGain)}**, informational only. Missed guardrails: **${fail(c)}**.`).join('\n\n');
const images=group=>core.cases.filter(c=>c.group===group).map(c=>`![${c.id}, ${c.map}, head ${c.x},${c.y}](captures/${c.id}.png)`).join('\n\n');
const sizes=readdirSync('captures').map(n=>statSync('captures/'+n).size),timings=browser.timings.map(t=>t.terrainFinalMs),spring=get('spring'),flat=get('flat'),start=get('through-start').start,t256=time('hero-highlands');
const startFindings=exports.cases.filter(c=>!c.passed).map(c=>`- **${c.id}:** ${c.failures.map(e=>e.id+': '+e.message).join('; ')}`).join('\n');
writeFileSync('REPORT.md',`# Round 4: polish

Round 3's mountain carving, cirque, walls, click/drag gestures, arrow, object sweep, clean-source absorption and never-refuse behavior remain. This round changes the river's terrain and inlets, gives every eligible hanging mouth a spring, and removes automatic camera movement. **Net buildable land is information only; the 70% newly-buildable guardrail is retired.**

Flooding is substantially reduced, but **the one-river requirement is not yet met across the sample**. The heroes are **${keyIds.slice(0,3).map(id=>pct(get(id).metrics.wetShare)).join(', ')} wet**, with **${keyIds.slice(0,3).map(id=>get(id).metrics.waterfalls).join(', ')} hanging falls** (Round 3: 2, 1, 0). Kyler's cross-valley Aim is **${pct(get('kyler-aim').metrics.wetShare)} wet with ${get('kyler-aim').metrics.waterfalls} falls**. Random-3 remains **${pct(get('random-3').metrics.wetShare)} wet**. Long side joins, one-tile narrowings and multiple wet spans remain visible failures; no water is masked and no failing case is omitted.

![Default Canyon click 22,22: before and after](captures/default-before-after.png)

![Default valley view beside unchanged Lauterbrunnen](captures/valley-reference.png)

| Case | Trough wet | River width range | Separate wet passages, goal 1 | Falls | Longest straight wall |
| --- | ---: | ---: | ---: | ---: | ---: |
${keyRows}

These are the unchanged, conservative Round 3 wet-cross-section counters, including pools and side feeds. They are not corridor design widths. The complete measurements and visual audit follow below.

## What changed in the land

The spreading had several causes. The river used an unshifted station floor while bars used an irregular shifted floor; river bends could meet a hidden uphill sill. A bank based only on its own local floor opened lateral spillways beside a higher bar. Corner-connected raster cells could strand a pool because the water solver flows through shared edges. Concave rims could interrupt a straight pool join. Outside wet terraces could enter at several places, and the old outgoing route could re-enter an Aim trough as a second river.

The main river now reads the actual bar field, keeps a non-increasing bed across its full width and protects that profile from joining cuts. Diagonal joins have explicit shared-edge connections. Small pools join through the floor to a draining reach at or below their level; nearby feeds can share a receiver. Connectivity is recomputed when a pool changes an earlier reach. Banks account for the higher side of a bar and the receiving outlet. Surviving outside inflows receive compact notches, and potential flow identifies outside terraces that may become wet. The outgoing river steps down at the moraine and stays outside the carved floor when the old route would re-enter it. Its destination remains the original receiving edge.

These are literal integer terrain edits, using the existing water solver, meshes and materials. There is no renderer water mask, depth threshold change, decorative water or modified simulation schedule. The river keeps the lowest floor datum, but some banks are now two levels above the bed and some joining reaches still look excavated. **That visual limitation is not dismissed by a passing wet-share number.** Pools generally occupy a few tiles; their joins are not consistently the requested few tiles long.

With Meltwater on, each selected hanging mouth with adjacent high ground behind it gets a real clean source at its lip. Catchment and variation seed set different strengths. Their combined strength is capped at \`max(0.25, riverRadius × 0.7)\`; absorbed clean river strength is preserved in full. Actual falls are counted after simulation, so planned springs can merge at a lip or produce a fall below the counting threshold. Try another changes the springs as well as the existing morphology.

The camera has no advance follow, automatic recenter or map-load reposition. Clicked view buttons, orbit, pan and zoom are player actions. A camera inside the old mountain stays there until the player moves it.

## Valley views

${heroes}

Lauterbrunnen above is the repository's unchanged gallery heightfield, with the same materials and unscaled heights. It is not a photograph, an edited hero or game-extracted artwork. The before/after panels share a camera. The low views are explicitly placed by the capture operator, looking uphill from the new floor. Maps retain their different physical scales.

## Kyler's cases and the two acts

The default Canyon 10 click **22,22**, Power **60**, Auto Size **30**, Meltwater on, seed **891**, is the first hero above. It is the unchanged default demo gesture.

![Canyon cross-valley Aim](captures/kyler-aim.png)

For the unspecified cross-valley endpoints I chose **24,80 → 96,36**, before inspecting its result, across Canyon 10's existing valley. It uses Power **60**, Auto Size and Meltwater on. This is an additional case, not a replacement for the original ridge-crossing Aim. Both are also verified through real browser pointer drags.

![Two acts with a fixed camera](captures/two-acts.gif)

![Frames from the same fixed-camera event](captures/two-acts.png)

The camera is positioned once before the event and never follows the ice or exposed ground. It can start inside the old mountain, as requested. The animation still advances for three seconds and retreats for two; water may settle afterwards. GIF frame delays preserve the actual capture intervals, and encoding happens after capture. Performance runs are separate and do not encode screenshots. The GIF and every timed force have frame-by-frame camera pose assertions.

Across **${core.cases.length}** cases, every displayed height equals the literal endpoint at **${f(Math.min(...timings))}–${f(Math.max(...timings))} ms** after input, before retreat ends. Canyon is exact at **${f(time('hero-canyon').terrainFinalMs)} ms**; 256² Highlands at **${f(t256.terrainFinalMs)} ms**.

## Random and modest ground

The six random high-ground heads are the same independent LCG draws as Round 3, seed **${core.randomSeed}**, over original top-quartile heights with a 12-tile inset. No planner filtering, reroll or replacement. The fixed map order is Highlands128, Highlands256, Canyon128, tall128, Highlands128, Highlands256.

${images('random')}

Random-6, previously about 55% wet, is now **${pct(get('random-6').metrics.wetShare)} wet** with **${get('random-6').metrics.channels} measured passage**. Random-3 remains the flooding exception at **${pct(get('random-3').metrics.wetShare)}**, including **${get('random-3').hydrology.offChannelWet} unmarked floor tiles** with water deeper than 0.05. The other cases are not substituted for it.

The three modest-ground clicks continue that random sequence over original 17×17 neighbourhoods with **two to four levels of relief**, before planning. Their coordinates and original relief remain in [core.json](checks/core.json).

${images('modest')}

## Flat ground, the spring and Meltwater off

![River Valley flat-ground click](captures/flat.png)

River Valley 18, click **32,32**, still carves immediately: **${flat.metrics.dryFloor} dry floor tiles**, **${pct(flat.metrics.wetShare)} wet trough**. Power 0, 60 and 100 all change terrain, and a uniform-plateau check still verifies that Try another can choose a different direction. There is no relief refusal.

The prior downstream-course limitation remains: **${visual.cases.find(c=>c.id==='flat').oldCleanWetTilesNowDryOnUnchangedGround} old clean wet tiles on unchanged ground are dry afterwards**. Conserving source strength does not guarantee preservation of every old river segment. Do not treat land recovered by drying the old course as newly carved valley value.

![Glacier at a real mountain spring](captures/spring.png)

The real Highlands 256² spring at **61,222**, level 15, is swept into the cirque head with **${f(spring.metrics.cleanAbsorbed,2)} clean strength** preserved. The outgoing course has **${spring.downstream.after} wet tiles beyond the trough/moraine**. This endpoint ${spring.settled?'settles under the canonical test':'reaches the canonical tick cap'}.

![Same spring gesture, Meltwater off](captures/spring-dry.png)

Meltwater off adds no head or hanging sources and no retained water. This saved endpoint is **${pct(get('spring-dry').metrics.wetShare)} wet**. Untouched outside sources remain in the map; off mode does not secretly delete them or suppress any water they send into another result.

## Power, variation, Aim and the start

![Power 50, 60 and 95](captures/power.png)

![Three successive Try another seeds](captures/alternatives.png)

Low/default/high Power are **50/60/95**, Auto Size **26/30/42**. Variants reuse the original map and gesture without stacking glaciers; the mountain route remains unchanged.

![Only the straight Aim arrow during dragging](captures/aim-drag.png)

![Original Aim through a ridge](captures/aim.png)

The original Aim remains **22,22 → 98,96**. Release removes the arrow and starts the force. There is no Mode dropdown or predicted terrain footprint.

![Start swept outside the trough](captures/through-start.png)

Exactly one start moves from **(${start.before.join(',')}) to (${start.after.join(',')})** on level ground outside the trough. It has no effect on the carve. Surviving trees and objects keep their full original data and coordinates; swept sources and unsupported old slopes are removed. The editor's start findings remain information, not a force veto.

## Measurements for every case

Trough wet share is the fraction of \`mask === 1\` floor cells with actual simulated depth **>0.05**. River widths are contiguous wet runs touching the marked river along sampled normal cross-sections. Separate wet passages is the maximum number of disjoint wet runs across a whole floor section. This conservative measurement includes side feeds, plunge pools and another crossing of a meander; it also exposes unintended parallel water. It is unchanged from Round 3 and is not trimmed to make the goal pass. A one-tile width remains a narrowing warning, including the short random-1 sample.

Falls are actual wet outside-to-inside edges with a drop of at least three levels and a wet landing; edge pixels within five tiles count as one. Main-river cascades are excluded. Straight wall is the longest exact cardinal run of the rasterized outline, including caps. Off-channel wet counts actual wet floor cells outside the planned river/pool/feed footprint; zero does not mean that long planned joins look natural.

| Case | Head / Aim end | Wet share | River width | Wet passages | Falls / mouths | Straight wall | Off-channel wet tiles | Missed guardrails |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows}

Wet share, river width, one river, falls and wall measurements remain visible. The ordinary width target is about 2–5 tiles; a large absorbed or incoming river may need more, but pool/confluence widening is not automatically excused as carrying a big river. The legacy width flag conservatively keeps the 2–5 check. The falls flag asks for at least two where at least two mouths exist; the median-wall flag remains four levels. No numeric straight-run limit was supplied, so every run is reported directly. The **70% new-land pass/fail is removed**.

Buildable means dry (depth ≤0.05) and part of a level **2×2 pad**, excluding non-plant footprints; trees are clearable. Affected net includes every height, wet/dry and non-plant footprint change plus a one-tile pad collar, and tests require equality with the whole-map net. Dry floor, net land, old/new land counts and wall/floor dimensions are informational. Pool join length below is the actual planned path length, replacing Round 3's straight-line gap estimate.

| Case | Dry floor | Net buildable, info | Wall med/max | Floor width range | Longest pool join | Terrain final ms | Water solve |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${land}

| Case | Cut / deposit / carried away | Trees / other objects swept | Clean absorbed / bad swept |
| --- | ---: | ---: | ---: |
${materials}

## Verification and limits

**${core.checks} model assertions**, **12 schema/malformed-operation checks**, structural exports of all **${core.cases.length}** endpoints, typecheck and Vite build pass. The build retains its bundle-size advisory. Tests cover deterministic planning and water scheduling, literal replay, exact undo/redo and Esc, atomic imports, source strength, swept objects, supported unique starts, physical bounds and exported displayed water. Structural exports have 960×540 thumbnails. Start-specific editor findings remain:

${startFindings||'None.'}

Chrome **${browser.browser}**, **${browser.renderer}**, 1200×820. All browser endpoints match Node. Real default click, both Aim drags, the flat click, the single arrow, no Mode control, undo including fall meshes, Esc during both acts and final settling, and rejection of late completion pass. Camera position, target, orientation, FOV and zoom stay fixed throughout all timed frames and the GIF, and through undo, Esc and map loading. No browser exceptions.

256² frame intervals: advance median **${f(t256.advance.median)} ms**, p95 **${f(t256.advance.p95)} ms**, worst **${f(t256.advance.worst)} ms**; retreat median **${f(t256.retreat.median)} ms**, p95 **${f(t256.retreat.p95)} ms**, worst **${f(t256.retreat.worst)} ms**. Planning **${f(t256.planningMs)} ms**. These are local browser timings, not Timberborn FPS. No game launch or in-game parity claim is made.

Every published valley view and overview was inspected for thin channels, long joins and ditch networks; see the [case-by-case audit](checks/visual.json). **The unresolved limits are the random-3 floor film, extra wet cross-sections, long/narrow side joins, some deep-looking banks, and old downstream-course drying.** The pictures take precedence over numeric passes. Round 4 substantially improves the original flooding and fall scarcity, and completes the fixed-camera and guardrail changes, but does not claim that every requested hydraulic or visual constraint is solved.

The tall input is Round 1's unchanged VT85 heightfield with the same loader-only start at **71,64,8**; no new terrain or resource repair. The five CC0 sound clips and recipe are unchanged. Retained Round 2 audio evidence is **${f(audio.strongest100msDbFS)} dBFS** strongest 100 ms and **${f(audio.peakDbFS)} dBFS** peak; no new listening verdict. No game assets were extracted. [Attribution](ATTRIBUTION.md).

Captures total **${f(sizes.reduce((a,b)=>a+b,0)/1048576,2)} MiB**, largest **${f(Math.max(...sizes)/1048576,2)} MiB**. Large endpoints and experiments remain ignored. All changes are inside \`investigation/glaciate/\`. Only branch \`investigation/glaciate\` and existing PR #69 are updated, without merges, approvals, auto-merge, tags or releases.

[Core evidence](checks/core.json) · [Browser evidence](checks/browser.json) · [Export findings](checks/export.json) · [Schema](checks/schema.json) · [Run the demo](README.md) · [Integration notes](INTEGRATION.md) · [Round 3 in history](https://github.com/timbermods/dam-good-maps/blob/405e7e4307b045698eda1765a431609259297bd8/investigation/glaciate/REPORT.md).
`);
console.log('Round 4 report generated from checked endpoints, captures and visual observations');
