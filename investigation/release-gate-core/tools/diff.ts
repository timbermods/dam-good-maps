// What differs between two sessions' builds: heights, water layers, objects.
import type { MapSession } from "../../../src/core/doc/session";
export function diffSessions(a: MapSession, b: MapSession): string[] {
  const out: string[] = [];
  const A = a.built, B = b.built;
  let h = 0; for (let i = 0; i < A.heights.length; i++) if (A.heights[i] !== B.heights[i]) h++;
  if (h) out.push(`heights differ on ${h} tiles`);
  for (const key of ["water", "contamination", "moisture", "soilContamination"] as const) {
    let n = 0, max = 0; for (let i = 0; i < A[key].length; i++) if (A[key][i] !== B[key][i]) { n++; max = Math.max(max, Math.abs(A[key][i] - B[key][i])); }
    if (n) out.push(`${key} differs on ${n} tiles (max ${max.toFixed(4)})`);
  }
  const ent = (s: MapSession) => new Map(s.built.entities.map((e) => [e.id, `${e.template} ${e.x},${e.y},${e.z} ${e.orientation} ${JSON.stringify(e.components)}`]));
  const ea = ent(a), eb = ent(b);
  const only = (x: Map<string, string>, y: Map<string, string>) => [...x].filter(([k]) => !y.has(k)).map(([, v]) => v.slice(0, 120));
  const oa = only(ea, eb), ob = only(eb, ea);
  if (oa.length) out.push(`only in first: ${oa.length}: ${oa.slice(0, 3).join(" | ")}`);
  if (ob.length) out.push(`only in second: ${ob.length}: ${ob.slice(0, 3).join(" | ")}`);
  let changed = 0; const ex: string[] = [];
  for (const [k, v] of ea) if (eb.has(k) && eb.get(k) !== v) { changed++; if (ex.length < 2) ex.push(`${v.slice(0, 150)} VS ${eb.get(k)!.slice(0, 150)}`); }
  if (changed) out.push(`changed: ${changed}: ${ex.join(" || ")}`);
  return out;
}
