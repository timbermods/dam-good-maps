// Reduce a fuzz.ts run (same arguments, steps instead of ops) to the fewest operations whose session differs from its reopened project; writes local/reduced2.json.
// Reduce a fuzz run's log to the fewest ops where the session's export differs from its reopened project's.
import { MapSession } from "../../../src/core/doc/session";
import { stream } from "../../../src/core/math/rng";
import { randomOp } from "../../../tests/contract/randomOps";
import type { EditOp } from "../../../src/core/doc/ops";
import { map, reopen, sha } from "../editor-core/helpers";
import { diffSessions } from "./diff";
import { writeFileSync } from "node:fs";
const [seed, mode, kind, steps, side, theme] = [Number(process.argv[2]), process.argv[3] as any, process.argv[4], Number(process.argv[5]), Number(process.argv[6] ?? 64), process.argv[7] as any];
const ignoreDead = process.env.IGNORE_DEAD === "1";
const r = map(seed, side, theme);
const fresh = () => (kind === "live" ? MapSession.fromGenerated(r) : MapSession.importMap(r.bytes, "x.timber"));
// replay fuzz's exact draw (same rng draws) for `steps` steps
const s = fresh(); s.setWaterMode(mode);
const rng = stream(seed, `gate2 ${mode} ${kind}`);
for (let k = 0; k < steps; k++) {
  const drawn = randomOp(s, rng); if (!drawn) continue;
  const res = Array.isArray(drawn) ? s.applyAll(drawn, "user", "tool") : s.apply(drawn);
  if (!res.ok) continue;
  if (mode !== "canonical" && rng.float() < 0.4) s.settleCanonical();
  const roll = rng.float();
  if (roll < 0.25 && s.canUndo) { const n = 1 + rng.int(0, 3); s.exportTimber(); let u = 0; for (; u < n && s.undo(); u++); s.settleCanonical(); for (let j = 0; j < u; j++) s.redo(); s.settleCanonical(); s.exportTimber(); }
  else if (roll < 0.45) { s.exportTimber(); }
}
console.log("original differs:", sha(s.exportTimber().bytes) !== sha(reopen(s).exportTimber().bytes), diffSessions(s, reopen(s)).join("; ").slice(0, 300));
const strip = (o: any) => { const { seq, origin, undo, orphaned, label, ...op } = o; return op as EditOp; };
let ops = s.document.edits.map(strip);
const fails = (list: EditOp[]) => {
  const u = fresh(); u.setWaterMode(mode);
  for (const op of list) if (!u.apply(op).ok) return false;
  u.settleCanonical();
  const d = diffSessions(u, reopen(u));
  return d.length > 0 && (!ignoreDead || d.some((x) => !x.includes("IsDead")));
};
console.log("plain replay fails:", fails(ops), ops.length);
if (fails(ops)) {
  let changed = true;
  while (changed) { changed = false; for (let k = ops.length - 1; k >= 0; k--) { const t = ops.filter((_, j) => j !== k); if (fails(t)) { ops = t; changed = true; } } }
  writeFileSync("investigation/release-gate-core/local/reduced2.json", JSON.stringify(ops));
  const u = fresh(); u.setWaterMode(mode); for (const op of ops) u.apply(op); u.settleCanonical();
  console.log(ops.length, ops.map((o) => o.op + (o.op === "brush" ? "/" + (o.params as any).tool : "") + (o.op === "addFeature" ? "/" + o.params.feature.kind : "")).join(", "));
  console.log(diffSessions(u, reopen(u)).join("; ").slice(0, 500));
}
