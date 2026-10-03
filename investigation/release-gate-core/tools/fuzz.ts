// Random edit sequences on one map (fixed seed): after each step, new object ids (D425), the settled build against a full build, undo/redo, the project reopened; at the end, the log replayed in a fresh canonical session and undo-all. Usage: npx tsx investigation/release-gate-core/tools/fuzz.ts <seed> <defer|preview|canonical> <live|import> [ops=30] [side=64] [theme]
import { MapSession } from "../../../src/core/doc/session";
import { stream } from "../../../src/core/math/rng";
import { randomOp } from "../../../tests/contract/randomOps";
import type { EditOp } from "../../../src/core/doc/ops";
import type { BuildResult } from "../../../src/core/features/build";
import { map, reopen, sha } from "../editor-core/helpers";
import { diffSessions } from "./diff";
const seed = Number(process.argv[2] ?? 1);
const mode = (process.argv[3] ?? "defer") as "defer" | "canonical" | "preview";
const kind = process.argv[4] ?? "live";
const N = Number(process.argv[5] ?? 30);
const side = Number(process.argv[6] ?? 64);
const theme = process.argv[7] as any;
const r = map(seed, side, theme);
const fresh = () => (kind === "live" ? MapSession.fromGenerated(r) : MapSession.importMap(r.bytes, "x.timber"));
const s = fresh(); s.setWaterMode(mode);
const orig = sha(fresh().exportTimber().bytes);
const origIds = new Set(fresh().built.entities.map((e) => e.id));
const rng = stream(seed, `gate2 ${mode} ${kind}`);
let problems = 0;
const bad = (m: string) => { problems++; console.log(`  !! ${m}`); };
const objKey = (b: BuildResult) => b.entities.map((e) => `${e.id} ${e.template} ${e.x},${e.y},${e.z} ${e.orientation} ${JSON.stringify(e.components)}`).sort().join("\n");
const sameLand = (a: BuildResult, b: BuildResult) => Buffer.from(a.heights).equals(Buffer.from(b.heights)) && objKey(a) === objKey(b);
const onlyBerries = (d: string[]) => d.every((x) => x.includes("BlueberryBush") && !x.includes("changed"));
for (let k = 0; k < N; k++) {
  let drawn: EditOp | EditOp[] | null = null;
  try { drawn = randomOp(s, rng); } catch (e) { bad(`draw threw ${(e as Error).message}`); continue; }
  if (!drawn) continue;
  const before = s.document.edits.length;
  let res;
  try { res = Array.isArray(drawn) ? s.applyAll(drawn, "user", "tool") : s.apply(drawn); } catch (e) { bad(`step ${k} apply threw ${(e as Error).message} ${JSON.stringify(drawn).slice(0, 200)}`); break; }
  if (!res.ok) { if (s.document.edits.length !== before) bad(`rejected op changed the log`); continue; }
  const label = Array.isArray(drawn) ? drawn.map((o) => o.op).join("+") : drawn.op + (drawn.op === "brush" ? "/" + drawn.params.tool : "");
  const allowed = new Set<string>();
  for (const o of s.document.edits) {
    if (o.op === "placeEntity") allowed.add(o.params.id);
    if (o.op === "forceResult" || o.op === "carve") for (const src of [...(o.params.source ? [o.params.source] : []), ...((o.params as any).sources ?? [])]) allowed.add(src.id);
    if (o.op === "addFeature") allowed.add("feature:" + o.params.feature.id);
    if (o.op === "updateFeature") allowed.add("feature:" + o.params.id);
  }
  const added = s.built.entities.filter((e) => !origIds.has(e.id) && !allowed.has(e.id) && e.owner !== "pinned:slopes" && !(e.owner && allowed.has("feature:" + e.owner)));
  if (added.length) bad(`step ${k} ${label}: ${added.length} new objects ${added.slice(0, 3).map((e) => e.template + "@" + e.x + "," + e.y + " owner " + e.owner).join("; ")}`);
  // land and objects: the incremental build equals a full build (the water is the mode's own)
  if (mode !== "canonical" && rng.float() < 0.4) { s.settleCanonical(); if (!sameLand(s.built, s.fullBuild())) bad(`step ${k} ${label}: after the settle, incremental land/objects differ from a full build (${mode})`); }
  const roll = rng.float();
  if (roll < 0.25 && s.canUndo) {
    const n = 1 + rng.int(0, 3);
    const e0 = sha(s.exportTimber().bytes);
    let u = 0; for (; u < n && s.undo(); u++);
    s.settleCanonical(); if (!sameLand(s.built, s.fullBuild())) bad(`step ${k}: after ${u} undos (settled) land/objects differ from a full build`);
    for (let j = 0; j < u; j++) s.redo();
    s.settleCanonical(); if (!sameLand(s.built, s.fullBuild())) bad(`step ${k}: after ${u} redos (settled) land/objects differ from a full build`);
    const e1 = sha(s.exportTimber().bytes);
    if (e1 !== e0) bad(`step ${k}: export after ${u} undos and redos differs: ${diffSessions(s, (() => { const t = fresh(); for (const o of s.document.edits) { const { seq, origin, undo, orphaned, label, ...op } = o as any; t.apply(op, origin, label); } return t; })()).join("; ").slice(0, 300)}`);
  } else if (roll < 0.45) {
    const now = sha(s.exportTimber().bytes);
    try {
      const again = reopen(s);
      if (sha(again.exportTimber().bytes) !== now) { const d = diffSessions(s, again); if (!onlyBerries(d)) bad(`step ${k} ${label}: reopened project exports differently: ${d.join("; ").slice(0, 300)}`); else console.log(`  (known: reopen loses ${d.join(" ").match(/only in first: (\d+)/)?.[1]} blueberry bushes)`); }
    } catch (e) { bad(`step ${k} reopen threw ${(e as Error).message}`); }
  }
}
const end = sha(s.exportTimber().bytes);
if (!sameLand(s.built, s.fullBuild())) bad(`end: after settle, land/objects differ from a full build`);
const t = fresh();
let ok = true;
for (const o of s.document.edits) {
  const { seq: _s, origin, undo: _u, orphaned: _o, label, ...op } = o as any;
  const res = t.apply(op as EditOp, origin, label);
  if (!res.ok) { bad(`replay refused ${o.op} seq ${o.seq}: ${res.errors.join("; ")}`); ok = false; break; }
}
if (ok && sha(t.exportTimber().bytes) !== end) bad(`replay in a fresh canonical session exports differently: ${diffSessions(s, t).join("; ").slice(0, 300)}`);
const edits = s.document.edits.length;
while (s.undo());
if (sha(s.exportTimber().bytes) !== orig) bad(`undo all differs from the original: ${diffSessions(s, fresh()).join("; ").slice(0, 300)}`);
console.log(`seed ${seed} ${mode} ${kind} ${side} ${theme ?? ""}: ${edits} edits, ${problems} problems`);
