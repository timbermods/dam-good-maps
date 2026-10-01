import type { EditOp } from '../../src/core/doc/ops';
import { markBrushTiles, brushBounds } from '../../src/core/features/raster/brush';
import { entityTiles } from '../../src/core/forces/force';
import { Mask, difference, put, clone, type State, type Patch, type Player } from './state';
export type Action = { seq:number; author:Player; label:string; patch:Patch; writes:Mask; touch:Mask; keys:Set<string>; active:boolean; replaced?:number };
export function touches(op:EditOp,before:State,after:State): {write:Mask; touch:Mask; keys:Set<string>} {
  const d=difference(before,after),m=new Mask(before.W*before.H),intent=new Mask(m.N),keys=d.keys;
  const rect=(x0:number,y0:number,x1:number,y1:number)=>{
    for(let y=Math.max(0,y0);y<=Math.min(before.H-1,y1);y++)for(let x=Math.max(0,x0);x<=Math.min(before.W-1,x1);x++)m.add(y*before.W+x);
  };
  const runs=(r:readonly (readonly number[])[])=>{for(const [y,x0,x1]of r)rect(x0,y,x1,y);};
  const entity=(id:string)=>{keys.add('entity:'+id);for(const s of [before,after]){
    const e=s.entities.find(e=>e.id===id);if(e)for(const i of entityTiles(s.W,s.H,e))m.add(i);
  }};
  switch(op.op) {
    case 'brush': {
      const mask=new Uint8Array(m.N);markBrushTiles(op.params,before.W,before.H,mask);
      for(let i=0;i<mask.length;i++)if(mask[i])m.add(i);
      for(const r of op.params.rigid??[])rect(...r);
      for(const [x,y]of op.params.slopes??[])rect(x,y,x,y);
      intent.union(m);
      // Conservative read rectangle: includes ramped rims, neighbours and rigid levelling.
      const b=brushBounds(op.params,before.W,before.H);if(b)rect(b.x0-1,b.y0-1,b.x1+1,b.y1+1);
      break;
    }
    case 'sculpt': runs(op.params.cells); if(op.params.mode==='smooth'||op.params.mode==='naturalize') {
      for(const i of m.tiles())rect(i%before.W-1,Math.floor(i/before.W)-1,i%before.W+1,Math.floor(i/before.W)+1);
    } intent.union(m); break;
    case 'placeEntity': entity(op.params.id);intent.union(m);break;
    case 'moveEntity': case 'setEntityProps': entity(op.params.id);intent.union(m);break;
    case 'deleteEntities': for(const id of op.params.entities)entity(id);intent.union(m);break;
    case 'pinSlope': case 'removeSlope': intent.add(op.params.y*before.W+op.params.x);rect(op.params.x-1,op.params.y-1,op.params.x+1,op.params.y+1);break;
    // Drainage, route choice, geology and object relocation read beyond the result's tiles.
    // An audited local read instrumentation can narrow this later; a guessed radius cannot.
    case 'carve': case 'forceResult': m.union(new Mask(m.N,true));
      for(const id of op.params.removed)entity(id);
      if(op.params.replaces!==undefined)keys.add('action:'+op.params.replaces);break;
    case 'addFeature': case 'updateFeature': case 'deleteFeature': case 'reorderFeature':
      m.union(new Mask(m.N,true));intent.union(m);keys.add('feature-order');break;
  }
  return {write:intent.union(d.writes),touch:m.union(d.writes),keys};
}
export class Claims {
  owner: Uint8Array;
  revision=0;
  offers=new Map<string,{from:Player;to:Player;tiles:number[];revision:number}>();
  constructor(readonly W:number,readonly H:number){this.owner=new Uint8Array(W*H);}
  code(p:Player){return p==='host'?1:2;}
  // Shape is rasterized by Select before this boundary. Normalize arbitrary overlapping runs.
  tiles(runs:readonly (readonly number[])[]) {
    if(!Array.isArray(runs)||runs.length>this.owner.length)throw Error('invalid claim runs');
    const out=new Set<number>();
    for(const r of runs){if(r.length!==3||!r.every(Number.isInteger))throw Error('invalid claim run');
      const [y,x0,x1]=r;if(y<0||y>=this.H||x0<0||x1>=this.W||x0>x1)throw Error('claim outside map');
      for(let x=x0;x<=x1;x++)out.add(y*this.W+x);
    }
    if(!out.size)throw Error('empty claim');return [...out].sort((a,b)=>a-b);
  }
  claim(p:Player,r:readonly (readonly number[])[]) {const t=this.tiles(r);if(t.some(i=>this.owner[i]))throw Error('ground is already claimed');
    for(const i of t)this.owner[i]=this.code(p);this.changed();}
  release(p:Player,r:readonly (readonly number[])[]) {const t=this.tiles(r);this.owned(p,t);for(const i of t)this.owner[i]=0;this.changed();}
  offer(id:string,p:Player,to:Player,r:readonly (readonly number[])[]) {
    if(p===to||this.offers.has(id))throw Error('invalid offer');const tiles=this.tiles(r);this.owned(p,tiles);
    this.offers.set(id,{from:p,to,tiles,revision:this.revision});
  }
  answer(id:string,p:Player,accept:boolean){const o=this.offers.get(id);if(!o||o.to!==p)throw Error('offer is unavailable');
    this.owned(o.from,o.tiles);this.offers.delete(id);if(accept){for(const i of o.tiles)this.owner[i]=this.code(p);this.changed();}}
  owned(p:Player,t:number[]){if(t.some(i=>this.owner[i]!==this.code(p)))throw Error('not your claim');}
  changed(){this.revision++;this.offers.clear();}
  conflict(p:Player,write:Mask){for(let i=0;i<this.owner.length;i++)if(this.owner[i]&&this.owner[i]!==this.code(p)&&write.has(i))return i;return null;}
}
export class Journal {
  entries:Action[]=[];
  seq=0;
  // Evicted actions cannot be undone. Their later dependencies remain as permanent fences.
  fences:{seq:Int32Array;labels:Map<number,string>;keys:Map<string,{seq:number;label:string}>};
  constructor(readonly state:State,readonly claims=new Claims(state.W,state.H)){
    this.fences={seq:new Int32Array(state.W*state.H),labels:new Map(),keys:new Map()};
  }
  accept(author:Player,label:string,after:State,op:EditOp,baseSeq=this.seq){
    if(baseSeq!==this.seq)throw Error('map changed; draw again');
    const replaced=(op.op==='forceResult'||op.op==='carve')?op.params.replaces:undefined;
    const previous=replaced===undefined?undefined:this.entries.find(e=>e.seq===replaced&&e.active);
    if(replaced!==undefined&&(!previous||previous.author!==author||this.entries.filter(e=>e.active).at(-1)!==previous))throw Error('Try another is no longer the latest action');
    const d=difference(this.state,after),f=touches(op,this.state,after);
    if(this.claims.conflict(author,f.write)!==null)throw Error('reaches into the other player\'s area');
    const a:Action={seq:++this.seq,author,label,patch:d.patch,writes:d.writes,touch:f.touch,keys:f.keys,active:true,...(replaced!==undefined?{replaced}: {})};
    a.keys.add('action:'+a.seq);if(previous)previous.active=false;
    put(this.state,a.patch);this.entries.push(a);
    // Derived fields are adopted at their agreed settled revision, never part of inverse patches.
    this.state.water=after.water;this.state.contamination=after.contamination;
    this.state.moisture=after.moisture;this.state.soilContamination=after.soilContamination;
    const own=this.entries.filter(e=>e.author===author);
    if(own.length>50){const old=own[0];if(old.active){
      for(const i of old.touch.tiles())this.fences.seq[i]=Math.max(this.fences.seq[i],old.seq);
      this.fences.labels.set(old.seq,`${old.author}'s ${old.label}`);
      for(const key of old.keys)if((this.fences.keys.get(key)?.seq??-1)<old.seq)this.fences.keys.set(key,{seq:old.seq,label:`${old.author}'s ${old.label}`});
    }this.entries.splice(this.entries.indexOf(old),1);}
    // Fence labels are bounded by occupied fence slots (not session length).
    const used=new Set(this.fences.seq);for(const k of this.fences.labels.keys())if(!used.has(k))this.fences.labels.delete(k);
    const liveKeys=new Set(this.entries.flatMap(e=>[...e.keys]));for(const key of this.fences.keys.keys())if(!liveKeys.has(key))this.fences.keys.delete(key);
    return a;
  }
  blocker(a:Action):string|null {
    for(const e of this.entries)if(e.active&&e.seq>a.seq&&(a.writes.intersects(e.touch)||[...a.keys].some(k=>e.keys.has(k))))return `${e.author}'s ${e.label}`;
    for(const i of a.writes.tiles())if(this.fences.seq[i]>a.seq)return this.fences.labels.get(this.fences.seq[i])!;
    for(const k of a.keys){const e=this.fences.keys.get(k);if(e&&e.seq>a.seq)return e.label;}
    return null;
  }
  undo(author:Player,settle?:(s:State)=>State){const skipped:{seq:number;reason:string}[]=[];
    for(const a of [...this.entries].reverse())if(a.author===author&&a.active){
      const reason=this.blocker(a)??(this.claims.conflict(author,a.writes)!==null?'reaches into the other player\'s area':null);
      if(reason){skipped.push({seq:a.seq,reason});continue;}
      if(settle) {
        // Strict interpretation of "no tile": check the derived water/soil result as well.
        // This is only needed when the candidate changes the water model. No edit log replays.
        const candidate=clone(this.state);put(candidate,a.patch,true);const final=settle(candidate);
        // Include any resource/life effects returned by the settling adapter as well.
        const waterChanged=difference(this.state,final).writes;
        for(let i=0;i<waterChanged.N;i++)if(final.water[i]!==this.state.water[i]||final.contamination[i]!==this.state.contamination[i]||
          final.moisture[i]!==this.state.moisture[i]||final.soilContamination[i]!==this.state.soilContamination[i])waterChanged.add(i);
        const later=this.entries.find(e=>e.active&&e.seq>a.seq&&e.author!==author&&waterChanged.intersects(e.touch));
        let fence:string|null=null;for(const i of waterChanged.tiles())if(this.fences.seq[i]>a.seq){fence=this.fences.labels.get(this.fences.seq[i])??'later edit';break;}
        if(later||fence){skipped.push({seq:a.seq,reason:later?`${later.author}'s ${later.label} (water dependency)`:fence!});continue;}
        Object.assign(this.state,final);
      } else put(this.state,a.patch,true);
      a.active=false;if(a.replaced!==undefined){const previous=this.entries.find(e=>e.seq===a.replaced);if(previous)previous.active=true;}
      this.seq++;return {action:a.seq,skipped};
    }return {action:null,skipped};
  }
}
export function waterNotices(before:State,after:State,claims:Claims,author:Player,seq:number) {
  const tiles:number[]=[];let flooded=0,drained=0,contaminated=0;
  for(let i=0;i<claims.owner.length;i++)if(claims.owner[i]&&claims.owner[i]!==claims.code(author)) {
    const delta=(after.heights[i]+after.water[i])-(before.heights[i]+before.water[i]);
    if(Math.abs(delta)>1e-6||Math.abs(after.water[i]-before.water[i])>1e-6||Math.abs(after.contamination[i]-before.contamination[i])>1e-6){
      tiles.push(i);if(delta>1e-6)flooded++;if(delta< -1e-6)drained++;if(after.contamination[i]>before.contamination[i]+1e-6)contaminated++;
    }
  }
  if(!tiles.length)return null;
  const xs=tiles.map(i=>i%before.W),ys=tiles.map(i=>Math.floor(i/before.W));
  return {seq,author,tiles,flooded,drained,contaminated,bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
}
