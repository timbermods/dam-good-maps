import type { Face, Stamp } from "../core/block";
const wall:Face={x:94,y:71,z:4,nx:0,ny:-1,nz:0};
const stamp=(face:Face,mode:"add"|"remove",size=1):Stamp=>({face,mode,size,layer:22});
export const tunnel=Array.from({length:9},(_,k)=>stamp({...wall,y:wall.y+k},"remove",3));
export const ledge=Array.from({length:7},(_,k)=>stamp({...wall,x:94+k},"add"));
export const cave=Array.from({length:7},(_,k)=>stamp({...wall,y:72+k,z:3},"remove",3));
export const overhang=Array.from({length:3},(_,k)=>stamp({...wall,y:71-k,z:6},"add"));
export const refused=stamp({...wall,y:68,z:6},"add");
