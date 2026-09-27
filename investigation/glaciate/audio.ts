/** Recorded CC0 foley only; pitch/filter/envelopes are runtime edits listed in bank.json. */
export class Sound {
 ctx:AudioContext|null=null;buffers=new Map<string,AudioBuffer>();nodes=new Set<AudioBufferSourceNode>();enabled=true;gain:GainNode|null=null;loading:Promise<void>|null=null;timers:number[]=[];
 init(){if(this.ctx)return;this.ctx=new AudioContext();const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=8;this.gain=this.ctx.createGain();this.gain.gain.value=.72;this.gain.connect(compressor);compressor.connect(this.ctx.destination);}
 async warm(){this.init();await this.ctx!.resume();if(!this.loading)this.loading=Promise.all(['crack-a','crack-b','wood-body','stone-bed','waterfall'].map(async id=>{const data=await (await fetch('/audio/'+id+'.mp3')).arrayBuffer();this.buffers.set(id,await this.ctx!.decodeAudioData(data));})).then(()=>{});return this.loading;}
 play(id:string,volume:number,rate=1,seconds=2,loop=false,delay=0){if(!this.enabled||!this.ctx||!this.buffers.has(id))return;
  const a=this.ctx.createBufferSource(),g=this.ctx.createGain(),filter=this.ctx.createBiquadFilter();a.buffer=this.buffers.get(id)!;a.playbackRate.value=rate;a.loop=loop;
  filter.type='lowpass';filter.frequency.value=rate<.6?1100:7000;const now=this.ctx.currentTime+delay;
  g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(volume,now+.04);g.gain.setValueAtTime(volume,now+Math.max(.05,seconds-.15));g.gain.linearRampToValueAtTime(0,now+seconds);
  a.connect(filter).connect(g).connect(this.gain!);this.nodes.add(a);a.onended=()=>{this.nodes.delete(a);a.disconnect();g.disconnect();filter.disconnect();};a.start(now);a.stop(now+seconds);}
 begin(){this.stop();this.play('stone-bed',.8,.42,3.1,true);this.play('wood-body',.8,.28,3,true);this.play('crack-a',.45,.55,2);
  this.play('crack-b',.3,.7,1,false,1.75);this.play('waterfall',.8,1.05,2.2,false,3);}
 stop(){for(const t of this.timers)clearTimeout(t);this.timers=[];for(const a of this.nodes){try{a.stop();}catch{}}this.nodes.clear();}
}
