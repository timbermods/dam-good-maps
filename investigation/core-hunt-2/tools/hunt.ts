// The second core hunt's random sequences, driven the editor's way: the worker session
// (src/worker/session.ts) that the page talks to, with the forces in Rust. Forces (all seven, Power 0
// to 100, clicks and drawn lines, kept, skipped, Esc'd while playing or after the keep, Try another),
// brushes, Select's sculpts, the shelf, Remove, the release gate's random operations, undo, redo and
// jumps, interleaved. After every step:
//   - the history holds no empty step, and undo then redo of it gives the same map back;
//   - the project saved now reopens to the same map, and its log replayed gives the stored map (D455);
//   - nothing added an object or a source (D368 (10)) but the player's placements and Carve's river;
//   - a kept force changed the land visibly (D356), a refused one gave a one-line reason;
//   - in frozen mode, objects away from what an edit changed stay exactly as stored.
// Usage: npx tsx investigation/core-hunt-2/tools/hunt.ts <seed> [steps=40] [side=64] [theme] [live|frozen|import]
// Prints one line per problem, then a summary; the step log goes to local/hunt-<args>.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodeProject, encodeProject } from "../../../src/core/doc/document";
import { MapSession } from "../../../src/core/doc/session";
import type { EditOp } from "../../../src/core/doc/ops";
import { makeSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { stream, type Rng } from "../../../src/core/math/rng";
import { runGenerate } from "../../../src/worker/api";
import * as ed from "../../../src/worker/session";
import { randomOp } from "../../../tests/contract/randomOps";
import { DEFAULTS as CARVE } from "../../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../../src/core/forces/erupt";
import { QUAKE_DEFAULTS } from "../../../src/core/forces/quake";
import { GLACIATE_DEFAULTS } from "../../../src/core/forces/glaciate/model";
import { RIFT_DEFAULTS } from "../../../src/core/forces/rift";
import { DEPOSIT_DEFAULTS } from "../../../src/core/forces/deposit";
import type { BuildResult } from "../../../src/core/features/build";

const seed = Number(process.argv[2] ?? 1);
const STEPS = Number(process.argv[3] ?? 40);
const side = Number(process.argv[4] ?? 64);
const theme = (process.argv[5] || undefined) as ThemeId | undefined;
const kind = process.argv[6] ?? "live";
const W = side;
const H = side;
const rng: Rng = stream(seed, `core-hunt-2 ${kind} ${side} ${theme ?? ""}`);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 16);

let problems = 0;
const seen = new Map<string, number>();
const log: unknown[] = [];
function bad(step: number, what: string, key = what.replace(/[0-9.]+/g, "#").slice(0, 70)) {
  problems++;
  seen.set(key, (seen.get(key) ?? 0) + 1);
  if (seen.get(key)! <= 2) console.log(`  !! step ${step}: ${what}`);
}

// ----------------------------------------------------------------------------- the map

await runGenerate(makeSpec({ seed, size: { x: W, y: H }, ...(theme ? { theme } : {}) }));
ed.refine();
ed.settleWater();
if (kind === "frozen") {
  // a project saved by an older generator: it opens frozen, exactly as saved (D336 (2))
  const doc = decodeProject(ed.project().bytes);
  const live = MapSession.open(doc).built;
  ed.openProject(encodeProject({ ...doc, generatorVersion: "0.7.0", spec: doc.spec ? { ...doc.spec, generatorVersion: "0.7.0" } : doc.spec }));
  const fz = reopened().built;
  const d = diffBuilt(live, fz);
  if (d.length) bad(-1, `a frozen project opens differently from as saved: ${d.join("; ")}`);
} else if (kind === "import") {
  const s = reopened();
  ed.openTimber(s.exportTimber().bytes, "x.timber");
}
ed.settleWater();
const original = reopened().built;
const origIds = new Set(original.entities.map((e) => e.id));

function reopened(): MapSession {
  return MapSession.open(decodeProject(ed.project().bytes));
}
// (an object as the file writes it: an imported or stored one's own components, else the build's)
function entKey(e: BuildResult["entities"][number]): string {
  const c = e.raw ? Object.fromEntries(Object.entries(e.raw.Components as Record<string, unknown>).filter(([k]) => k !== "BlockObject")) : { ...(e.before ?? {}), ...e.components };
  return `${e.template} ${e.x},${e.y},${e.z} ${e.orientation} ${JSON.stringify(c, (_k, v) => (v && typeof v === "object" && "value" in v && "raw" in v ? v.value : v))}`;
}
function diffBuilt(a: BuildResult, b: BuildResult): string[] {
  const out: string[] = [];
  let h = 0;
  for (let i = 0; i < a.heights.length; i++) if (a.heights[i] !== b.heights[i]) h++;
  if (h) out.push(`heights differ on ${h} tiles`);
  const ea = new Map(a.entities.map((e) => [e.id, entKey(e)]));
  const eb = new Map(b.entities.map((e) => [e.id, entKey(e)]));
  const onlyA = [...ea].filter(([k]) => !eb.has(k)).map(([, v]) => v);
  const onlyB = [...eb].filter(([k]) => !ea.has(k)).map(([, v]) => v);
  const ch = [...ea].filter(([k, v]) => eb.has(k) && eb.get(k) !== v).map(([k, v]) => `${v} VS ${eb.get(k)}`);
  if (onlyA.length) out.push(`only before: ${onlyA.length} (${onlyA.slice(0, 2).join(" | ").slice(0, 160)})`);
  if (onlyB.length) out.push(`only after: ${onlyB.length} (${onlyB.slice(0, 2).join(" | ").slice(0, 160)})`);
  if (ch.length) out.push(`changed: ${ch.length} (${ch[0].slice(0, 200)})`);
  return out;
}

// ----------------------------------------------------------------------------- the forces

const VERBS = ["carve", "craterize", "erupt", "quake", "glaciate", "rift", "deposit"] as const;
type V = (typeof VERBS)[number];
const pt = () => ({ x: rng.int(2, W - 2), y: rng.int(2, H - 2) });
function line(): { x: number; y: number }[] {
  const a = pt();
  const ang = rng.float() * Math.PI * 2;
  const len = rng.int(6, 30);
  const n = rng.int(2, 6);
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    out.push({ x: Math.max(0, Math.min(W - 1, Math.round(a.x + Math.cos(ang) * len * t + rng.int(-1, 2)))), y: Math.max(0, Math.min(H - 1, Math.round(a.y + Math.sin(ang) * len * t + rng.int(-1, 2)))) });
  }
  return out;
}
function forceRequest(verb: V): ed.ForceRequest {
  const power = rng.float() < 0.25 ? 0 : rng.int(0, 101);
  const drag = rng.float() < 0.4;
  const path = drag ? line() : (() => { const p = pt(); return [p, p]; })();
  const origin: [number, number] = [path[0].x, path[0].y];
  const end: [number, number] = [path.at(-1)!.x, path.at(-1)!.y];
  const via = path.slice(1, -1).map((p) => [p.x, p.y] as [number, number]);
  const base = { cut: rng.float() < 0.1 ? rng.int(2, 12) : null, natural: true } as const;
  const sz = (lo: number, hi: number) => (rng.float() < 0.6 ? null : rng.int(lo, hi + 1));
  switch (verb) {
    case "carve":
      return { verb, settings: { ...CARVE, mode: drag ? "aim" : "unleash", power, width: sz(2, 24), wander: null, walls: null, depth: null, riverDepth: 2, banks: null, dry: rng.float() < 0.4, seed: rng.int(0, 1000) } as any, origin, ...(drag ? { end, via } : {}), ...base };
    case "craterize":
      return { verb, settings: { ...CRATER_DEFAULTS, mode: "strike", power, size: sz(4, 60), walls: null, centre: null, debris: null, rays: null, seed: rng.int(0, 1000) } as any, origin, ...base };
    case "erupt":
      return { verb, settings: { ...ERUPT_DEFAULTS, mode: drag ? "fissure" : "vent", power, size: sz(6, 60), shape: null, summit: null, flows: null, ridges: null, seed: rng.int(0, 1000) } as any, origin, ...(drag ? { path } : {}), ...base };
    case "glaciate":
      return { verb, settings: { ...GLACIATE_DEFAULTS, mode: "flow", power, size: sz(4, 64), benches: null, steps: null, tarn: null, scree: null, meltwater: rng.float() < 0.7, seed: rng.int(0, 1000) } as any, origin, ...(drag ? { end, via } : {}), ...base };
    case "quake": {
      const lift = rng.float() < 0.5;
      return { verb, settings: { ...QUAKE_DEFAULTS, mode: lift ? "lift" : "slide", power, scarp: null, seed: rng.int(0, 1000) } as any, path, side: rng.float() < 0.5 ? 1 : -1, ...(lift && drag ? { painting: true } : {}), ...base };
    }
    case "rift":
      return { verb, settings: { ...RIFT_DEFAULTS, power, size: sz(4, 64), walls: rng.pick(["auto", "sheer", "stepped"] as const), seed: rng.int(0, 1000) }, path, ...base };
    case "deposit":
      return { verb, settings: { ...DEPOSIT_DEFAULTS, power, size: sz(4, 64), channels: rng.pick(["auto", "few", "many"] as const), seed: rng.int(0, 1000) }, path, ...base };
  }
}

const historyOf = () => ed.sessionInfo().history;
const histKey = () => JSON.stringify(historyOf().map((h) => [h.label, h.op, h.count, h.applied]));

/** A force the editor's way; returns a label for the log. */
function useForce(step: number): string {
  const verb = rng.pick(VERBS);
  const req = forceRequest(verb);
  if (rng.float() < 0.15) {
    const s = reopened();
    const area: [number, number, number][] = [];
    const x0 = rng.int(1, W - 20), y0 = rng.int(1, H - 20), w = rng.int(6, 20), h = rng.int(6, 20);
    for (let y = y0; y < Math.min(H, y0 + h); y++) area.push([y, x0, Math.min(W - 1, x0 + w)]);
    (req as any).area = area;
    void s;
  }
  const before = ed.terrainNow().heights.slice();
  const hBefore = histKey();
  let r: ed.ForceStarted;
  try {
    r = ed.forceStart(req);
  } catch (e) {
    bad(step, `${verb} forceStart threw: ${(e as Error).message.slice(0, 120)}`);
    try { ed.forceCancel(); } catch {}
    return `${verb} threw`;
  }
  log.push({ step, force: req, started: r.ok, errors: r.errors });
  if (!r.ok) {
    if (r.errors.length !== 1 || /\n/.test(r.errors[0]) || /undefined|NaN|TypeError|Cannot read/.test(r.errors[0])) bad(step, `${verb} refused without a plain reason: ${JSON.stringify(r.errors)}`);
    return `${verb} refused (${r.errors[0]})`;
  }
  let shown = r.frame?.heights ?? before;
  const end = rng.float();
  const frames = end < 0.15 ? rng.int(0, 4) : 100000;
  let k = 0;
  if (!(verb === "quake" && (req as any).painting))
    for (; k < frames; k++) {
      const f = ed.forceAdvance(rng.int(1, 30));
      if (!f) break;
      if (f.heights) shown = f.heights;
      if (f.done) break;
    }
  if (end < 0.08) {
    // Esc while it plays: the map exactly as before, history unchanged
    ed.forceCancel(r.gesture);
    if (!Buffer.from(ed.terrainNow().heights).equals(Buffer.from(before))) bad(step, `${verb}: Esc while playing left the land changed`);
    if (histKey() !== hBefore) bad(step, `${verb}: Esc while playing changed the history`);
    return `${verb} esc`;
  }
  const st = ed.forceStop(r.gesture);
  if (!st.kept) {
    if (histKey() !== hBefore) bad(step, `${verb}: a force not kept changed the history`);
    if (!Buffer.from(ed.terrainNow().heights).equals(Buffer.from(before))) bad(step, `${verb}: a force not kept left the land changed`);
    if (!/working area/.test(st.errors[0] ?? "")) bad(step, `${verb} (power ${req.settings.power}, ${req.cut !== null ? "cut " + req.cut : "no cut"}${(req as any).area ? ", area" : ""}) played then was not kept: ${JSON.stringify(st.errors)}`, `not kept: ${verb} ${st.errors[0]?.replace(/[0-9.]+/g, "#")}`);
    return `${verb} not kept`;
  }
  const after = ed.terrainNow().heights;
  // the last frame shown is the land kept (D368 (9)): only for a force played to its end
  const done = k < frames;
  if (done) {
    let pop = 0;
    for (let i = 0; i < after.length; i++) if (after[i] !== shown[i]) pop++;
    // (a carry of the start changes ground the force left: allowed, the start's bench)
    if (pop > 30) {
      bad(step, `${verb}: ${pop} tiles differ between the last frame shown and the land kept`, `pop ${verb}`);
      if (process.env.DUMP) {
        const t: string[] = [];
        for (let i = 0; i < after.length && t.length < 40; i++) if (after[i] !== shown[i]) t.push(`${i % W},${(i / W) | 0}: before ${before[i]} shown ${shown[i]} kept ${after[i]}`);
        console.log(JSON.stringify(req), "\n", t.join("\n"), "\nhistory", JSON.stringify(historyOf().slice(-2)));
      }
    }
  }
  let changedTiles = 0;
  for (let i = 0; i < after.length; i++) if (Math.abs(after[i] - before[i]) >= 1) changedTiles++;
  if (changedTiles < 9 && !(req as any).area && req.cut === null) bad(step, `${verb} at Power ${req.settings.power} kept with only ${changedTiles} tiles changed (D356)`, `invisible ${verb}`);
  const roll = rng.float();
  if (roll < 0.12) {
    // Esc arriving after the keep: taken back as if never kept
    const t = ed.forceCancel(r.gesture);
    if (t.taken !== "kept") bad(step, `${verb}: Esc after the keep did not take it back (${t.taken} ${t.reason ?? ""})`);
    else {
      if (!Buffer.from(ed.terrainNow().heights).equals(Buffer.from(before))) bad(step, `${verb}: Esc after the keep left the land changed`);
      if (histKey() !== hBefore) bad(step, `${verb}: Esc after the keep changed the history`);
    }
    return `${verb} kept then esc`;
  }
  if (roll < 0.35) {
    // Try another, once or twice
    for (let n = rng.int(1, 3); n > 0; n--) {
      const hb = historyOf().filter((h) => h.applied).length;
      const a = ed.forceAgain();
      if (!a.ok) { bad(step, `${verb}: Try another refused right after the keep: ${a.errors}`); break; }
      for (let j = 0; j < 100000; j++) { const f = ed.forceAdvance(30); if (!f || f.done) break; }
      const s2 = ed.forceStop(a.gesture);
      const ha = historyOf().filter((h) => h.applied).length;
      if (s2.kept && ha !== hb + 1) bad(step, `${verb}: Try another changed the number of steps (${hb} → ${ha})`);
    }
    return `${verb} kept + again`;
  }
  return `${verb} kept (${changedTiles})`;
}

// ----------------------------------------------------------------------------- the rest

function brushOrOp(step: number): string {
  const s = reopened();
  const drawn = randomOp(s, rng);
  if (!drawn) return "nothing drawn";
  log.push({ step, op: drawn });
  const r = Array.isArray(drawn) ? ed.applyAll(drawn, "edit") : ed.apply(drawn);
  const label = Array.isArray(drawn) ? drawn.map((o) => o.op).join("+") : drawn.op + (drawn.op === "brush" ? "/" + drawn.params.tool : "");
  if (!r.ok) {
    if (!r.errors.length || r.errors.some((e) => /undefined|NaN|TypeError|Cannot read|\n/.test(e))) bad(step, `${label} refused without a plain reason: ${JSON.stringify(r.errors).slice(0, 200)}`);
    return `${label} refused`;
  }
  return label;
}

function undoRedo(step: number): string {
  const n = rng.int(1, 4);
  const hb = histKey();
  const before = reopened().built;
  let u = 0;
  for (; u < n; u++) if (!ed.undo().ok) break;
  if (rng.float() < 0.3 && u > 0) {
    // a new edit after undo: the redo branch goes
    return `undo ${u}`;
  }
  for (let j = 0; j < u; j++) if (!ed.redo().ok) bad(step, `redo ${j + 1} of ${u} refused`);
  const after = reopened().built;
  const d = diffBuilt(before, after);
  if (d.length) bad(step, `${u} undos then redos change the map: ${d.join("; ")}`);
  if (histKey() !== hb) bad(step, `${u} undos then redos change the history`);
  return `undo/redo ${u}`;
}

// ----------------------------------------------------------------------------- the page's tools

const ORIENT = ["Cw0", "Cw90", "Cw180", "Cw270"] as const;
function rectTiles(maxSide: number): number[] {
  const w = rng.int(1, maxSide + 1), h = rng.int(1, maxSide + 1);
  const x0 = rng.int(0, W - w), y0 = rng.int(0, H - h);
  const out: number[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push(y * W + x);
  return out;
}
let ids = 0;
const newId = () => { const h = createHash("sha256").update(`hunt ${seed} ${ids++}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
function pageTool(step: number): string {
  const r = rng.float();
  const s = reopened();
  let u: { ok: boolean; errors: string[] };
  let what: string;
  const h = s.built.heights;
  if (r < 0.15) {
    const kinds = (["trees", "bushes", "ruins", "sources", "slopes", "objects", "start"] as const).filter(() => rng.float() < 0.5);
    u = ed.removeAt(rectTiles(12), kinds.length ? kinds : ["trees"]);
    what = `remove ${kinds.join(",")}`;
  } else if (r < 0.3) {
    const t = rng.pick(["Pine", "Birch", "Oak", "BlueberryBush"]);
    u = ed.plantAt(t, rectTiles(6));
    what = `plant ${t}`;
  } else if (r < 0.45) {
    const template = rng.pick(["WaterSource", "BadwaterSource", "SmallRelic", "MediumRelic", "GeothermalField", "UndergroundRuins", "RuinColumnH3", "Blockage", "Slope"]);
    u = ed.applyTool({ tool: "entity", template, x: rng.int(1, W - 2), y: rng.int(1, H - 2), orientation: rng.pick(ORIENT) } as any, newId());
    what = `place ${template}`;
  } else if (r < 0.55) {
    u = ed.moveStartTo(rng.int(3, W - 3), rng.int(3, H - 3), rng.float() < 0.3 ? rng.pick(ORIENT) : undefined);
    what = "move start";
  } else if (r < 0.65) {
    const movable = s.built.entities.filter((e) => /Relic|Geothermal|UndergroundRuins|Blockage|WaterSource|BadwaterSource/.test(e.template));
    if (!movable.length) return "nothing to move";
    const e = rng.pick(movable);
    u = ed.moveObjectBy(e.id, rng.int(-4, 5), rng.int(-4, 5));
    what = `move ${e.template}`;
  } else if (r < 0.85) {
    const tiles = rectTiles(rng.float() < 0.3 ? 1 : 10);
    const L = rng.int(0, 23);
    const mode = rng.pick(["raise", "lower", "set", "cut", "fill", "delete"] as const);
    const runs = (t: number[]) => { const out: [number, number, number][] = []; for (const i of t) { const x = i % W, y = (i / W) | 0; const last = out.at(-1); if (last && last[0] === y && last[2] === x - 1) last[2] = x; else out.push([y, x, x]); } return out; };
    let ops: EditOp[];
    let t = tiles;
    if (mode === "raise" || mode === "lower") ops = [{ op: "sculpt", params: { mode, cells: runs(t), amount: 1 } } as EditOp];
    else if (mode === "delete") { t = tiles.filter((i) => h[i] > 0); ops = [{ op: "sculpt", params: { mode: "lower", cells: runs(t), amount: 1, exact: true } } as EditOp]; }
    else { if (mode === "cut") t = tiles.filter((i) => h[i] > L); if (mode === "fill") t = tiles.filter((i) => h[i] < L); ops = [{ op: "sculpt", params: { mode: "flatten", cells: runs(t), level: L } } as EditOp]; }
    if (!t.length) return `select ${mode}: nothing`;
    log.push({ step, select: ops, tiles: t });
    u = ed.applySelection(ops, `Select ${mode}`, t);
    what = `select ${mode} ${t.length}`;
    if (u.ok) {
      // Select is exact (D264): every tile it was given changed as asked, unless a start carry
      const now = reopened().built.heights;
      let wrong = 0;
      for (const i of t) { const want = mode === "raise" ? Math.min(22, h[i] + 1) : mode === "lower" || mode === "delete" ? Math.max(0, h[i] - 1) : L; if (now[i] !== want) wrong++; }
      if (wrong) bad(step, `${what}: ${wrong} of ${t.length} tiles not as asked`, `select inexact ${mode}`);
    }
  } else {
    const tool = rng.pick(["raise", "lower", "flatten", "smooth", "naturalize"] as const);
    let x = rng.int(4, W - 4) * 4 + 2, y = rng.int(4, H - 4) * 4 + 2;
    const dabs: number[] = [];
    for (let k = rng.int(1, 30); k > 0; k--) { x = Math.min(4 * W - 1, Math.max(0, x + rng.int(-6, 7))); y = Math.min(4 * H - 1, Math.max(0, y + rng.int(-6, 7))); dabs.push(x, y); }
    const op = { op: "brush", params: { tool, size: rng.int(2, 19) / 2, strength: rng.int(1, 11), ...(tool === "flatten" ? { level: rng.int(0, 17) } : {}), ...(tool === "naturalize" ? { seed: rng.int(0, 1_000_000), weathers: true } : {}), dabs } } as EditOp;
    const tiles: number[] = [];
    for (let k = 0; k < dabs.length; k += 2) tiles.push(Math.floor(dabs[k + 1] / 4) * W + Math.floor(dabs[k] / 4));
    log.push({ step, clearing: op, tiles });
    u = ed.strokeClearing(op, tool, tiles);
    what = `stroke clearing ${tool}`;
  }
  if (!u.ok && (!u.errors.length || u.errors.some((e) => /undefined|NaN|TypeError|Cannot read|\n/.test(e)))) bad(step, `${what} refused without a plain reason: ${JSON.stringify(u.errors)}`);
  return u.ok ? what : `${what} refused (${u.errors[0]})`;
}

// ----------------------------------------------------------------------------- races

/** What the page's queue may deliver in an odd order: Esc for a gesture before its start, an undo or
 *  an edit while a force plays, Try another after an undo, a jump through the history. */
function race(step: number): string {
  const r = rng.float();
  const before = ed.terrainNow().heights.slice();
  const hb = histKey();
  if (r < 0.25) {
    // Esc for the next gesture before its start arrives: it never starts, nothing changes
    const g = 1_000_000 + step;
    ed.forceCancel(g);
    const s = ed.forceStart({ ...forceRequest(rng.pick(VERBS)), gesture: g } as ed.ForceRequest);
    if (s.ok) { bad(step, `a force Esc'd before its start started anyway`); ed.forceCancel(); }
    if (!Buffer.from(ed.terrainNow().heights).equals(Buffer.from(before)) || histKey() !== hb) bad(step, `Esc before a start changed the map or the history`);
    return "esc before start";
  }
  if (r < 0.5) {
    // an undo (or an edit) arrives while a force plays, then the force is kept
    const verb = rng.pick(VERBS);
    const s = ed.forceStart(forceRequest(verb));
    if (!s.ok) return `${verb} refused`;
    ed.forceAdvance(rng.int(0, 3));
    const u = rng.float() < 0.5 ? ed.undo() : ed.apply({ op: "sculpt", params: { mode: "raise", cells: [[rng.int(2, H - 2), 2, 6]], amount: 1 } } as EditOp);
    for (let k = 0; k < 100000; k++) { const f = ed.forceAdvance(30); if (!f || f.done) break; }
    const st = ed.forceStop(s.gesture);
    return `${verb} with ${u.ok ? "a change" : "a refused change"} mid-play, ${st.kept ? "kept" : "not kept"}`;
  }
  if (r < 0.75) {
    // Try another when the force is no longer the latest step: refused, nothing changes
    const info = ed.sessionInfo();
    if (!info.forceAgain && info.canUndo) {
      const a = ed.forceAgain();
      if (a.ok) { bad(step, `Try another ran with no force as the latest step`); ed.forceCancel(); }
      return "again refused";
    }
    if (info.forceAgain && info.canUndo) {
      ed.undo();
      // (undo may bring back an earlier try of the same force: Try another may replace that one)
      const offered = ed.sessionInfo().forceAgain;
      const a = ed.forceAgain();
      if (a.ok !== !!offered) bad(step, `Try another ${a.ok ? "ran" : "was refused"} after an undo while the session ${offered ? "offered" : "did not offer"} it`, "again after undo");
      if (a.ok) {
        for (let k = 0; k < 100000; k++) { const f = ed.forceAdvance(30); if (!f || f.done) break; }
        ed.forceStop(a.gesture);
      }
      return "again after undo";
    }
    return "nothing to try again";
  }
  const n = ed.sessionInfo().history.length;
  if (!n) return "no history";
  const to = rng.int(-1, n);
  const j = ed.jump(to);
  const applied = ed.sessionInfo().history.filter((h) => h.applied).length;
  if (j.ok && applied !== to + 1) bad(step, `jump to ${to} left ${applied} steps applied`);
  return `jump ${to}`;
}

// ----------------------------------------------------------------------------- the run

for (let step = 0; step < STEPS; step++) {
  const before = reopened().built;
  const roll = rng.float();
  let what: string;
  try {
    what = roll < 0.32 ? useForce(step) : roll < 0.5 ? brushOrOp(step) : roll < 0.72 ? pageTool(step) : roll < 0.84 ? race(step) : undoRedo(step);
  } catch (e) {
    bad(step, `threw: ${(e as Error).stack?.split("\n").slice(0, 3).join(" ").slice(0, 300)}`);
    try { ed.forceCancel(); } catch {}
    continue;
  }
  if (rng.float() < 0.5) ed.settleWater();
  // the history: no empty step
  const hist = historyOf();
  if (hist.some((h) => !h.count)) bad(step, `${what}: the history holds an empty step`);
  // saved now, reopened: its log replayed gives the stored map (D455), and the same map
  ed.settleWater();
  let again: MapSession;
  try {
    again = reopened();
    // (a frozen project at its opened state: its replay is a frozen build, never the stored map; D455 stops undo there)
    if (!(kind === "frozen" && again.editCount === 0) && !again.checkReplay()) {
      const re = MapSession.open(decodeProject(ed.project().bytes), { rebuild: true });
      bad(step, `${what}: the saved project's replay differs from its stored map: ${diffBuilt(again.built, re.built).join("; ")}`, `replay differs after ${what.split(" ")[0]}`);
    }
  } catch (e) {
    bad(step, `${what}: reopening threw ${(e as Error).message.slice(0, 160)}`);
    continue;
  }
  const now = again.built;
  // nothing added an object or a source but the player's placements and Carve's river
  const allowed = new Set<string>();
  for (const o of again.document.edits) {
    if (o.op === "placeEntity") allowed.add(o.params.id);
    if (o.op === "forceResult") for (const src of [...((o.params as any).source ? [(o.params as any).source] : []), ...((o.params as any).sources ?? [])]) allowed.add(src.id);
    if (o.op === "addFeature") allowed.add("f:" + o.params.feature.id);
  }
  const featureOp = /Feature|moveEntity|setEntityProps|deleteEntities|placeEntity|^place |^plant |^move /.test(what);
  const added = featureOp ? [] : now.entities.filter((e) => !origIds.has(e.id) && !allowed.has(e.id) && !allowed.has("f:" + e.owner) && e.owner !== "pinned:slopes" && !before.entities.some((b) => b.id === e.id));
  if (added.length) bad(step, `${what}: ${added.length} new objects: ${added.slice(0, 3).map((e) => `${e.template}@${e.x},${e.y} owner ${e.owner}`).join("; ")}`, `added ${what.split(" ")[0]} ${added[0].template}`);
  // frozen: objects other than trees and bushes change only near the ground the edit changed
  if (kind === "frozen" && !what.startsWith("undo") && !featureOp) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < now.heights.length; i++) if (now.heights[i] !== before.heights[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const near = (e: { x: number; y: number }) => x1 >= 0 && e.x >= x0 - 6 && e.x <= x1 + 6 && e.y >= y0 - 6 && e.y <= y1 + 6;
    const bk = new Map(before.entities.map((e) => [e.id, entKey(e)]));
    const far = now.entities.filter((e) => !/Pine|Birch|Oak|Bush|Succulent|Maple|Chestnut|StartingLocation/.test(e.template) && bk.has(e.id) && bk.get(e.id) !== entKey(e) && !near(e));
    if (far.length) bad(step, `${what}: frozen objects changed away from the edit: ${far.slice(0, 2).map((e) => `${bk.get(e.id)} → ${entKey(e)}`).join(" | ").slice(0, 300)}`, `frozen far ${what.split(" ")[0]}`);
  }
  log.push({ step, what, edits: again.editCount });
  console.log(`step ${step}: ${what}`);
}
// undo everything: the map as opened
let n = 0;
while (ed.undo().ok) n++;
ed.settleWater();
const d = diffBuilt(original, reopened().built);
if (d.length) bad(STEPS, `undo all (${n}) differs from the map as opened: ${d.join("; ")}`);
mkdirSync("investigation/core-hunt-2/local", { recursive: true });
writeFileSync(`investigation/core-hunt-2/local/hunt-${seed}-${side}-${theme ?? "any"}-${kind}.json`, JSON.stringify(log));
console.log(`seed ${seed} ${side} ${theme ?? "any"} ${kind}: ${STEPS} steps, ${problems} problems`);
for (const [k, v] of seen) console.log(`  ${v}× ${k}`);
process.exit(0);
