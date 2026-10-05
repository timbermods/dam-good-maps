import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{spawnSync}from'node:child_process';
import { forceFixtures, sha256 } from '../local/checkout/tools/rust/forces-jobs';
import {executeInRust,planInRust} from '../local/checkout/src/core/forces/rust/bridge';
import {decode} from '../local/checkout/src/core/forces/rust/protocol';
import {fixture} from '../local/checkout/tests/contract/forceFixtures';
import {DEPOSIT_DEFAULTS} from '../local/checkout/src/core/forces/deposit';
const root='investigation/deposit-pillars';const old=JSON.parse(readFileSync('tools/rust/forces-pins.json','utf8'));const pins:Record<string,string>={};
let unchanged=0,repinned=0;
for(const f of forceFixtures()){
 const output=executeInRust(f.job);const packed=decode(output) as any;if(packed.error)throw Error(`${f.name}: ${packed.error}`);
 const digest=sha256(output);pins[f.name]=digest;
 if(!f.name.startsWith('deposit ')){if(digest!==old[f.name])throw Error(`Changed other force: ${f.name}`);unchanged++;}
 else{if(digest!==old[f.name])repinned++;}
 const input=`${root}/local/fixture-input.bin`,out=`${root}/local/fixture-output.bin`;writeFileSync(input,f.job);
 const run=spawnSync(`${root}/local/checkout/rust/target/release/forces-batch.exe`,[input,out],{windowsHide:true,encoding:'utf8'});
 if(run.status!==0)throw Error(run.stderr);if(sha256(readFileSync(out))!==digest)throw Error(`Native/Wasm mismatch ${f.name}`);
}
mkdirSync(`${root}/overlay/tools/rust`,{recursive:true});writeFileSync(`${root}/overlay/tools/rust/forces-pins.json`,JSON.stringify(pins,null,2)+'\n');
const reason='Draw a longer line for a fan (at least 8 tiles)';let refusals=0;
for(const ground of ['plain','river','slide','lake'] as const)for(const seed of [0,1,2,7,41,0xffffffff])for(const power of [0,35,70,100]){
 const map=fixture(ground,64),before=sha256(map.heights);
 try{planInRust({verb:'deposit',map,settings:{...DEPOSIT_DEFAULTS,power,seed},intent:{path:[{x:30,y:30},{x:35,y:30}]},keep:null});throw Error('Short line kept');}
 catch(e){if((e as Error).message!==reason)throw e;refusals++;}
 if(sha256(map.heights)!==before)throw Error('Refusal mutated input');
}
const summary={unchangedOtherForcePins:unchanged,repinnedDeposit:repinned,nativeWasmMatches:Object.keys(pins).length,shortLineRefusals:refusals,shortLineReason:reason};
writeFileSync(`${root}/verification.json`,JSON.stringify(summary,null,2)+'\n');console.log(summary);
process.exit(0);
