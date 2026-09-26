import { DEFAULTS, type Settings, type Intent } from './engine';
export interface Scenario {id:string;title:string;map:string;settings:Settings;intent:Intent;second?:{settings:Settings;intent:Intent};carve?:{origin:number;end:number}}
export const SCENARIOS:Scenario[]=[
 {id:'steep-crater',title:'Steep vent · summit crater',map:'fixture:plain:128',settings:{...DEFAULTS,summit:'crater',seed:890},intent:{origin:64*128+64}},
 {id:'broad-shield',title:'Broad shield',map:'fixture:plain:128',settings:{...DEFAULTS,shape:'broad',power:62,summit:'peak',ridges:false,seed:890},intent:{origin:64*128+64}},
 {id:'huge-caldera',title:'Huge caldera',map:'fixture:plain:128',settings:{...DEFAULTS,power:96,summit:'caldera',seed:77},intent:{origin:64*128+64}},
 {id:'fissure-valley',title:'Curved fissure · crater row',map:'fixture:river:128',settings:{...DEFAULTS,mode:'fissure',power:66,seed:53},intent:{origin:40*128+46,path:[{x:46,y:40},{x:64,y:52},{x:84,y:61},{x:101,y:53}]}},
 {id:'river-lake',title:'Flows dam a river',map:'fixture:river:128',settings:{...DEFAULTS,mode:'fissure',power:58,seed:75},intent:{origin:59*128+64,path:[{x:64,y:59},{x:83,y:63},{x:104,y:59}]}},
 {id:'volcanic-field',title:'Eruptions on older flanks',map:'fixture:plain:128',settings:{...DEFAULTS,power:57,seed:313},intent:{origin:63*128+59},second:{settings:{...DEFAULTS,power:49,summit:'crater',seed:314},intent:{origin:70*128+81}}},
 {id:'carve-lava',title:'Carve bends around lava',map:'fixture:plain:128',settings:{...DEFAULTS,power:35,shape:'steep',seed:5},intent:{origin:62*128+68},carve:{origin:72*128+28,end:72*128+112}},
];
