import {fixture} from './fixtures';
import {DEFAULTS,nextSeed,type Settings} from '../model';
export interface Case {id:string;map:string;x:number;y:number;group:'hero'|'random'|'modest'|'variant'|'flat'|'spring'|'start'|'performance';settings?:Partial<Settings>;end?:[number,number];relief?:number}
export const heroes:Case[]=[
 {id:'hero-canyon',map:'canyon-128',x:22,y:22,group:'hero'},
 {id:'hero-highlands',map:'highlands-256',x:150,y:20,group:'hero'},
 {id:'hero-tall',map:'tall-128',x:36,y:92,group:'hero'},
];
// A fixed PRNG samples high ground before calling the planner. No rejection,
// reroll or success filtering: failures/refusals remain in the published sample.
export const randomSeed=3032026;let randomState=randomSeed;
export const randomCases:Case[]=['highlands-128','highlands-256','canyon-128','tall-128','highlands-128','highlands-256'].map((map,k)=>{
 const m=fixture(map),sorted=Array.from(m.heights).sort((a,b)=>a-b),threshold=sorted[Math.floor(sorted.length*.75)],candidates:number[]=[];
 for(let y=12;y<m.H-12;y++)for(let x=12;x<m.W-12;x++)if(m.heights[y*m.W+x]>=threshold)candidates.push(y*m.W+x);
 randomState=nextSeed(randomState);const i=candidates[Math.floor(randomState/2**32*candidates.length)];
 return {id:'random-'+(k+1),map,x:i%m.W,y:Math.floor(i/m.W),group:'random'};
});
const hero=heroes[0],a=nextSeed(DEFAULTS.seed),b=nextSeed(a),c=nextSeed(b);
export const modestCases:Case[]=['highlands-128','canyon-128','tall-128'].map((map,k)=>{const m=fixture(map),options:{i:number;relief:number}[]=[];for(let y=12;y<m.H-12;y++)for(let x=12;x<m.W-12;x++){const a:number[]=[];for(let yy=y-8;yy<=y+8;yy++)for(let xx=x-8;xx<=x+8;xx++)a.push(m.heights[yy*m.W+xx]);const relief=Math.max(...a)-Math.min(...a);if(relief>=2&&relief<=4&&m.heights[y*m.W+x]>=3)options.push({i:y*m.W+x,relief});}randomState=nextSeed(randomState);const q=options[Math.floor(randomState/2**32*options.length)];return {id:'modest-'+(k+1),map,x:q.i%m.W,y:Math.floor(q.i/m.W),group:'modest',relief:q.relief};});
export const cases:Case[]=[...heroes,...randomCases,...modestCases,
 {...hero,id:'power-low',group:'variant',settings:{power:50}}, {...hero,id:'power-high',group:'variant',settings:{power:95}},
 ...[a,b,c].map((seed,k)=>({...hero,id:'another-'+(k+1),group:'variant' as const,settings:{seed}})),
 {...hero,id:'aim',group:'variant',settings:{mode:'aim'},end:[98,96]},
 {id:'kyler-aim',map:'canyon-128',x:24,y:80,group:'variant',settings:{mode:'aim'},end:[96,36]},
 {...hero,id:'through-start',group:'start'},
 {id:'performance-256',map:'highlands-256',x:150,y:20,group:'performance'},
 {id:'flat',map:'river-128',x:32,y:32,group:'flat'},
 {id:'spring',map:'highlands-256',x:61,y:222,group:'spring'},
 {id:'spring-dry',map:'highlands-256',x:61,y:222,group:'spring',settings:{meltwater:false}},
];
