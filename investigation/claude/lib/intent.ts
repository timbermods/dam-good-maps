// Intent checks (EDITOR_PLAN §7): the measurable expectations behind a request, checked on the
// combined preview after every step of a proposal has been applied, never step by step.
//
//   {goal: "g2", subject: "dam-1", metric: "reservoir.volume", min: 1518}
//   {goal: "g1", subject: "waterfall-1", metric: "lipWidth", approx: 20, tol: 3}
//   {goal: "g1", subject: "waterfall-1", metric: "at", in: "north third"}
//   {goal: "g3", subject: "badwater-1", metric: "outlet.frac", min: {of: "dam-1", metric: "course.frac"}}
//   {goal: "g0", subject: "map", metric: "badwaterRatio", change: "up"}
//
// The subject is "map", "start", a handle Claude gave a feature, or a feature id. A metric is a map
// metric (metrics.ts MAP_METRICS) for "map", else a key path into the feature's measure. A bound
// may be a number or another subject's measure. `in` takes a place in words or as a Place.

import type { MapSession } from "../../../src/core/doc/session";
import type { Conversation } from "./conversation";
import { refContext } from "./conversation";
import { MAP_METRICS, measureFeature, measureSource, SOURCE_PREFIX, type Measured } from "./metrics";
import { resolveRef, within, type Place } from "./places";
import { viewOf } from "./view";

export type Bound = number | { of: string; metric: string; plus?: number };

export interface Expectation {
  goal?: string;
  subject: string;
  metric: string;
  approx?: number;
  tol?: number;
  min?: Bound;
  max?: Bound;
  equals?: string | number | boolean;
  in?: Place | string;
  change?: "up" | "down" | "same";
}

export interface Checked extends Expectation {
  actual: unknown;
  pass: boolean;
  why?: string;
}

function path(o: unknown, key: string): unknown {
  let cur: unknown = o;
  for (const k of key.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** The features a proposal made, for "new:<kind>" subjects (the first of that kind), so a check
 *  does not depend on the handle Claude chose. */
let madeNow: { handle: string; id: string; kind: string }[] = [];

function subjectValue(s: MapSession, conv: Conversation, after: Measured, subject: string, metric: string): { value: unknown; error?: string; at?: [number, number] } {
  if (subject.startsWith("new:")) {
    const kind = subject.slice(4);
    const m = madeNow.find((x) => x.kind === kind);
    if (!m) return { value: undefined, error: `the proposal made no ${kind}` };
    subject = m.id;
  }
  // a source a step placed (an entity, not a feature): by its id, or by the handle it was given
  const sourceId = subject.startsWith(SOURCE_PREFIX) ? subject : conv.handles[subject]?.startsWith(SOURCE_PREFIX) ? conv.handles[subject] : null;
  if (sourceId) {
    const m = measureSource(s, sourceId);
    if (!m) return { value: undefined, error: `${subject} no longer exists` };
    if (metric === "exists") return { value: true };
    if (metric.startsWith("distanceTo:")) {
      const other = resolveRef(viewOf(s), metric.slice(11), refContext(conv));
      if (typeof other === "string") return { value: undefined, error: other };
      let best = Infinity;
      if (other.mask) {
        for (let i = 0; i < other.mask.length; i++) if (other.mask[i]) best = Math.min(best, Math.hypot((i % s.size.x) - m.at[0], Math.floor(i / s.size.x) - m.at[1]));
      } else best = Math.hypot(other.anchor[0] - m.at[0], other.anchor[1] - m.at[1]);
      return { value: Math.round(best * 10) / 10, at: m.at };
    }
    return { value: metric === "at" ? m.at : path(m, metric), at: m.at };
  }
  if (subject === "map") {
    const d = MAP_METRICS[metric];
    if (!d) return { value: undefined, error: `no map metric ${metric} (${Object.keys(MAP_METRICS).join(", ")})` };
    return { value: Math.round(d.get(after.map, after) * 100) / 100 };
  }
  const v = viewOf(s);
  const t = resolveRef(v, subject, refContext(conv));
  if (metric === "exists") return { value: typeof t !== "string" && (!t.id || s.features.some((g) => g.id === t.id)) };
  if (typeof t === "string") return { value: undefined, error: t };
  const f = t.id ? s.features.find((g) => g.id === t.id) : undefined;
  let at: [number, number];
  let m: Record<string, unknown> = {};
  if (!f) {
    if (subject === "start" && v.start) at = [v.start.x, v.start.y];
    else return { value: undefined, error: `${subject} is not a feature` };
  } else {
    const fm = measureFeature(s, f);
    at = fm.at;
    m = fm;
  }
  if (metric.startsWith("distanceTo:")) {
    // the straight distance from this feature's anchor to the nearest tile of another thing
    const other = resolveRef(v, metric.slice(11), refContext(conv));
    if (typeof other === "string") return { value: undefined, error: other };
    let best = Infinity;
    if (other.mask) {
      for (let i = 0; i < other.mask.length; i++) if (other.mask[i]) best = Math.min(best, Math.hypot((i % v.W) - at[0], Math.floor(i / v.W) - at[1]));
    } else best = Math.hypot(other.anchor[0] - at[0], other.anchor[1] - at[1]);
    return { value: Math.round(best * 10) / 10, at };
  }
  const value = metric === "at" ? at : path(m, metric);
  return { value, at };
}

/** Values of the non-map subjects that `change` expectations compare against, taken before the
 *  proposal is applied. */
export function valuesBefore(s: MapSession, conv: Conversation, before: Measured, list: readonly Expectation[]): Map<number, number> {
  const out = new Map<number, number>();
  list.forEach((e, k) => {
    if (!e.change || e.subject === "map" || e.subject.startsWith("new:")) return;
    const r = subjectValue(s, conv, before, e.subject, e.metric);
    if (typeof r.value === "number") out.set(k, r.value);
  });
  return out;
}

function boundValue(s: MapSession, conv: Conversation, after: Measured, b: Bound | undefined): number | undefined {
  if (b === undefined) return undefined;
  if (typeof b === "number") return b;
  const r = subjectValue(s, conv, after, b.of, b.metric);
  return typeof r.value === "number" ? r.value + (b.plus ?? 0) : NaN;
}

/** Check every expectation on the map as it stands (the combined preview). */
export function checkExpectations(s: MapSession, conv: Conversation, before: Measured, after: Measured, list: readonly Expectation[], made: { handle: string; id: string; kind: string }[] = [], was: Map<number, number> = new Map()): Checked[] {
  madeNow = made;
  return list.map((e, k) => {
    const r = subjectValue(s, conv, after, e.subject, e.metric);
    if (r.error) return { ...e, actual: null, pass: false, why: r.error };
    const out: Checked = { ...e, actual: r.value, pass: true };
    const fails: string[] = [];
    if (e.in !== undefined) {
      const at = Array.isArray(r.value) && r.value.length === 2 ? (r.value as [number, number]) : r.at;
      if (!at) fails.push("it has no position");
      else {
        const w = within(viewOf(s), e.in, at[0], at[1], refContext(conv));
        if (!w.reading.ok) fails.push(`the place could not be read: ${w.reading.errors.join("; ")}`);
        else if (!w.inside) fails.push(`it is at (${at[0]}, ${at[1]}), outside ${typeof e.in === "string" ? e.in : "the place"}`);
      }
    }
    if (e.equals !== undefined && r.value !== e.equals) fails.push(`it is ${JSON.stringify(r.value)}, not ${JSON.stringify(e.equals)}`);
    const x = typeof r.value === "number" ? r.value : NaN;
    if (e.approx !== undefined && !(Math.abs(x - e.approx) <= (e.tol ?? 0))) fails.push(`it is ${r.value}, not ${e.approx} ±${e.tol ?? 0}`);
    const lo = boundValue(s, conv, after, e.min);
    const hi = boundValue(s, conv, after, e.max);
    if (lo !== undefined && !(x >= lo)) fails.push(`it is ${r.value}, under ${Math.round(lo * 100) / 100}`);
    if (hi !== undefined && !(x <= hi)) fails.push(`it is ${r.value}, over ${Math.round(hi * 100) / 100}`);
    if (e.change) {
      const b = e.subject === "map" ? (MAP_METRICS[e.metric] ? Math.round(MAP_METRICS[e.metric].get(before.map, before) * 100) / 100 : NaN) : (was.get(k) ?? NaN);
      if (!Number.isFinite(b)) fails.push("there is no value from before to compare with");
      else {
        const moved = e.change === "up" ? x > b : e.change === "down" ? x < b : Math.abs(x - b) <= Math.max(0.01, Math.abs(b) * 0.02);
        if (!moved) fails.push(`it went from ${b} to ${x}, not ${e.change}`);
        out.actual = { before: b, after: x };
      }
    }
    if (fails.length) {
      out.pass = false;
      out.why = fails.join("; ");
    }
    return out;
  });
}
