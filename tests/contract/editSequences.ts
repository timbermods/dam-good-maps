// Only the player places objects (PLAN §20 D368 (10), D404): no edit, and no sequence of edits, ever
// adds an object. The sweep behind tests/contract/editSequences.test.ts (a handful of sequences, every
// run) and tests/contract/editSequences.heavy.test.ts (every theme, several seeds, 96² and 128²,
// nightly): every brush and every force, in sequences of two or three edits at places drawn from a
// fixed seed, each edit kept as the page keeps it, on a generated map opened in the editor's own
// worker session (D342). After each edit the document is reopened from its project (the map the file
// holds, its water settled) and its objects compared by id with the map before the edit: any id that
// was not there is a failure, named with its map, its sequence and its step. A tree turning dead or
// alive with its ground (D404) keeps its id and is not an addition; the water a force makes, by design,
// comes with its own sources (Carve's river, D314; Glaciate's meltwater, D246), which are allowed.

import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { EditOp } from "../../src/core/doc/ops";
import type { BrushTool } from "../../src/core/features/raster/brush";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { rng } from "./forceEverywhere";

export type Edit =
  | "raise"
  | "lower"
  | "flatten"
  | "smooth"
  | "naturalize"
  | "carve"
  | "carve, keep river"
  | "craterize"
  | "erupt"
  | "quake lift"
  | "quake slide"
  | "glaciate"
  | "glaciate, meltwater";
export const BRUSHES: readonly Edit[] = ["raise", "lower", "flatten", "smooth", "naturalize"];
export const FORCES: readonly Edit[] = ["carve", "carve, keep river", "craterize", "erupt", "quake lift", "quake slide", "glaciate", "glaciate, meltwater"];
export const EDITS: readonly Edit[] = [...BRUSHES, ...FORCES];

/** The objects the document holds now: reopened from its project, as the file has them. */
const objects = () => MapSession.open(decodeProject(ed.project().bytes)).built.entities;

/** A wide wandering stroke round (x, y), as a player paints: big, strong, three passes. */
function stroke(tool: BrushTool, x: number, y: number, W: number, next: () => number): EditOp {
  const dabs: number[] = [];
  const level = 2 + Math.floor(next() * 12);
  const c = (v: number) => Math.max(0, Math.min(W - 1, v));
  for (let rep = 0; rep < 3; rep++) for (let k = 0; k < 40; k++) dabs.push(Math.round(c(x - 12 + k * 0.6) * 4), Math.round(c(y + 4 * Math.sin(k / 5)) * 4));
  return { op: "brush", params: { tool, size: 6 + Math.floor(next() * 10), strength: 10, ...(tool === "flatten" ? { level } : {}), ...(tool === "naturalize" ? { seed: Math.floor(next() * 1e6) } : {}), dabs } };
}

/** The request the page sends for a force at (x, y): its row's settings at a Power, nature drawing the
 *  rest; Quake on a fault 40 tiles long through the place. */
function force(edit: Edit, x: number, y: number, W: number, next: () => number): ed.ForceRequest {
  const power = 30 + Math.floor(next() * 60);
  const origin: [number, number] = [x, y];
  const base = { cut: null, natural: true } as const;
  if (edit === "carve" || edit === "carve, keep river") return { verb: "carve", settings: { ...CARVE_DEFAULTS, power, dry: edit === "carve" }, origin, ...base };
  if (edit === "craterize") return { verb: "craterize", settings: { ...CRATER_DEFAULTS, power }, origin, ...base };
  if (edit === "erupt") return { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power }, origin, ...base };
  if (edit === "glaciate" || edit === "glaciate, meltwater") return { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power, meltwater: edit !== "glaciate" }, origin, ...base };
  const a = next() * Math.PI;
  const c = (v: number) => Math.max(0, Math.min(W - 1, v));
  const path = [-20, 0, 20].map((d) => ({ x: c(x + d * Math.cos(a)), y: c(y + d * Math.sin(a)) }));
  return { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: edit === "quake lift" ? "lift" : "slide", power }, path, side: next() < 0.5 ? 1 : -1, ...base };
}

/** Apply one edit to its end and keep it, as the page does; why it was refused, or null. */
export function applyEdit(edit: Edit, x: number, y: number, W: number, next: () => number): string | null {
  if (BRUSHES.includes(edit)) {
    const r = ed.apply(stroke(edit as BrushTool, x, y, W, next), "user", edit);
    return r.errors.length ? r.errors.join("; ") : null;
  }
  const started = ed.forceStart(force(edit, x, y, W, next));
  if (started.errors.length) return started.errors.join("; ");
  for (let k = 0; k < 20000; k++) if (ed.forceAdvance(8)?.done ?? true) break;
  const kept = ed.forceStop();
  if (kept.errors.length) return kept.errors.join("; ");
  return kept.kept ? null : "not kept";
}

/** What a step may add by design: the sources of the water a force makes (D314, D246). */
const allowed = (edit: Edit, template: string) => (edit === "carve, keep river" || edit === "glaciate, meltwater") && template === "WaterSource";

export interface Step {
  edit: Edit;
  at: [number, number];
}

/** `n` sequences of two or three edits drawn from `edits`, each at a place on the map. */
export function sequences(n: number, W: number, seed: number, edits: readonly Edit[] = EDITS): Step[][] {
  const next = rng(seed * 104729 + W);
  const out: Step[][] = [];
  for (let k = 0; k < n; k++) {
    const len = 2 + Math.floor(next() * 2);
    const seq: Step[] = [];
    // (the edits of a sequence overlap: each near the one before, where one edit's change meets the next)
    let x = 12 + Math.floor(next() * (W - 24));
    let y = 12 + Math.floor(next() * (W - 24));
    for (let j = 0; j < len; j++) {
      seq.push({ edit: edits[Math.floor(next() * edits.length)], at: [x, y] });
      x = Math.max(8, Math.min(W - 9, x + Math.floor(next() * 21) - 10));
      y = Math.max(8, Math.min(W - 9, y + Math.floor(next() * 21) - 10));
    }
    out.push(seq);
  }
  return out;
}

export const describeSequence = (seq: readonly Step[]) => seq.map((s) => `${s.edit} at (${s.at[0]}, ${s.at[1]})`).join(", then ");

/**
 * Open the map, run each sequence on it (then undo it, back to the generated map), and return one
 * line for every step that added an object: the map, the sequence, the step and what it added.
 */
export async function sweepSequences(theme: ThemeId, size: number, seed: number, seqs: readonly (readonly Step[])[]): Promise<string[]> {
  await runGenerate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  ed.setEditorWaterMode("defer");
  ed.refine();
  const failures: string[] = [];
  const next = rng(seed * 31 + size);
  for (const seq of seqs) {
    let before = objects();
    let done = 0;
    for (const [k, step] of seq.entries()) {
      const refused = applyEdit(step.edit, step.at[0], step.at[1], size, next);
      if (refused) continue;
      done++;
      const now = objects();
      const had = new Set(before.map((e) => e.id));
      const added = now.filter((e) => !had.has(e.id) && !allowed(step.edit, e.template));
      if (added.length)
        failures.push(`${theme} ${size}² seed ${seed}: ${describeSequence(seq)}: step ${k + 1} (${step.edit}) added ${added.length}: ${added.slice(0, 6).map((e) => `${e.template}@${e.x},${e.y}`).join(" ")}${added.length > 6 ? " ..." : ""}`);
      before = now;
    }
    for (let k = 0; k < done; k++) ed.undo();
  }
  return failures;
}
