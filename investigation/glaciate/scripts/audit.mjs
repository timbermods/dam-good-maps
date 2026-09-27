import {readFileSync,writeFileSync} from 'node:fs';
const core=JSON.parse(readFileSync('checks/core.json','utf8'));
// Visual observations from inspecting every published low view and its overview.
// Counts remain in core.json; these notes do not turn visual judgments into scores.
const notes={
 'hero-canyon':'Tall wall falls are visible. Broad linked pools and terrace-wide cascades dominate; the one-tile pinch in the measurements is not the main visual problem. Several wet passages remain.',
 'hero-highlands':'A readable broad central river and a tall fall on the left. The bank still gives the river an engineered channel appearance; a joining pool reads separately.',
 'hero-tall':'Tall enclosure and a broad dry floor. One shallow channel at the left; no sustained hanging falls. The low bank can still read as a ditch.',
 'random-1':'Short scooped basin and a foreground outlet, with no long river in frame. Zero width means no qualifying marked-river section was sampled, not a water-free result.',
 'random-2':'Broad shallow foreground bend, with pool/cascade enlargement and an engineered bank. No thin ditch network visible in this low view.',
 'random-3':'A striking tall fall, but pools and small terrace islands split the wet floor into multiple passages.',
 'random-4':'The clearest single gently bending small river in the sample. It is shallow with low banks, though the one-level depression still looks like an excavated channel.',
 'random-5':'A short basin, surviving outside badwater inflow and a pool/cascade at the mouth. No clean single-river composition; terrain fragments remain.',
 'random-6':'Large flooded floor and multiple passages around thin terrace fragments. Fails the dry U-valley picture.',
 'modest-1':'Broad dry banks, a wide river and multiple visible falls. A large head pool weakens the continuous-river shape; no long collector ditch is visible.',
 'modest-2':'Very broad water between tall walls, with branching around terraces. A one-tile pinch is measured elsewhere; the low view is dominated by pool widening.',
 'modest-3':'A small shallow river/pool in a short bowl, with low walls. No parallel ditch network visible; it is not a grand mountain valley.',
 'power-low':'Strong falls but separate foreground channels and broad pools. Narrowing and the network appearance remain.',
 'power-high':'Tall enclosing walls and much more continuous dry floor. The central river is readable but pools, forks and distant narrow branches remain.',
 'another-1':'Visible tall waterfall, but multiple foreground pool passages and narrow connections remain.',
 'another-2':'A clearer river curve with broad dry banks, plus a parallel wet terrace and pool. Some stretches still look excavated.',
 'another-3':'Tall falls and a flooded foreground with parallel pool passages; fails the one-river picture.',
 'aim':'Tall side falls and a very wet floor split around narrow terrace fragments. Does not meet the single shallow river picture.',
 'flat':'A broad level cut with low banks. Water is mostly at the side in the low view. The overview reveals drying of much of the former downstream river: source strength is absorbed, but its original course is not preserved.',
 'spring':'One wide foreground river and the old downstream course visibly flowing in the overview. Banks are low but the view is not spectacular; the water solve reaches its cap.',
 'spring-dry':'The local replacement sources are absent, but an untouched outside river still wets the same foreground course. This is not literally a dry valley.'
};
notes['through-start']=notes['hero-canyon'];notes['performance-256']=notes['hero-highlands'];
const cases=core.cases.map(c=>{if(!notes[c.id])throw Error('Missing visual inspection for '+c.id);const before=JSON.parse(readFileSync('local/results/'+c.id+'-before.json','utf8')),after=JSON.parse(readFileSync('local/results/'+c.id+'.json','utf8'));let oldCleanWetNowDry=0;for(let i=0;i<before.heights.length;i++)if(before.heights[i]===after.heights[i]&&before.water.depth[i]>.05&&before.water.contamination[i]<.01&&after.water.depth[i]<=.05)oldCleanWetNowDry++;return {id:c.id,viewInspected:true,thinSectionMeasured:c.metrics.riverWidthMin===1,extraWetReaches:c.metrics.channels>1,oldCleanWetTilesNowDryOnUnchangedGround:oldCleanWetNowDry,observation:notes[c.id]};});
writeFileSync('checks/visual.json',JSON.stringify({method:'Visual inspection of all published low valley views and overview panels; unchanged-ground old-water loss counted separately from the literal saved before/after fields. Duplicate start/performance cases share the identical hero geometry.',cases},null,2)+'\n');
console.log('Visual audit:',cases.length,'cases; flat original wet tiles dried on unchanged ground:',cases.find(c=>c.id==='flat').oldCleanWetTilesNowDryOnUnchangedGround);
