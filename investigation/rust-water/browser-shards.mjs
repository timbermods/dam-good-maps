import {spawn} from 'node:child_process';
import {HERE,arg} from './common.mjs';
const engine=arg('engine','firefox'),count=Number(arg('jobs','4'));
if(!['chromium','firefox','webkit'].includes(engine)||!Number.isInteger(count)||count<1||count>16)throw Error('Invalid engine/jobs');
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['browser.mjs',...args],{cwd:HERE,env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Browser harness exited ${code}`)));});
await Promise.all(Array.from({length:count},(_,i)=>run(['--engines',engine,'--skip-smoke','--shard',`${i}/${count}`])));
// The final pass collects all cached identities, reruns lifecycle/fallback checks and measures.
await run(['--engines',engine,'--bench','--reps',arg('reps','3')]);
