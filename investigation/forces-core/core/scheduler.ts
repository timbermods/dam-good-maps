export class Cancelled extends Error {}
/** MessageChannel avoids accumulated Windows timer floors, with periodic task yields. */
export class Slicer {
 epoch=0;maxSliceMs=0;private since=performance.now();private count=0;
 cancel(){this.epoch++;}
 check(token:number){if(token!==this.epoch)throw new Cancelled();}
 async yield(token:number){
  this.maxSliceMs=Math.max(this.maxSliceMs,performance.now()-this.since);
  await new Promise<void>(resolve=>{
   if(++this.count%4===0||typeof MessageChannel==='undefined')setTimeout(resolve,0);
   else {const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);}
  });
  this.since=performance.now();this.check(token);
 }
}
