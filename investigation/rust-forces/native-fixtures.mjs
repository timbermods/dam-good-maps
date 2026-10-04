// Framed cold fixture transport, outside all measured force operations.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {LOCAL} from './common.mjs';
export function nativeFixtures(exportMetadata=false){
 const child=spawn(resolve(LOCAL,'target/release/forces-batch.exe'),[exportMetadata?'--serve-fixtures-export':'--serve-fixtures'],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending=null,chunks=[],length=0,wanted=null,canonical=null,closed=false;
 child.stdout.on('data',chunk=>{chunks.push(chunk);length+=chunk.length;
  while(true){if(wanted===null){if(length<4)return;const data=Buffer.concat(chunks,length);wanted=data.readUInt32LE(0);chunks=[data.subarray(4)];length-=4;}if(length<wanted)return;
   const data=Buffer.concat(chunks,length),frame=data.subarray(0,wanted);chunks=[data.subarray(wanted)];length-=wanted;wanted=null;
   if(exportMetadata&&canonical===null){canonical=frame;continue;}
   const p=pending;pending=null;p.resolve(exportMetadata?{bytes:canonical,entities:frame}:frame);canonical=null;
  }
 });
 child.on('error',error=>pending?.reject(error));child.on('exit',code=>{closed=true;if(pending)pending.reject(Error('Native fixture server exited '+code));});
 return {execute(bytes){if(closed||pending)throw Error('Native fixture server unavailable/busy');return new Promise((resolve,reject)=>{pending={resolve,reject};const head=Buffer.alloc(4);head.writeUInt32LE(bytes.length);child.stdin.write(head);child.stdin.write(bytes);});},close(){child.stdin.end();}};
}
