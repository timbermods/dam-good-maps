import {readFileSync,writeFileSync} from 'node:fs';
const core=JSON.parse(readFileSync('checks/core.json','utf8'));
// Visual observations from inspecting every published low view and its overview.
// Counts remain in core.json; these notes do not turn visual judgments into scores.
const notes={
 'hero-canyon':'Tall left-wall falls and a dry broad floor. The foreground river is contained and has short bar cascades. Deep-looking banks and narrow lateral joins still read as excavated channels; the overview exposes branching side feeds.',
 'hero-highlands':'Several falls now frame a continuous central river. Most of the floor is dry. Straight local reaches and dark, sharp banks retain a canal appearance; joining feeds account for additional measured wet spans.',
 'hero-tall':'Three actual hanging falls, including the right-wall falls visible in the low view. The floor is broadly dry and enclosed. The river at left is contained; narrow transverse joins remain visible in the overview.',
 'random-1':'A short bowl with broad dry floor and a narrow edge outlet. Surviving outside badwater is visible in the foreground reach. The one-tile sampled width and separate inlet prevent a clean single-river success.',
 'random-2':'One contained foreground river crosses a short bar cascade. Wide dry floor; no long parallel ditch is visible in the low view. The dark banks still look sharply excavated.',
 'random-3':'Many tall falls and a mostly dry-looking low view. The tall foreground banks hide some water; the saved field still measures 16.4% wet with a shallow floor film. The overview and side cuts expose a branching network, so the attractive falls do not pass the one-river goal.',
 'random-4':'A small gently bending river with dry green banks. No parallel ditch network visible. One-block banks still make a shallow channel, but this is one of the clearer single-river results.',
 'random-5':'The short bowl has a dry floor and narrow paths between blocky banks at the right. The overview shows its compact edge location; the low view does not establish one clear continuous river. Two wet passages are measured.',
 'random-6':'The new floor river is the contained reach on the right. Broad pre-existing water remains beside it on the left, with terrace fragments between them. The trough metric now passes, but the whole low view still contains much more water than a simple dry U-valley composition.',
 'modest-1':'Broad dry green floor and several falls. A main river curves along the left bank; a small joining reach remains. No long parallel ditch is prominent from this low camera.',
 'modest-2':'Many tall side falls over a dry floor. Several narrow transverse joins and dark banks are visible, with branching especially clear in the overview. It still reads partly as a ditch network.',
 'modest-3':'Small contained river or pool in a short low-walled bowl. No parallel ditch network visible. This is a modest cut rather than a grand mountain valley.',
 'power-low':'Tall falls and substantially dry banks. Foreground joining cuts remain narrow and angular. The one-tile measured narrowing and multiple wet spans are not resolved.',
 'power-high':'Tall enclosing walls, several falls and broad dry floor. The main river is readable, but thin side joins and dark bank cuts remain. Lower wet share alone does not establish a natural floor-level river.',
 'another-1':'Several visible falls with a contained foreground river. Narrow joining reaches and long bank edges still read as engineered cuts.',
 'another-2':'Strong left-wall falls, dry floor, and a river partly hidden by tall sharp banks. Thin transverse joins remain visible.',
 'another-3':'Tall falls and dry foreground. The main river and side feeds remain separate visible cuts between raised-looking banks; the previous broad pool is gone from this view, but the network appearance remains.',
 'aim':'Many tall side falls frame a contained foreground river and broad dry terraces. Dark banks and some lateral cuts remain, although the floor no longer presents broad water sheets in this view.',
 'kyler-aim':'Falls on both walls and a mostly dry floor. The foreground river is partly hidden by a long bank; the overview shows several side joins and narrow branches. Wet share passes, but the one-river and natural-join picture is incomplete.',
 'flat':'A broad level cut with low outer walls and contained water along the left. The overview still exposes drying of the former downstream river. Source strength is preserved, but its previous course is not.',
 'spring':'One broad foreground reach within distinct banks. The overview shows the source moved into the new cirque while the downstream course continues beyond the moraine. A side feed produces a second measured wet span.',
 'spring-dry':'The new trough is visibly dry and brown. Outside rivers still run elsewhere in the overview. The dry carved channel is visible, without replacement sources.'
};
notes['through-start']=notes['hero-canyon'];notes['performance-256']=notes['hero-highlands'];
const cases=core.cases.map(c=>{if(!notes[c.id])throw Error('Missing visual inspection for '+c.id);const before=JSON.parse(readFileSync('local/results/'+c.id+'-before.json','utf8')),after=JSON.parse(readFileSync('local/results/'+c.id+'.json','utf8'));let oldCleanWetNowDry=0;for(let i=0;i<before.heights.length;i++)if(before.heights[i]===after.heights[i]&&before.water.depth[i]>.05&&before.water.contamination[i]<.01&&after.water.depth[i]<=.05)oldCleanWetNowDry++;return {id:c.id,viewInspected:true,thinSectionMeasured:c.metrics.riverWidthMin===1,extraWetReaches:c.metrics.channels>1,oldCleanWetTilesNowDryOnUnchangedGround:oldCleanWetNowDry,observation:notes[c.id]};});
writeFileSync('checks/visual.json',JSON.stringify({round:4,method:'Visual inspection of all published low valley views and overview panels; unchanged-ground old-water loss counted separately from the literal saved before/after fields. Duplicate start/performance cases share the identical hero geometry.',cases},null,2)+'\n');
console.log('Visual audit:',cases.length,'cases; flat original wet tiles dried on unchanged ground:',cases.find(c=>c.id==='flat').oldCleanWetTilesNowDryOnUnchangedGround);
