// Adapted from collab-spike/model.ts (dev 8f3e7e27): same real MapSession, seed,
// brush envelope and seeded request stream. Transport/code exchange is already proved there.
import { MapSession } from '../../src/core/doc/session';
import { makeSpec } from '../../src/core/spec/mapspec';
import { generate } from '../../src/core/gen/generate';
import type { EditOp } from '../../src/core/doc/ops';
export function makeSession(size=48){return MapSession.fromGenerated(generate(makeSpec({seed:349,size:{x:size,y:size},theme:'riverValley',designedFor:'normal'}),{maxAttempts:1}));}
export function random(seed:number){let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
export function brush(x:number,y:number,tool:'raise'|'lower'|'smooth'='raise'):EditOp{return {op:'brush',params:{tool,size:2,strength:5,dabs:[4*x+2,4*y+2,4*x+3,4*y+2,4*x+4,4*y+3,4*x+6,4*y+4]}};}
