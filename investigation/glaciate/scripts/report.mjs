import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync('checks/'+n+'.json','utf8')),core=read('core'),browser=read('browser'),exports=read('export'),audio=read('audio'),visual=read('visual');
const f=(n,d=1)=>Number(n).toFixed(d),pct=n=>f(n*100)+'%',signed=n=>(n>0?'+':'')+n,get=id=>core.cases.find(c=>c.id===id),time=id=>browser.timings.find(c=>c.id===id),hero=get('hero-canyon'),m=hero.metrics,t256=time('hero-highlands'),spring=get('spring'),flat=get('flat');
const fail=c=>Object.entries(c.guardrails).filter(([,v])=>!v).map(([k])=>({newFloor:'new land',walls:'walls',waterfalls:'falls',water:'wet share',riverWidth:'river width',oneRiver:'one river'}[k])).join(', ')||'none';
const rows=core.cases.map(c=>{const q=c.metrics;return `| ${c.id} | ${c.x},${c.y} | ${q.dryFloor} | ${q.newFloor} (${pct(q.newFloorShare)}) | ${signed(q.buildableGain)} | ${q.wallMedian}/${q.wallMax} | ${q.hangingValleys}/${q.waterfalls} | ${pct(q.wetShare)} | ${q.widthMin}–${q.widthMax}/${q.longestWall} | ${f(time(c.id).terrainFinalMs)} |`;}).join('\n');
const riverRows=core.cases.map(c=>{const q=c.metrics;return `| ${c.id} | ${q.riverWidthMin}–${q.riverWidthMax} | ${q.channels} | ${f(q.maxPoolJoin)} | ${f(q.cleanAbsorbed,2)} / ${f(q.badSwept,2)} | ${fail(c)} |`;}).join('\n');
const material=core.cases.map(c=>{const q=c.metrics;return `| ${c.id} | ${q.cut}/${q.deposited}/${q.carriedAway} | ${q.outwashDry} | ${q.treesRemoved}/${q.objectsRemoved} | ${q.crossRange} | ${c.settled?'settled':'tick cap'} · ${c.ticks} |`;}).join('\n');
const heroes=core.cases.filter(c=>c.group==='hero').map(c=>`### ${c.map} · click ${c.x},${c.y}\n\n![${c.id}: valley view first](captures/${c.id}-valley.png)\n\n![${c.id}: original mountain and result](captures/${c.id}.png)\n\n[Full before](captures/${c.id}-before.png) · [Full after](captures/${c.id}-after.png). **${c.metrics.dryFloor}** dry floor tiles, **${pct(c.metrics.newFloorShare)}** newly buildable, net **${signed(c.metrics.buildableGain)}**; **${c.metrics.waterfalls}** actual hanging falls. River width **${c.metrics.riverWidthMin}–${c.metrics.riverWidthMax}**, peak separate wet reaches **${c.metrics.channels}**. Missed guardrails: **${fail(c)}**.`).join('\n\n');
const samples=group=>core.cases.filter(c=>c.group===group).map(c=>`![${c.id}, ${c.map}, click ${c.x},${c.y}](captures/${c.id}.png)`).join('\n\n');
const start=get('through-start').start,startFindings=exports.cases.filter(c=>!c.passed).map(c=>`- **${c.id}:** ${c.failures.map(e=>e.id+': '+e.message).join('; ')}`).join('\n');
const sizes=readdirSync('captures').map(n=>statSync('captures/'+n).size),timings=browser.timings.map(t=>t.terrainFinalMs);
writeFileSync('REPORT.md',`# Round 3: a mountain carver

![Default Canyon mountains before and after](captures/default-before-after.png)

![Low valley view beside unchanged Lauterbrunnen](captures/valley-reference.png)

**This includes Kyler's addition after trying the early Round 3 demo.** Every tested click now carves, including all six random high-ground clicks, three modest-ground clicks and River Valley's flat floor. Click selects Flow; drag selects Aim. The Mode control and relief refusals are gone. Trees and objects are swept away, surviving objects stay put, and swept clean sources become flow at the cirque. Badwater strength is discarded. The former deep river slot and long collector ditches are removed.

**It remains an incomplete visual result.** The default Canyon 10, 128², click **22,22**, Power **60**, Auto Size **30**, Meltwater on, seed **891**, gives **${m.dryFloor} dry level floor tiles**, but only **${m.newFloor} (${pct(m.newFloorShare)})** were not already buildable at those coordinates. Net affected building land is **${signed(m.buildableGain)}**. There are **${m.waterfalls}** actual hanging falls, median/max walls **${m.wallMedian}/${m.wallMax}**, and **${pct(m.wetShare)}** wet trough. The actual river widens to **${m.riverWidthMax} tiles** in places and the conservative cross-section count reaches **${m.channels} wet passages**. These failures are not hidden by the passing lifecycle tests.

Lauterbrunnen is the repository's unchanged gallery heightfield, using the same materials and unscaled block heights. It is not a photograph or a modified success fixture. The before/after use the same overview camera; the low views look uphill from the actual new floor. The maps have different physical scales. The reference still has the more convincing composition.

## What changed

Glaciate cuts a broad floor far below the old mountain rim, with irregular single-level bars, rock-dependent cliffs/benches, a cirque/tarn, hanging mouths, scree and low terminal rubble. Power controls depth and reach; Auto Size follows Power. A modest mountain targets at least three levels of lowering where ground allows it. An existing lower river can force the whole terrace sequence deeper so the glacier does not dam it behind a raised floor. That means some walls exceed the half-relief target.

Flow follows original drainage, with eased bends. A flat neighbourhood with no useful descent chooses lower ground or an edge; Try another can select another direction there. Mountain variations preserve the underlying route. Aim follows the drag through intervening ridges. Pointer-down immediately gathers ice; movement beyond six pixels turns the pending gesture into the thin straight Aim arrow. Release starts the cut. There is no hover route, outline or wireframe.

Trees and objects in changed ground/river paths are removed, including sources. No trees are relocated to the edges. Surviving entities keep their full original data and coordinates. The start is the exception: it moves to the nearest unoccupied, level 3×3 ground outside the trough. Terrain and route are identical when the start is removed from the input. No paths, slopes, resources or start-quality repairs are added. Unsupported old slopes are removed.

The river's terrain is now a **shallow, one-voxel banked floor**, replacing the previous three-level slot. It winds toward selected waterfall pools, with no long excavated cross-floor collectors and no parallel fan braids. This still leaves its bed one level below the broad dry banks; it is **not literally flush with every dry floor tile**, and some low views still read as a channel. The requested natural river appearance is therefore not declared solved. Pools can be too wide, and surviving outside inflows can create extra wet reaches. There is no render-only water masking to conceal them.

The small tarn, source entities and waterfalls use the repository water solver and renderer. The local viewer now uploads the editor's existing waterfall geometry/material, which the shared study viewer omitted. No decorative waterfall is counted. Cut material supplies low moraine/scree/outwash; the rest is carried away. Conservation is not forced.

## Valley views first

${heroes}

The Canyon view shows a stronger mountain cut and real falls, but broad pools and tiered cuts weaken the river picture. Highlands has the most legible long shallow river; some sections still look engineered. The tall study has the strongest wall enclosure but lacks sustained hanging waterfalls. The three heroes all miss the 70% new-land guardrail. These mountain generators contain broad level terraces: lowering an already buildable terrace does not create a newly buildable coordinate. The report keeps the original definition.

## Advance and retreat

![Normal-speed browser event from the valley view](captures/two-acts.gif)

![Actual advance and retreat frames](captures/two-acts.png)

This recording starts with a real default-settings click. The tongue travels downhill, then melts back uphill as the river and cliff water emerge. The camera follows the newly exposed ground vertically during advance so it does not stay inside the old mountain. The final view and water are actual stored terrain/simulation, not a staged illustration. Encoding can lower the recording frame rate; timings are separate runs without screenshots.

Across all **${core.cases.length}** cases, every displayed height equals the literal final terrain at **${f(Math.min(...timings))}–${f(Math.max(...timings))} ms** after input, before retreat ends. Canyon is exact at **${f(time('hero-canyon').terrainFinalMs)} ms**; 256² Highlands at **${f(t256.terrainFinalMs)} ms**. Water can continue settling afterwards; tick-cap cases remain labelled.

## Random high ground and modest ground

Sampling seed **${core.randomSeed}**. The six high-ground clicks are independent LCG draws over the original map's top height quartile, with a 12-tile inset, in the fixed map order Highlands128, Highlands256, Canyon128, tall128, Highlands128, Highlands256. No planner filtering or replacement is used. All now produce changed terrain.

${samples('random')}

The additional three modest-ground clicks use the continued random sequence, over original 17×17 neighbourhoods whose max-minus-min relief is **two to four levels**, on Highlands128, Canyon128 and tall128. They are sampled before planning, not selected by their result. Their exact coordinates and relief are in [checks/core.json](checks/core.json). Local modest relief can lead into a much taller range farther down the route.

${samples('modest')}

The random set still contains flooded, short and weak-wall results. In particular random-6 is mostly wet and lacks the required wall height. Never refusing has improved the interaction; it has not made every click a successful landscape. Each valley view should be judged for a thin channel or ditch network even when a numerical width happens to pass.

## Flat ground and absorbed springs

![River Valley flat-ground glacier](captures/flat.png)

The former refusal case, River Valley 18 at **32,32**, now makes **${flat.metrics.dryFloor}** dry floor tiles and **${signed(flat.metrics.buildableGain)}** net building land. Power 0, 60 and 100 all change terrain. A separate uniform-plateau test verifies that Try another changes direction where there is no downhill route. Only true physical inability can show pointer text; there is no relief message or flat lobe substitute.

**The flat case exposes a source-transfer failure:** absorbed strength is conserved, but the new head drains toward a nearer outlet and much of the original downstream river dries. **${visual.cases.find(c=>c.id==='flat').oldCleanWetTilesNowDryOnUnchangedGround} previously clean wet tiles on unchanged ground become dry.** Thus the general promise that every swept river keeps its original downstream flow is not achieved. Some of its net building-land gain comes from that drying; it must not be presented as a pure success. The spring case below demonstrates one successful downstream connection, not a universal guarantee.

![Glacier starts on the existing mountain spring](captures/spring.png)

The real Highlands 256² spring at **61,222, level 15** is swept away. Its **${f(spring.metrics.cleanAbsorbed,2)}** clean strength is added to the cirque's normal 0.65 feed, with any eligible hanging springs separate. The river still has **${spring.downstream.after} wet tiles beyond the trough/moraine** along its outgoing course. This is a changed head for the same downstream water, not a deleted river. Its final solve reaches the tick cap, so downstream flow is demonstrated in the saved endpoint rather than claimed permanently settled.

![Same spring gesture with Meltwater off](captures/spring-dry.png)

With Meltwater off the swept spring gets **no replacement source and no retained depth**. Untouched sources elsewhere in this real map still feed part of the affected river, so the result is **${pct(get('spring-dry').metrics.wetShare)} wet**, not wholly dry. The implementation preserves outside sources instead of secretly deleting them or suppressing their water. This is a remaining mismatch with a literal “dry valley” expectation on a map with surviving incoming rivers. Tests verify the absence of replacement sources and retained depth.

The ledger sums effective clean source strength under the repository's active-state and per-source cap rules. Swept badwater strength is never included. A head above the game's eight-per-source cap is represented by adjacent ordinary sources in one cirque head so no clean strength silently disappears. Surviving outside sources keep their original positions and strengths.

## Power, variation, Aim and the start

![Power 50, 60 and 95, same Canyon head](captures/power.png)

Low/default/high are **50/60/95**, with Auto Size **26/30/42**. The existing-river constraint can saturate the depth response at low/default Power; higher Power reaches farther and cuts more. Wider/deeper is not always a better valley.

![Three successive Try another results](captures/alternatives.png)

All three use the original map and gesture, changing the saved seed without stacking glaciers. The mountain drainage route is unchanged. Rims, bars, bends toward pools and deposits vary. Actual widths and channel counts are reported below, including failed alternatives.

![The only Aim preview is a straight arrow](captures/aim-drag.png)

![Aim through the ridge, after and low view](captures/aim.png)

Drag **22,22 → 98,96** selects Aim without a dropdown. Release hides the arrow; the actual pointer gesture produces the independently checked result.

![Glacier through the original start](captures/through-start.png)

The real original start moves from **(${start.before.join(',')}) to (${start.after.join(',')})**. Exactly one start remains on supported ground outside the trough. The editor may still report an unusable entrance; that is recorded below and does not veto the force.

## Measurements

Buildable means dry (**water depth ≤0.05**) and part of a level **2×2 pad**, excluding non-plant footprints; trees are assumed clearable. New floor counts only same-coordinate positions that failed that test before. Affected net includes all height, wet/dry and non-plant-footprint changes plus a one-tile pad collar; tests require equality with the whole-map net, including downstream losses.

Wall heights compare the old rim with the broad new dry-bank datum. Width samples include the wider cirque and boundary taper; these can exceed the body's requested ±30%. Straight wall means the longest exact cardinal run of the rasterized outline, including caps. Hanging falls are actual wet outside-to-inside cliff edges ≥3 levels high, with a wet landing; adjacent pixels within five tiles count as one. Main-river cascades and the outgoing river are excluded. The hanging-mouth count includes planned gullies and cannot be smaller than the observed falls.

| Case | Head | Dry floor | Newly buildable | Net affected | Wall med/max | Hanging/falls | Trough wet | Floor width / straight wall | Terrain final ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

Actual river width is measured across wet sections (depth >0.05), rather than copied from the requested corridor. **Wet reaches** is the maximum separate wet spans across a floor section; it is conservative and can count a plunge pool or a meander crossing as another reach. It also exposes accidental parallel water. Width ranges include pool enlargements and bar spreads: they are not trimmed to make the 2–5 target pass. A one-tile value flags a visible narrowing even if most of the river is wider. Pool joining distance is planned open-ground gap, with no long joining cut when it exceeds five.

Every published low view and overview was visually inspected for thin channels and ditch networks. The [case-by-case visual audit](checks/visual.json) records all 23, including identical start/performance duplicates. Random-4 has the clearest single small river; random-6 fails as a flooded floor; several Canyon variants retain multiple pool passages. A **0–0** width in the short random-1 case means no qualifying marked-river section was sampled, not that its pictured outlet is dry.

| Case | Actual river width | Separate wet reaches (goal 1) | Max pool gap | Clean absorbed / bad swept | Missed guardrails |
| --- | ---: | ---: | ---: | ---: | --- |
${riverRows}

Guardrails: ≥70% new floor, median wall ≥4, ≥2 falls where at least two hanging mouths exist, ≤15% wet trough, river 2–5 tiles and one wet reach. They are reported on every case; passing a conditional falls test with fewer than two mouths is not a claim that a fall exists. Meltwater-off river width/channel flags are not scored, but measured water is still shown.

| Case | Cut/deposit/carried away | New dry outwash | Trees/other objects swept | Median cross-floor range | Water |
| --- | ---: | ---: | ---: | ---: | --- |
${material}

Cross-floor range excludes marked river cells but includes bars/scree reached by a section. A value above one is a failure of a strictly level section. The cirque can be clipped by a nearby map edge. Outwash zero means no qualifying lower receiving ground. Large pools, one-block banks, overshoot at bars and overlong straight runs remain visible limitations, not reasons to alter the counters.

## Verification and remaining limits

The suite passes **${core.checks} model assertions**, **12 schema/malformed-operation checks**, and structural export checks on all **${core.cases.length}** endpoints with 960×540 thumbnails. It covers literal replay, water scheduling determinism, unchanged surviving objects, swept source strength, badwater exclusion, start-independent terrain, flat directions, one-step undo/redo, invalid import atomicity, physical bounds and actual exported water. Start-specific findings remain:

${startFindings||'No start-specific findings.'}

The tall input is the unchanged Round 1 VT85 heightfield, with one loader-only ordinary start at **71,64,8** on already level ground. No resources or terrain repairs were added. The dev editor still has no Verticality control. This is an explicitly labelled generator study, not a hand-sculpted hero.

Chrome **${browser.browser}**, **${browser.renderer}**, 1200×820. All accepted browser fingerprints match Node. Actual click/drag, no Mode control, flat click, undo including waterfall meshes, Esc during both acts and final settling, and rejection of late completion are checked. No browser exceptions. [Core evidence](checks/core.json), [browser evidence](checks/browser.json), [export findings](checks/export.json), [schema](checks/schema.json).

256² frame intervals: advance median **${f(t256.advance.median)} ms**, p95 **${f(t256.advance.p95)} ms**, worst **${f(t256.advance.worst)} ms**; retreat median **${f(t256.retreat.median)} ms**, p95 **${f(t256.retreat.p95)} ms**, worst **${f(t256.retreat.worst)} ms**. Planning **${f(t256.planningMs)} ms**, full endpoint including water **${f(t256.duration/1000)} s**. These are local browser timings, not in-game FPS. Typecheck and Vite build pass, with the existing bundle-size advisory. No Timberborn launch was performed.

The five CC0 clips and recipe are unchanged. The retained Round 2 offline measurement is **${f(audio.strongest100msDbFS)} dBFS** for the strongest 100 ms window, **${f(audio.peakDbFS)} dBFS** peak; no new listening verdict is claimed. No game assets were extracted. [Attribution](ATTRIBUTION.md), [sound manifest](bank.json).

**The central failures remain:** all heroes miss newly buildable share and lose net land; hanging falls are unreliable; river widths and wet-reach counts often miss the new targets; some cuts flood or look engineered; absorbed flow can abandon the old downstream course; off mode cannot make untouched incoming rivers disappear. The pictures take precedence over numeric passes. This iteration implements the interaction and sweep/source changes and makes the shallow-river experiment inspectable, but does not claim the complete requested landscape has been achieved.

All changes stay inside investigation/glaciate/. Captures total **${f(sizes.reduce((a,b)=>a+b,0)/1048576,2)} MiB**, largest **${f(Math.max(...sizes)/1048576,2)} MiB**; large results remain ignored. [README](README.md) runs the demo; [INTEGRATION](INTEGRATION.md) describes a potential port. [Round 2](https://github.com/timbermods/dam-good-maps/blob/5d4154047edcc216c6df099a676969c908a00a03/investigation/glaciate/REPORT.md) and [Round 1](https://github.com/timbermods/dam-good-maps/blob/f63e4aea0d24b63088e1fe4556b95ee8f0cbf8d1/investigation/glaciate/REPORT.md) remain in history. Only the existing investigation/glaciate branch and PR #69 are updated; no merge, approval, auto-merge, tag or release.
`);
console.log('Round 3 report, including Kyler’s addition, generated from checked evidence');
