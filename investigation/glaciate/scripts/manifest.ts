import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const original=JSON.parse(readFileSync('../juice-2/bank.json','utf8'));
const provenance:any={independent:{author:'Independent.nu',source:'https://opengameart.org/content/35-wooden-crackshitsdestructions'},kenney:{author:'Kenney',source:'https://kenney.nl/assets/impact-sounds'},kaszuba:{author:'Tom_Kaszuba',source:'https://freesound.org/people/Tom_Kaszuba/sounds/660255/'}};
const cues:any={'crack-a':'Advance onset: gain 0.45, playbackRate 0.55, low-pass 1100 Hz; 2 seconds.','crack-b':'1.75 seconds: gain 0.30, rate 0.70, low-pass 7000 Hz; 1 second.','stone-bed':'Advance grind: gain 0.8, rate 0.42, low-pass 1100 Hz, loop for 3.1 seconds.','wood-body':'Low groan stand-in: gain 0.8, rate 0.28, low-pass 1100 Hz, loop for 3 seconds.','waterfall':'Retreat: gain 0.8, rate 1.05, low-pass 7000 Hz; 2.2 seconds.'};
const bank=original.filter((a:any)=>a.id in cues).map((a:any)=>({...a,...provenance[a.provenance],licence:'CC0-1.0',licenceUrl:'https://creativecommons.org/publicdomain/zero/1.0/',runtimeEdits:cues[a.id],copiedWithoutByteChanges:true}));
for(const a of bank){const bytes=readFileSync(a.file);if(createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('Sound changed: '+a.id);}
writeFileSync('bank.json',JSON.stringify(bank,null,2)+'\n');
console.log(bank.length+' CC0 recordings, '+bank.reduce((a:number,b:any)=>a+b.bytes,0)+' bytes');
