// Where the sources' labels stand on the screen: each at its source, nudged off the labels already placed and off
// the open panels, merged into a neighbour of its kind when there is no room, hidden when its source is under a
// panel. Plain numbers in, plain numbers out: the view measures the page and draws the result (D342).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One label as the view asks for it. `ax`, `ay` are the source's point in the view's pixels; the label stands
 *  centred over it, a fifth of its height clear (`LIFT`, as the CSS has it). */
export interface LabelIn {
  id: number;
  ax: number;
  ay: number;
  /** How many sources the label speaks for, and their strength together. */
  count: number;
  strength: number;
  bad: boolean;
  /** Placed first, so the label of the source the pointer is on keeps its place. */
  priority: number;
}

export interface LabelOut {
  id: number;
  /** Where the label's anchor is drawn, in the view's pixels: the source's point moved by the nudge. */
  x: number;
  y: number;
  count: number;
  strength: number;
  bad: boolean;
  words: string;
  /** The labels merged into this one (their ids), if any. */
  merged: number[];
  /** Not drawn: its source is behind a panel or outside the view, or its words went into another label. */
  hidden: boolean;
  /** The label's box as drawn. */
  box: Rect;
}

export interface LayoutEnv {
  /** The view's size. */
  bounds: { w: number; h: number };
  /** What the labels keep clear of: the panels and controls drawn over the map. */
  obstacles: Rect[];
  /** The width of a label's words, and its height. */
  width(words: string, strong: boolean): number;
  height: number;
}

/** The label's words: "0.37 water/s", or for a group "2 sources, 0.74 water/s". */
export function labelWords(count: number, strength: number, bad: boolean): string {
  return `${count > 1 ? `${count} sources, ` : ""}${strength} ${bad ? "badwater" : "water"}/s`;
}

/** A label stands this much of its height above its anchor (the CSS's `translate(-50%, -120%)`). */
export const LIFT = 1.2;
/** The room kept between a label and anything else. */
export const GAP = 4;
/** The farthest a label is moved from its source. */
const REACH = 140;
/** Moves tried one after another when a label is in the way of something. */
const DEPTH = 4;

const rounded = (n: number) => Math.round(n * 100) / 100;

function hits(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

interface Item extends LabelIn {
  /** Ids merged into this one. */
  merged: number[];
  gone: boolean;
}

/** Lay the labels out. The same input always gives the same output. */
export function layoutLabels(labels: readonly LabelIn[], env: LayoutEnv): LabelOut[] {
  const items: Item[] = labels.map((l) => ({ ...l, merged: [], gone: false }));
  // (a merge widens a label, so the placing starts again; each merge removes a label, so it ends)
  for (let guard = 0; guard <= items.length; guard++) {
    const { out, crowded } = place(items, env);
    if (!crowded) return out;
    const victim = items[crowded.index];
    // the nearest label of its kind takes it in
    let keep: Item | null = null;
    let best = Infinity;
    for (let k = 0; k < items.length; k++) {
      const o = items[k];
      if (o === victim || o.gone || o.bad !== victim.bad || out[k].hidden) continue;
      const d = Math.hypot(o.ax - victim.ax, o.ay - victim.ay);
      if (d < best) {
        best = d;
        keep = o;
      }
    }
    if (!keep) return out;
    keep.count += victim.count;
    keep.strength = rounded(keep.strength + victim.strength);
    keep.merged.push(victim.id, ...victim.merged);
    keep.priority = Math.max(keep.priority, victim.priority);
    victim.gone = true;
  }
  return place(items, env).out;
}

function place(items: Item[], env: LayoutEnv): { out: LabelOut[]; crowded: { index: number } | null } {
  const { bounds, obstacles, height: h } = env;
  const view: Rect = { x: 0, y: 0, w: bounds.w, h: bounds.h };
  const order = items.map((_, i) => i).filter((i) => !items[i].gone).sort((a, b) => items[b].priority - items[a].priority || a - b);
  const placed: Rect[] = [];
  const out = new Map<number, LabelOut>();
  let crowded: { index: number } | null = null;

  for (const i of order) {
    const it = items[i];
    const words = labelWords(it.count, it.strength, it.bad);
    const w = env.width(words, it.priority > 0);
    const natural: Rect = { x: it.ax - w / 2, y: it.ay - h * LIFT, w, h };
    const base: LabelOut = { id: it.id, x: it.ax, y: it.ay, count: it.count, strength: it.strength, bad: it.bad, words, merged: it.merged, hidden: false, box: natural };
    // a source outside the view or behind a panel has no label
    if (!inside(view, it.ax, it.ay) || obstacles.some((o) => inside(o, it.ax, it.ay))) {
      out.set(i, { ...base, hidden: true });
      continue;
    }
    const at = (dx: number, dy: number): Rect => ({ x: natural.x + dx, y: natural.y + dy, w, h });
    // the first thing a box is in the way of: the view's edge (as the move that brings it in), a panel or a label
    const blocker = (b: Rect): { kind: "edge"; dx: number; dy: number } | { kind: "box"; r: Rect } | null => {
      const dx = b.x < view.x ? view.x - b.x : b.x + b.w > view.w ? view.w - (b.x + b.w) : 0;
      const dy = b.y < view.y ? view.y - b.y : b.y + b.h > view.h ? view.h - (b.y + b.h) : 0;
      if (dx || dy) return { kind: "edge", dx, dy };
      for (const o of obstacles) if (hits(b, o, GAP)) return { kind: "box", r: o };
      for (const p of placed) if (hits(b, p, GAP)) return { kind: "box", r: p };
      return null;
    };
    // the nearest free spot: from where the label stands, each move that clears what is in its way, a few deep
    let found: { dx: number; dy: number } | null = null;
    let nearest = Infinity;
    const seen = new Set<string>();
    const search = (dx: number, dy: number, depth: number) => {
      const key = `${Math.round(dx)},${Math.round(dy)}`;
      if (seen.has(key) || Math.hypot(dx, dy) > REACH) return;
      seen.add(key);
      const b = at(dx, dy);
      const hit = blocker(b);
      if (!hit) {
        const d = Math.hypot(dx, dy);
        if (d < nearest) {
          nearest = d;
          found = { dx, dy };
        }
        return;
      }
      if (depth === 0) return;
      if (hit.kind === "edge") return search(dx + hit.dx, dy + hit.dy, depth - 1);
      const r = hit.r;
      search(dx, dy - (b.y + b.h - r.y + GAP), depth - 1);
      search(dx, dy + (r.y + r.h - b.y + GAP), depth - 1);
      search(dx - (b.x + b.w - r.x + GAP), dy, depth - 1);
      search(dx + (r.x + r.w - b.x + GAP), dy, depth - 1);
    };
    search(0, 0, DEPTH);
    const f = found as { dx: number; dy: number } | null;
    if (!f) {
      crowded ??= { index: i };
      // (left where it is for now: the caller merges it into a neighbour, or leaves it)
      placed.push(natural);
      out.set(i, base);
      continue;
    }
    const box = at(f.dx, f.dy);
    placed.push(box);
    out.set(i, { ...base, x: it.ax + f.dx, y: it.ay + f.dy, box });
  }
  // the absorbed labels are drawn nowhere
  const all: LabelOut[] = [];
  items.forEach((it, i) => {
    const o = out.get(i);
    if (o) all.push(o);
    else if (it.gone) all.push({ id: it.id, x: it.ax, y: it.ay, count: it.count, strength: it.strength, bad: it.bad, words: "", merged: [], hidden: true, box: { x: 0, y: 0, w: 0, h: 0 } });
  });
  return { out: all, crowded };
}
