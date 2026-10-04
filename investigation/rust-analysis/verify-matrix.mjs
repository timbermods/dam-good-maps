// Durable per-case records permit parallel shards and safe resumption.
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,arg} from './common.mjs';
const count=Number(arg('shards','4')),start=Number(arg('start','0'));
await Promise.all(['chromium','firefox','webkit'].flatMap(engine=>Array.from({length:count-start},(_,offset)=>start+offset).map(async shard=>{
 const log=createWriteStream(resolve(LOCAL,'followup',engine+'-shard'+shard+'.log'));
 try{for(const script of ['browser.mjs','browser-m9b.mjs'])await new Promise((res,rej)=>{
  const child=spawn(process.execPath,[resolve(HERE,script),'--engines',engine,'--shard',shard+'/'+count],{cwd:HERE,env:process.env,windowsHide:true});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('error',rej);child.on('exit',code=>code===0?res():rej(Error(engine+'/'+shard+'/'+script+' exit '+code)));
 });console.log('Identity shard PASS',engine,shard+'/'+count);}finally{log.end();}
})));
