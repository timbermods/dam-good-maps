// The Dam Good Maps MCP server's maps (D141, D501): each tool is a thin wrapper over the headless core, the same
// calls the page's worker makes (src/worker/session.ts, src/worker/api.ts), so a map made here is the map the page
// makes and its files are the page's files. Nothing here edits a map but through the core's operations (D342).

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { NO_START, NO_START_REFUSAL, groupChecks, type CheckGroups, type CheckItem } from "../../src/core/doc/checkItems";
import { bakeLandforms } from "../../src/core/doc/bake";
import { decodeProject, documentFileName } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { planPaintObjects } from "../../src/core/doc/paint";
import { planEntity, planMoveEntity, withSpringPools } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { newRampedStroke } from "../../src/core/doc/strokes";
import { planStart } from "../../src/core/doc/tools";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import { applyForce } from "../../src/core/collab/forceStep";
import { isPickable } from "../../src/core/features/objects";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { ERODE_DEFAULTS } from "../../src/core/forces/erode";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import type { ForceRequest } from "../../src/core/forces/start";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { INTENTIONS } from "../../src/core/land/intentions";
import { canonicalRun, type CanonicalWater } from "../../src/core/sim/prefill";
import { worldWaterModel } from "../../src/core/sim/stackWater";
import type { WaterModel } from "../../src/core/sim/water";
import { applyMergePatch } from "../../src/core/spec/mergepatch";
import {
  generatorSizeRefusal,
  highestTerrainDefault,
  makeSpec,
  seedFromText,
  SIZE_PRESETS,
  THEMES,
  type Difficulty,
  type MapSpec,
  type SizePreset,
  type ThemeId,
} from "../../src/core/spec/mapspec";
import { validateSpec } from "../../src/core/spec/schema";
import type { Validation } from "../../src/core/validate/checks";

/** A refusal: its one line goes back to the caller word for word. */
export class Refused extends Error {}

const refuse = (why: string): never => {
  throw new Refused(why);
};

// ------------------------------------------------------------------------------------------- the open maps

/** The maps open in this server, by handle. Each holds a whole map and its history, so only the latest few stay. */
const MOST_OPEN = 6;
const open = new Map<string, MapSession>();
/** Handles of maps the generator is still making (jobs.ts). */
const making = new Set<string>();
let nextHandle = 1;

/** A handle for a map the generator starts to make. It names the map when the map is made. */
export function reserveHandle(): string {
  const id = `map-${nextHandle++}`;
  making.add(id);
  return id;
}

/** The generator did not make the map: its handle names nothing. */
export function releaseHandle(id: string): void {
  making.delete(id);
}

function keep(s: MapSession, id = `map-${nextHandle++}`): string {
  making.delete(id);
  open.set(id, s);
  while (open.size > MOST_OPEN) open.delete(open.keys().next().value!);
  return id;
}

/** The open map with this handle, or the refusal that names the handles open. */
export function mapOf(handle: string): MapSession {
  const s = open.get(handle);
  if (s) return s;
  if (making.has(handle)) refuse(`Map ${handle} is not ready yet: call wait with it`);
  const have = [...open.keys()];
  return refuse(`There is no open map "${handle}"${have.length ? `: the open maps are ${have.join(", ")}` : ": generate or open a map first"}`);
}

/** Forget every open map (the tests). */
export function closeAll(): void {
  open.clear();
  making.clear();
  nextHandle = 1;
}

// ------------------------------------------------------------------------------------------------ generate

export interface GenerateInput {
  theme?: string;
  size?: number | string | { x: number; y: number };
  seed?: number | string;
  designedFor?: string;
  settings?: Record<string, unknown>;
  intentions?: string[];
}

export interface Generated {
  handle: string;
  session: MapSession;
  /** The intentions the map was steered toward, and whether each emerged (D138, D139: said honestly). */
  intentions: { id: string; ok: boolean; note: string }[];
  ms: number;
}

/** What a finished job keeps of its map: the handle, the intentions and the time, never the session. The session
 *  lives in the open maps alone, so the bound on them (MOST_OPEN) is the bound on the maps held. */
export type Made = Omit<Generated, "session">;

const SIDE_MAX = 256;

function sizeOf(v: GenerateInput["size"]): { x: number; y: number } {
  if (v === undefined) return { x: 128, y: 128 };
  if (typeof v === "string") {
    if (v in SIZE_PRESETS) return { x: SIZE_PRESETS[v as SizePreset], y: SIZE_PRESETS[v as SizePreset] };
    const m = /^(\d+)\s*[x×]\s*(\d+)$/.exec(v.trim());
    if (m) return { x: Number(m[1]), y: Number(m[2]) };
    if (/^\d+$/.test(v.trim())) return { x: Number(v), y: Number(v) };
    return refuse(`A size is a number of tiles a side, "width x height", or one of ${Object.keys(SIZE_PRESETS).join(", ")}`);
  }
  if (typeof v === "number") return { x: v, y: v };
  return { x: v.x, y: v.y };
}

/** The spec that a generate call asks for, as the page's Generate makes it (src/ui/App.tsx), or the refusal of its
 *  input. `seedWord`: a seed given in words, which names the file. */
export function specOf(input: GenerateInput): { spec: MapSpec; seedWord?: string } {
  const theme = (input.theme ?? "any") as ThemeId;
  if (!THEMES.includes(theme)) refuse(`The theme is one of ${THEMES.join(", ")}`);
  const size = sizeOf(input.size);
  if (!Number.isInteger(size.x) || !Number.isInteger(size.y) || size.x < 1 || size.y < 1 || size.x > SIDE_MAX || size.y > SIDE_MAX) refuse(`A side is a whole number of tiles up to ${SIDE_MAX}`);
  const small = generatorSizeRefusal(size.x, size.y, theme);
  if (small) refuse(small);
  const designedFor = (input.designedFor ?? "normal") as Difficulty;
  if (!["easy", "normal", "hard"].includes(designedFor)) refuse("designedFor is easy, normal or hard");
  // (a seed in words is the page's seed box: its number, and the word names the file)
  let seed: number;
  let seedWord: string | undefined;
  if (input.seed === undefined) seed = randomBytes(4).readUInt32LE(0);
  else if (typeof input.seed === "number") {
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) refuse("A seed is a whole number from 0 to 4294967295, or a word");
    seed = input.seed;
  } else {
    const word = input.seed.trim();
    if (!word) refuse("A seed is a whole number from 0 to 4294967295, or a word");
    seed = seedFromText(word);
    if (!/^\d+$/.test(word)) seedWord = word;
  }
  const spec = makeSpec({ seed, size, theme, designedFor });
  if (input.settings) {
    const patched = applyMergePatch(spec.settings, input.settings);
    // (the highest the land may rise follows Verticality unless it is given, as the page's row keeps them together)
    const t = (input.settings as { terrain?: Record<string, unknown> }).terrain;
    if (t && t.verticality !== undefined && t.highestTerrain === undefined && typeof patched.terrain?.verticality === "number") patched.terrain.highestTerrain = highestTerrainDefault(patched.terrain.verticality);
    spec.settings = patched;
  }
  if (input.intentions?.length) {
    for (const id of input.intentions) if (!(INTENTIONS as readonly string[]).includes(id)) refuse(`"${id}" is not an intention: they are ${INTENTIONS.join(", ")}`);
    spec.intentions = [...input.intentions];
  }
  const errors = validateSpec(spec);
  if (errors.length) refuse(`The settings are refused: ${errors[0].path ? `${errors[0].path} ` : ""}${errors[0].message}`);
  return { spec, seedWord };
}

/** Open a generated map to edit (src/worker/session.ts `refine`), under `handle` when one was reserved for it. A map
 *  that did not pass its checks is refused, as the page opens only a map that passed. */
export function openGenerated(r: GenerateResult, ms: number, seedWord?: string, handle?: string): Generated {
  if (!r.report.passed) {
    if (handle) releaseHandle(handle);
    const failed = r.report.checks.filter((c) => !c.ok && c.severity === "error").map((c) => c.message);
    refuse(`This map did not pass its checks${failed.length ? ` (${failed.slice(0, 3).join("; ")})` : ""}: try another seed or other settings`);
  }
  const session = MapSession.fromGenerated(r, r.file, seedWord);
  return { handle: keep(session, handle), session, intentions: r.intentions.map((x) => ({ id: x.id, ok: x.ok, note: x.note })), ms };
}

/** Generate a map on this thread and open it, as the page's Generate does (src/worker/api.ts `runGenerate`). The
 *  server's tools make their maps in a worker instead (jobs.ts), so that the server stays responsive. */
export function generateMap(input: GenerateInput): Generated {
  const { spec, seedWord } = specOf(input);
  const t0 = performance.now();
  const r = generate(spec);
  return openGenerated(r, Math.round(performance.now() - t0), seedWord);
}

// ---------------------------------------------------------------------------------------------------- open

/** Open a project file (.damgoodmaps.json) as the page's File > Open does (src/worker/session.ts `openProject`), or a
 *  .timber map as an import (`openTimber`). */
export function openMap(path: string): { handle: string; session: MapSession } {
  if (!existsSync(path)) refuse(`There is no file at ${path}`);
  const bytes = new Uint8Array(readFileSync(path));
  let s: MapSession;
  try {
    if (/\.timber$/i.test(path)) s = MapSession.importMap(bytes, basename(path));
    else {
      s = MapSession.open(decodeProject(bytes));
      // landforms drawn with the old tools become terrain, the land exactly as it was (D182)
      bakeLandforms(s);
    }
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  return { handle: keep(s), session: s };
}

// --------------------------------------------------------------------------------------------------- apply

/** What an operation changed on the map: its ground, objects and water. */
export interface Change {
  steps: string[];
  ground: { tiles: number; raised: number; lowered: number; most: number; area: { x0: number; y0: number; x1: number; y1: number } | null };
  objects: { added: Record<string, number>; removed: Record<string, number> };
  water: { wetBefore: number; wetAfter: number };
  /** Tiles a stroke kept from where it would have gone, to hold up rock or an object under a roof. */
  held: number;
  /** The map's new size, after a crop. */
  size?: { x: number; y: number };
}

interface Before {
  size: { x: number; y: number };
  heights: Uint8Array;
  ents: Map<string, string>;
  wet: number;
}

function wetTiles(s: MapSession): number {
  const w = s.built.water;
  let n = 0;
  for (let i = 0; i < w.length; i++) if (w[i] > 0.05) n++;
  return n;
}

function snapshot(s: MapSession): Before {
  return { size: { ...s.size }, heights: s.built.heights.slice(), ents: new Map(s.built.entities.map((e) => [e.id, e.template])), wet: wetTiles(s) };
}

function changeSince(s: MapSession, b: Before, steps: string[], held: number): Change {
  const h = s.built.heights;
  const W = s.size.x;
  let tiles = 0;
  let raised = 0;
  let lowered = 0;
  let most = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  if (h.length === b.heights.length) {
    for (let i = 0; i < h.length; i++) {
      const d = h[i] - b.heights[i];
      if (!d) continue;
      tiles++;
      if (d > 0) raised++;
      else lowered++;
      most = Math.max(most, Math.abs(d));
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const now = new Map(s.built.entities.map((e) => [e.id, e.template]));
  const added: Record<string, number> = {};
  const removed: Record<string, number> = {};
  for (const [id, t] of now) if (!b.ents.has(id)) added[t] = (added[t] ?? 0) + 1;
  for (const [id, t] of b.ents) if (!now.has(id)) removed[t] = (removed[t] ?? 0) + 1;
  return {
    steps,
    ground: { tiles, raised, lowered, most, area: tiles ? { x0, y0, x1, y1 } : null },
    objects: { added, removed },
    water: { wetBefore: b.wet, wetAfter: wetTiles(s) },
    held,
    ...(s.size.x !== b.size.x || s.size.y !== b.size.y ? { size: { ...s.size } } : {}),
  };
}

const FORCE_DEFAULTS: Record<string, Record<string, unknown>> = {
  carve: CARVE_DEFAULTS as unknown as Record<string, unknown>,
  craterize: CRATER_DEFAULTS as unknown as Record<string, unknown>,
  erupt: ERUPT_DEFAULTS as unknown as Record<string, unknown>,
  quake: QUAKE_DEFAULTS as unknown as Record<string, unknown>,
  glaciate: GLACIATE_DEFAULTS as unknown as Record<string, unknown>,
  rift: RIFT_DEFAULTS as unknown as Record<string, unknown>,
  deposit: DEPOSIT_DEFAULTS as unknown as Record<string, unknown>,
  erode: ERODE_DEFAULTS as unknown as Record<string, unknown>,
};

type Pair = [number, number];

/** A force as the editor's row starts it (src/editor/forces/useForceRun.tsx `startForce`): the verb, its settings over
 *  the row's defaults, where it acts, and the details its row leaves to nature (`natural`). */
function forceRequestOf(s: MapSession, p: Record<string, unknown>): ForceRequest {
  const verb = p.verb as string;
  if (!(verb in FORCE_DEFAULTS)) refuse(`A force's verb is one of ${Object.keys(FORCE_DEFAULTS).join(", ")}`);
  const where = (p.where ?? {}) as { origin?: Pair; end?: Pair; path?: Pair[]; side?: 1 | -1; source?: string };
  const given = (p.settings ?? {}) as Record<string, unknown>;
  const seed = typeof given.seed === "number" ? given.seed : (Math.imul(s.nextSeq + 1, 0x9e3779b1) >>> 0);
  // a Carve or a Craterize given an end is aimed, as a drag aims the editor's (CarveRow.tsx, ForceRows.tsx): a carve
  // aimed cuts through rises to get there (D289)
  const aimed = where.end && (verb === "carve" || verb === "craterize") ? { mode: "aim", ...(verb === "carve" ? { defyGravity: true } : {}) } : {};
  const settings = { ...FORCE_DEFAULTS[verb], ...aimed, ...given, seed };
  const path = where.path?.map(([x, y]) => ({ x, y }));
  const point = (k: "origin" | "end"): Pair | undefined => (where[k] ? [where[k]![0], where[k]![1]] : undefined);
  const base = { settings, cut: null, natural: true } as const;
  switch (verb) {
    case "carve":
    case "craterize":
    case "glaciate":
    case "erupt": {
      const origin = point("origin") ?? (path?.length ? ([path[0].x, path[0].y] as Pair) : undefined);
      if (!origin) refuse(`A ${verb === "craterize" ? "crater" : verb} needs where.origin, the tile [x, y] where it starts`);
      const end = point("end");
      if (verb === "erupt") return { verb, ...base, origin: origin!, ...(path && path.length > 1 ? { path } : {}) } as ForceRequest;
      return { verb, ...base, origin: origin!, ...(end ? { end } : {}), ...(verb === "carve" && where.source ? { source: where.source } : {}) } as ForceRequest;
    }
    case "quake":
      if (!path?.length) refuse("A quake needs where.path, the fault's tiles [[x, y], ...]");
      return { verb, ...base, path: path!, side: where.side ?? 1 } as ForceRequest;
    default: {
      const line = path?.length ? path : where.origin ? [{ x: where.origin[0], y: where.origin[1] }] : null;
      if (!line) refuse(`A ${verb} needs where.path (or where.origin), the tiles it acts on`);
      return { verb, ...base, path: line! } as ForceRequest;
    }
  }
}

/** The tiles of runs [y, x0, x1] on a map W wide. */
function runTiles(runs: readonly (readonly number[])[], W: number): number[] {
  const out: number[] = [];
  for (const [y, a, b] of runs) for (let x = a; x <= b; x++) out.push(y * W + x);
  return out;
}

/** One request, made into the step the page would take for it: its operations, or a force kept whole. */
function applyOne(s: MapSession, raw: unknown): { label: string; held: number } {
  if (!raw || typeof raw !== "object" || typeof (raw as { op?: unknown }).op !== "string") return refuse("Each operation is an object {op, params}");
  const { op, params = {}, label } = raw as { op: string; params?: Record<string, unknown>; label?: string };
  const p = params as Record<string, unknown>;
  const done = (r: { ok: boolean; errors: string[]; held?: number[] }, l: string) => {
    if (!r.ok) refuse(r.errors[0] ?? "The operation was refused");
    return { label: l, held: r.held?.length ?? 0 };
  };
  const lastLabel = () => s.history().filter((h) => h.applied).at(-1)?.label ?? op;
  switch (op) {
    case "forceResult": {
      // a force by its verb, settings and where: planned and kept as the editor keeps one (core/collab/forceStep.ts)
      if (p.tiles === undefined) {
        const request = forceRequestOf(s, p);
        const r = applyForce(s, { id: randomUUID(), request, ...(request.verb === "carve" ? { sourceId: randomUUID() } : {}) });
        if (!r.ok) refuse(r.reason);
        return { label: lastLabel(), held: 0 };
      }
      break;
    }
    case "fillHollow":
      if (p.lake === undefined) {
        const at = p.at as Pair | undefined;
        if (!Array.isArray(at) || typeof p.level !== "number") refuse("Fill needs at [x, y] and the level to fill to");
        const plan = planFill(s, at![0], at![1], p.level as number, (p.floor as number | undefined) ?? null);
        if (!plan.op) refuse(plan.reason ?? "There is nothing to fill there");
        return done(s.apply(plan.op!, "user", label), lastLabel());
      }
      break;
    case "removeUnfedWater":
      if (p.tiles === undefined) {
        const area = p.area as number[][] | undefined;
        const u = unfedWater(s, area ? runTiles(area, s.size.x) : null);
        if (!u.op) refuse("No unfed water stands there");
        return done(s.apply(u.op!, "user", label), lastLabel());
      }
      break;
    case "paintObjects": {
      // a stroke of objects is planned on the map as it stands, as the shelf's stroke is (core/doc/paint.ts)
      const plan = planPaintObjects(s, { ...(p as object), seed: typeof p.seed === "number" ? p.seed : s.nextSeq } as never);
      if (!plan.ok) refuse(plan.errors[0]);
      const ok = plan as { ops: EditOp[]; label: string };
      return done(s.applyBatch(ok.ops, "user", label ?? ok.label), label ?? ok.label);
    }
    case "placeEntity": {
      const id = typeof p.id === "string" ? p.id : randomUUID();
      // the start moves (or is placed) by its own rule (core/doc/tools.ts `planStart`)
      if (p.template === "StartingLocation") {
        const plan = planStart(s, p.x as number, p.y as number, p.orientation as never, () => id, p.z as number | undefined);
        if (!plan.ok) refuse(plan.errors[0]);
        const ok = plan as { ops: EditOp[]; label: string };
        return done(s.applyAll(ok.ops, "user", label ?? ok.label), label ?? ok.label);
      }
      const plan = planEntity(s, { template: p.template as string, x: p.x as number, y: p.y as number, orientation: (p.orientation as never) ?? "Cw0", ...(p.flipped ? { flipped: true } : {}), ...(p.z !== undefined ? { z: p.z as number } : {}), ...(p.components ? { components: p.components as Record<string, unknown> } : {}) }, id);
      if (!plan.ok) refuse(plan.errors[0]);
      // (the planner levels the footprint itself, a badwater source's spring pool included: the shelf's `applyTool`)
      const ok = plan as { ops: EditOp[]; label: string };
      return done(s.applyAll(ok.ops, "user", label ?? ok.label), label ?? ok.label);
    }
    case "moveEntity": {
      const e = s.built.entities.find((g) => g.id === p.id);
      if (e?.template === "StartingLocation") {
        const plan = planStart(s, p.x as number, p.y as number, p.orientation as never, () => randomUUID(), p.z as number | undefined);
        if (!plan.ok) refuse(plan.errors[0]);
        const ok = plan as { ops: EditOp[]; label: string };
        return done(s.applyAll(ok.ops, "user", label ?? ok.label), label ?? ok.label);
      }
      // a placed object moves as the page drags one, its ground levelled (`moveObjectBy`); a source moves as an operation
      // with its spring pool (src/editor/sources/useSourcePointer.ts), below
      if (e && isPickable(e.template) && p.orientation === undefined && typeof p.x === "number" && typeof p.y === "number") {
        const plan = planMoveEntity(s, e.id, (p.x as number) - e.x, (p.y as number) - e.y, p.z as number | undefined);
        if (!plan.ok) refuse(plan.errors[0]);
        const ok = plan as { ops: EditOp[]; label: string };
        return done(s.applyAll(ok.ops, "user", label ?? ok.label), label ?? ok.label);
      }
      break;
    }
  }
  const edit = { op, params } as EditOp;
  const ramped = newRampedStroke(edit);
  if (ramped) refuse(ramped);
  // one operation goes through `apply`, as the page's (src/worker/session.ts `apply`): a crop, and a stroke held whole,
  // are refused there and only there; a badwater source's move or placement with its spring pool is a group (`applyAll`)
  const ops = withSpringPools(s, [edit]);
  return done(ops.length === 1 ? s.apply(edit, "user", label) : s.applyAll(ops, "user", label), lastLabel());
}

/** Apply requests in order, each one undo step, as the page applies each gesture. All or nothing: a refusal takes back
 *  the steps this call made and answers the core's reason word for word. */
export function applyOps(s: MapSession, ops: unknown[]): Change {
  if (!Array.isArray(ops) || !ops.length) refuse("Give one or more operations");
  const before = snapshot(s);
  const depth = () => s.history().filter((h) => h.applied).length;
  const at = depth();
  const steps: string[] = [];
  let held = 0;
  try {
    for (const op of ops) {
      const r = applyOne(s, op);
      steps.push(r.label);
      held += r.held;
    }
  } catch (e) {
    while (depth() > at && s.undo()) {
      // (taken back to where the call found the map)
    }
    s.forgetRedo();
    throw e;
  }
  return changeSince(s, before, steps, held);
}

/** Undo the last step: its label, or the core's reason it can't (D455's save point). */
export function undoStep(s: MapSession): { undone: string } {
  const last = s.history().filter((h) => h.applied).at(-1);
  if (!last) refuse("There is nothing to undo");
  if (!s.undo()) refuse(s.undoStopped ?? "There is nothing to undo");
  return { undone: last!.label };
}

// --------------------------------------------------------------------------------------------------- checks

/** The water model an imported map settles on (src/worker/session.ts `importModel`): its export file's, or the map's
 *  as it was opened. */
function importModel(s: MapSession, opened = false): WaterModel {
  const w = (opened ? s.openedFile() : s.exportFile(s.built, { thumbnail: false })).world;
  const m = worldWaterModel(w);
  const kept = opened ? undefined : s.built.waterModel.retained;
  if (kept?.length) m.retained = kept;
  const drained = opened ? undefined : s.built.waterModel.drained;
  if (drained?.length) m.drained = drained;
  return m;
}

function settled(model: WaterModel): CanonicalWater {
  const run = canonicalRun(model, {});
  for (;;) {
    const w = run.advance(Infinity);
    if (w) return w;
  }
}

/** The export's checks, as the page's background check runs them before a save (src/worker/session.ts
 *  `backgroundCheck`): the water settled canonically, every check, an import's own problems apart. */
export function checksOf(s: MapSession): CheckGroups {
  if (s.replayPending) s.checkReplay();
  if (s.mode !== "import") return groupChecks(s, s.validate("export"), null);
  const model = importModel(s);
  const w = (model.stacked ? s.settledFor(model) : null) ?? settled(model);
  let before: Validation | null = null;
  if (!s.cropped) {
    if (s.editCount === 0 && !s.waterPending) {
      const v = s.validateOriginal({ model, settled: w });
      return groupChecks(s, v, v);
    }
    const om = importModel(s, true);
    before = s.validateOriginal({ model: om, settled: settled(om) });
  }
  return groupChecks(s, s.validate("export", { water: { model, settled: w } }), before);
}

/** A check's row in plain data: its words, where, and its one-click fix when it has one. */
export function rowOf(c: CheckItem): { id: string; message: string; where?: unknown; fix?: unknown[] } {
  const fix = c.fix?.length && JSON.stringify(c.fix).length <= 4000 ? c.fix : undefined;
  return { id: c.id, message: c.id === "start.count" && c.message === NO_START ? NO_START_REFUSAL : c.message, ...(c.where ? { where: c.where } : {}), ...(fix ? { fix } : {}) };
}

// ----------------------------------------------------------------------------------------------------- save

/** Where Timberborn reads custom maps (the page's `TIMBERBORN_MAPS_PATH`): the player's Documents\Timberborn\Maps.
 *  DGM_MAPS_FOLDER, set by the Claude Desktop extension's setting, wins. */
export function mapsFolder(): string {
  const set = process.env.DGM_MAPS_FOLDER?.trim();
  if (set) return set;
  return join(documentsFolder(), "Timberborn", "Maps");
}

let documents: string | null = null;

function documentsFolder(): string {
  if (documents) return documents;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ".";
  // (Windows moves Documents into OneDrive on many machines: the folder the game itself writes to is tried first)
  const tries = [join(home, "Documents"), ...(process.env.OneDrive ? [join(process.env.OneDrive, "Documents")] : []), join(home, "OneDrive", "Documents")];
  documents = tries.find((d) => existsSync(join(d, "Timberborn"))) ?? tries[0];
  return documents;
}

/** "dgm-river-valley-7" then "dgm-river-valley-7-2", "-3" and on (the page's `freeName`, D191, D345 B10): the first
 *  stem whose map and project file are both new in the folder. */
function freeStem(folder: string, stem: string): string {
  const taken = (st: string) => existsSync(join(folder, `${st}.timber`)) || existsSync(join(folder, `${st}.damgoodmaps.json`));
  if (!taken(stem)) return stem;
  for (let n = 2; ; n++) if (!taken(`${stem}-${n}`)) return `${stem}-${n}`;
}

export interface Saved {
  folder: string;
  timber: { path: string; bytes: number };
  project: { path: string; bytes: number };
  /** The warnings the save noted in the map's description, as the page's Save does. */
  noted: string[];
}

/** The two files the page saves for this map: the .timber as Save to Timberborn writes it (the warnings confirmed and
 *  noted, src/worker/session.ts `exportTimber`) and the project file as File > Save project writes it (`project`,
 *  gzip level 9). Refused while a check would stop the map loading. */
export function exportFiles(s: MapSession): { timber: Uint8Array; timberName: string; project: Uint8Array; projectName: string; noted: string[] } {
  const c = checksOf(s);
  if (c.blocking.length) refuse(`Not saved: ${rowOf(c.blocking[0]).message}`);
  const noted = c.warnings.filter((w) => !w.own).map((w) => w.message);
  const t = s.exportTimber({ warnings: noted });
  return { timber: t.bytes, timberName: t.fileName, project: s.project(9), projectName: documentFileName(s.document), noted };
}

/** Save the map and its project file side by side, never over another file. */
export function saveMap(s: MapSession, opts: { folder?: string; name?: string }): Saved {
  if (opts.name !== undefined) {
    const r = s.setName(opts.name);
    if (!r.ok) refuse((r as { reason: string }).reason);
  }
  const folder = opts.folder?.trim() || mapsFolder();
  if (!existsSync(folder)) {
    if (opts.folder?.trim()) refuse(`There is no folder at ${folder}`);
    // (Timberborn's own Maps folder may not exist until the game saves a map there: it is made, as the game would)
    if (!existsSync(join(folder, ".."))) refuse(`Timberborn's Maps folder was not found at ${folder}: give the folder to save in`);
    mkdirSync(folder);
  }
  const f = exportFiles(s);
  const stem = freeStem(folder, f.timberName.replace(/\.timber$/, ""));
  const timberPath = join(folder, `${stem}.timber`);
  const projectPath = join(folder, `${stem}.damgoodmaps.json`);
  writeFileSync(timberPath, f.timber, { flag: "wx" });
  writeFileSync(projectPath, f.project, { flag: "wx" });
  return { folder, timber: { path: timberPath, bytes: f.timber.length }, project: { path: projectPath, bytes: f.project.length }, noted: f.noted };
}
