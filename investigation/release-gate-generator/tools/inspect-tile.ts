import { generate } from "../../../src/core/gen/generate";
import { readTimber } from "../../../src/core/format/timber";
import { storedWater, surfaceOf } from "../../../src/core/format/world";
import { decodeSpecFragment } from "../../../src/core/spec/mapspec";
const [frag, tileArg] = process.argv.slice(2);
const r = generate(decodeSpecFragment(frag)!.spec);
const file = readTimber(r.bytes);
const w = file.world; const W = w.sizeX, H = w.sizeY;
const s = surfaceOf(w);
const sp = storedWater(w.singletons, W, H);
const depth = new Float64Array(W * H); const cont = new Float64Array(W * H);
for (let k = 0; k < sp.tile.length; k++) { depth[sp.tile[k]] += sp.depth[k]; cont[sp.tile[k]] = sp.contamination[k]; }
const t = Number(tileArg); const tx = t % W, ty = (t - tx) / W;
console.log(frag, "tile", t, `(${tx},${ty})`, "depth", depth[t], "built.water", r.built.water[t], "cont", cont[t]);
for (let y = ty - 3; y <= ty + 3; y++) { let line = ""; for (let x = tx - 3; x <= tx + 3; x++) { const i = y * W + x; line += `${String(s[i]).padStart(2)}:${depth[i].toFixed(2)} `; } console.log(line); }
const srcs = w.entities.filter((e) => /Source/.test(String(e.Template))).map((e) => { const c = (e.Components as any).BlockObject.Coordinates; return `${e.Template}@${c.X},${c.Y},${c.Z}`; });
console.log("sources", srcs.join(" "));
console.log("features near", r.features.filter((f) => f.kind === "lake" || f.kind === "river").map((f) => `${f.kind}:${f.id}`).join(" "));
