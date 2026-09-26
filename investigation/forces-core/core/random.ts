/** Integer-only mixers are stable across scheduling and platforms. */
export function hash(seed:number,k:number):number {
 let x=Math.imul((seed^Math.imul(k+1,0x9e3779b9))>>>0,0x85ebca6b);x^=x>>>13;
 return (Math.imul(x,0xc2b2ae35)>>>0)/4294967296;
}
export function mixSeed(n:number):number {
 n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return (n^(n>>>15))>>>0;
}
export function terrainSeed(h:Uint8Array){let s=2166136261;for(const v of h)s=Math.imul(s^v,16777619);return s>>>0;}
export function geology(h:Uint8Array):number[]{const s=terrainSeed(h);return Array.from({length:23},(_,z)=>(z+s%4)%4===0?1:0);}
export const nextSeed=(seed:number)=>(seed+1)>>>0;
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};
