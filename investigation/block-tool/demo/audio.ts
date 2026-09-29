const addURL = new URL("../../erode/audio/rocks-adamgryu.mp3", import.meta.url).href;
const removeURL = new URL("../../erode/audio/scrape-vrymaa.mp3", import.meta.url).href;
export class Sound {
  private ctx?: AudioContext;
  private buffers: AudioBuffer[]=[];
  async unlock() {
    if(this.ctx) { void this.ctx.resume(); return; }
    this.ctx=new AudioContext();
    this.buffers=await Promise.all([addURL,removeURL].map(async url=>this.ctx!.decodeAudioData(await (await fetch(url)).arrayBuffer())));
  }
  play(remove: boolean) {
    const ctx=this.ctx,b=this.buffers[remove?1:0]; if(!ctx||!b)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=b;
    source.connect(gain).connect(ctx.destination);const now=ctx.currentTime;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.075,now+.008);gain.gain.exponentialRampToValueAtTime(.001,now+.14);
    source.start(now,remove?.15:.3,.15);
  }
}
