import type {Verb} from '../verbs';
export type Option={key:string;label:string;choices?:[string,string][];min?:number;max?:number;step?:number;toggle?:boolean;auto?:boolean};
const power:Option={key:'power',label:'Power',min:0,max:100};
export const OPTIONS:Record<Verb,Option[]>={
 carve:[
  {key:'mode',label:'Mode',choices:[['unleash','Unleash'],['aim','Aim']]},power,
  {key:'width',label:'Width',min:2,max:24,step:.5,auto:true},{key:'wander',label:'Wander',min:0,max:100},
  {key:'walls',label:'Walls',choices:[['steep','Steep'],['wide','Wide']]},
  {key:'dry',label:'Water',choices:[['false','Keep river'],['true','Dry canyon']]},
  {key:'defyGravity',label:'Defy gravity',toggle:true},{key:'layers',label:'Rock layers',toggle:true}],
 craterize:[
  {key:'mode',label:'Mode',choices:[['strike','Strike'],['aim','Aim']]},power,
  {key:'size',label:'Size',min:4,max:180,auto:true},
  {key:'walls',label:'Walls',choices:[['steep','Steep'],['terraced','Terraced']]},
  {key:'centre',label:'Centre',choices:[['auto','Auto'],['bowl','Bowl'],['peak','Peak'],['ring','Ring'],['flat','Flat']]},
  {key:'debris',label:'Debris',choices:[['light','Light'],['heavy','Heavy']]},{key:'rays',label:'Rays',toggle:true}],
 erupt:[
  {key:'mode',label:'Mode',choices:[['vent','Vent'],['fissure','Fissure']]},power,
  {key:'shape',label:'Shape',choices:[['steep','Steep'],['broad','Broad']]},
  {key:'summit',label:'Summit',choices:[['auto','Auto'],['peak','Peak'],['crater','Crater'],['caldera','Caldera']]},
  {key:'flows',label:'Flows',choices:[['light','Light'],['heavy','Heavy']]},{key:'ridges',label:'Ridges',toggle:true}],
 quake:[
  {key:'mode',label:'Mode',choices:[['lift','Lift'],['slide','Slide']]},power,
  {key:'scarp',label:'Scarp',choices:[['sheer','Sheer'],['stepped','Stepped']]},{key:'side',label:'Side',choices:[['1','Left'],['-1','Right']]}]
};
