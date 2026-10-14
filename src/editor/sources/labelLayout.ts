// Where the sources' labels stand on the screen: each at its source, nudged off the labels already placed and off
// the open panels, merged into a neighbour of its kind when there is no room, hidden when its source is under a
// panel. Plain numbers in, plain numbers out: the view measures the page and draws the result (D342). What the last
// frame did comes back in as input, so a label does not jump while the camera moves.

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
  /** The source feeding the water under the pointer, and the source the pointer is on (D249): their labels keep
   *  their place, never merge into another, and say their own number. */
  feeding: boolean;
  target: boolean;
  /** What this label did last frame (its `dx`, `dy` and `into`), kept while it is still clear. */
  prev?: { dx: number; dy: number; into: number | null } | null;
}

export interface LabelOut {
  id: number;
  /** The source's point, and how far the label was moved from it. */
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  /** Where the label's anchor is drawn: the source's point moved by the nudge. */
  x: number;
  y: number;
  count: number;
  strength: number;
  bad: boolean;
  words: string;
  /** The labels merged into this one (their ids), if any. */
  merged: number[];
  /** The label this one's words went into, if any (it is not drawn). */
  into: number | null;
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

/** The label's words: "0.37 water/s", for a group "2 sources, 0.74 water/s", for labels merged on the screen
 *  "5 sources nearby, 2.5 water/s". */
export function labelWords(count: number, strength: number, bad: boolean, nearby = false): string {
  return `${count > 1 ? `${count} sources${nearby ? " nearby" : ""}, ` : ""}${strength} ${bad ? "badwater" : "water"}/s`;
}

/** A label stands this much of its height above its anchor (the CSS's `translate(-50%, -120%)`). */
export const LIFT = 1.2;
/** The room kept between a label and anything else. */
export const GAP = 4;
/** A label moved off other labels goes at most this many label heights; further, it merges. */
const NUDGE = 1.5;
/** The farthest a label is moved from its source in all (clearing a panel may take it further than the labels do). */
const REACH = 160;
/** Labels merge only when their sources are this close on the screen. */
const NEARBY = 160;
/** Moves tried one after another when a label is in the way of something. */
const DEPTH = 4;

type Seg = [number, number, number, number];

/** Whether a line crosses a box. */
function crosses(s: Seg, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = s[2] - s[0];
  const dy = s[3] - s[1];
  for (const [p, q] of [
    [-dx, s[0] - r.x],
    [dx, r.x + r.w - s[0]],
    [-dy, s[1] - r.y],
    [dy, r.y + r.h - s[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 <= t1;
}

/** Whether two lines cross. */
function segs(a: Seg, b: Seg): boolean {
  const o = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => Math.sign((x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1));
  return o(a[0], a[1], a[2], a[3], b[0], b[1]) !== o(a[0], a[1], a[2], a[3], b[2], b[3]) && o(b[0], b[1], b[2], b[3], a[0], a[1]) !== o(b[0], b[1], b[2], b[3], a[2], a[3]);
}

const rounded = (n: number) => Math.round(n * 100) / 100;

function hits(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

interface Item extends LabelIn {
  /** Ids merged into this one. */
  members: number[];
  gone: boolean;
  into: number | null;
  /** Placed before the others of its kind (it had no room, and nothing to merge into). */
  boosted: boolean;
}

/** Whether two labels may speak as one: the same kind of water, neither the pointer's own, both feeding or neither. */
const mergeable = (a: Item, b: Item) => !a.target && !b.target && a.bad === b.bad && a.feeding === b.feeding;
const apart = (a: Item, b: Item) => Math.hypot(a.ax - b.ax, a.ay - b.ay);

function absorb(keep: Item, victim: Item, byId: Map<number, Item>) {
  keep.count += victim.count;
  keep.strength = rounded(keep.strength + victim.strength);
  for (const m of victim.members) {
    const o = byId.get(m);
    if (o) o.into = keep.id;
  }
  keep.members.push(victim.id, ...victim.members);
  victim.members = [];
  victim.gone = true;
  victim.into = keep.id;
}

/** Lay the labels out. The same input always gives the same output. */
export function layoutLabels(labels: readonly LabelIn[], env: LayoutEnv): LabelOut[] {
  // the merges of the last frame (who went into whom) stay while they still hold: the two are alike and near, and the
  // merged-in label's own spot is still blocked (a crowd that has cleared lets it go back to its own spot)
  const carried = new Map<number, number>();
  const first = new Map(labels.map((l) => [l.id, l]));
  for (const l of labels) {
    const keep = l.prev?.into != null ? first.get(l.prev.into) : undefined;
    if (keep && keep.id !== l.id && !l.target && !keep.target && l.bad === keep.bad && l.feeding === keep.feeding && Math.hypot(l.ax - keep.ax, l.ay - keep.ay) <= NEARBY) carried.set(l.id, keep.id);
  }
  for (;;) {
    const out = lay(labels, env, carried);
    // (a merge is let go once the label's own spot is clear by a little more than a label needs, so it does not flicker)
    let letGo = false;
    // (the label it went into counts at its own width, not the merged one, which is what it would go back to)
    const alone = (l: LabelIn) => env.width(labelWords(l.count, l.strength, l.bad), l.target || l.feeding);
    for (const [id, into] of carried) {
      const l = first.get(id)!;
      const w = alone(l);
      const own: Rect = { x: l.ax - w / 2, y: l.ay - env.height * LIFT, w, h: env.height };
      const others = out.filter((o) => !o.hidden).map((o) => {
        if (o.id !== into) return o.box;
        const k = first.get(into)!;
        const kw = alone(k);
        return { x: k.ax - kw / 2 + o.dx, y: k.ay - env.height * LIFT + o.dy, w: kw, h: env.height };
      });
      const clear = own.x >= 0 && own.y >= 0 && own.x + w <= env.bounds.w && own.y + own.h <= env.bounds.h && !env.obstacles.some((o) => hits(own, o, GAP + 6)) && !others.some((b) => hits(own, b, GAP + 6));
      if (clear) {
        carried.delete(id);
        letGo = true;
      }
    }
    if (!letGo) return out;
  }
}

function lay(labels: readonly LabelIn[], env: LayoutEnv, carried: Map<number, number>): LabelOut[] {
  const items: Item[] = labels.map((l) => ({ ...l, members: [], gone: false, into: null, boosted: false }));
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const it of items) {
    const keep = byId.get(carried.get(it.id) ?? NaN);
    if (keep && !keep.gone && !it.gone && it.members.length === 0) absorb(keep, it, byId);
  }
  const stuck = new Set<number>();
  // (each step merges a label or raises one once, so it ends)
  for (let guard = 0; guard < items.length * 3 + 3; guard++) {
    const { out, crowded } = place(items, env);
    const next = crowded.find((i) => !stuck.has(i));
    if (next === undefined) return out;
    const victim = items[next];
    // the nearest label of its kind takes it in
    let keep: Item | null = null;
    let best = Infinity;
    if (!victim.target)
      for (let k = 0; k < items.length; k++) {
        const o = items[k];
        if (o === victim || o.gone || out[k].hidden || !mergeable(o, victim)) continue;
        const d = apart(o, victim);
        if (d <= NEARBY && d < best) {
          best = d;
          keep = o;
        }
      }
    if (keep) absorb(keep, victim, byId);
    // no one to merge into: it is placed first next time, and what it displaces merges or moves
    else if (!victim.boosted) victim.boosted = true;
    else stuck.add(next);
  }
  return place(items, env).out;
}

function place(items: Item[], env: LayoutEnv): { out: LabelOut[]; crowded: number[] } {
  const { bounds, obstacles, height: h } = env;
  const view: Rect = { x: 0, y: 0, w: bounds.w, h: bounds.h };
  const rank = (it: Item) => (it.target ? 100 : 0) + (it.feeding ? 50 : 0) + (it.boosted ? 10 : 0);
  const order = items.map((_, i) => i).filter((i) => !items[i].gone).sort((a, b) => rank(items[b]) - rank(items[a]) || a - b);
  const placed: Rect[] = [];
  const out = new Map<number, LabelOut>();
  const crowded: number[] = [];
  /** The lines of the moved labels placed so far: from the source's point to the label. */
  const leaders: Seg[] = [];

  for (const i of order) {
    const it = items[i];
    const strong = it.target || it.feeding;
    const words = labelWords(it.count, it.strength, it.bad, it.members.length > 0);
    const w = env.width(words, strong);
    const natural: Rect = { x: it.ax - w / 2, y: it.ay - h * LIFT, w, h };
    const base: LabelOut = { id: it.id, ax: it.ax, ay: it.ay, dx: 0, dy: 0, x: it.ax, y: it.ay, count: it.count, strength: it.strength, bad: it.bad, words, merged: it.members, into: null, hidden: false, box: natural };
    // a source outside the view has no label; a plain one behind a panel has none either (the pointer's and the
    // feeding ones are moved clear of it instead)
    if (!inside(view, it.ax, it.ay) || (!strong && obstacles.some((o) => inside(o, it.ax, it.ay)))) {
      out.set(i, { ...base, hidden: true });
      continue;
    }
    const at = (dx: number, dy: number): Rect => ({ x: natural.x + dx, y: natural.y + dy, w, h });
    type Block = { kind: "edge"; dx: number; dy: number } | { kind: "panel" | "label"; r: Rect };
    // the first thing a box is in the way of: the view's edge (as the move that brings it in), a panel or a label
    const blocker = (b: Rect, gap = GAP): Block | null => {
      const dx = b.x < view.x ? view.x - b.x : b.x + b.w > view.w ? view.w - (b.x + b.w) : 0;
      const dy = b.y < view.y ? view.y - b.y : b.y + b.h > view.h ? view.h - (b.y + b.h) : 0;
      if (dx || dy) return { kind: "edge", dx, dy };
      for (const o of obstacles) if (hits(b, o, gap)) return { kind: "panel", r: o };
      for (const p of placed) if (hits(b, p, gap)) return { kind: "label", r: p };
      return null;
    };
    // a spot is fit when its box (and the line to its source, if it is moved off it) is clear of the other labels and
    // their lines, and no other label's source lies under it or this one's under another label
    const fit = (dx: number, dy: number): boolean => {
      const b = at(dx, dy);
      const line: Seg | null = Math.hypot(dx, dy) > h ? [it.ax, it.ay, Math.max(b.x, Math.min(it.ax, b.x + b.w)), Math.max(b.y, Math.min(it.ay, b.y + b.h))] : null;
      if (leaders.some((l) => inside(b, l[0], l[1]) || crosses(l, b))) return false;
      if (line && placed.some((q) => inside(q, line[0], line[1]) || crosses(line, q))) return false;
      return !line || !leaders.some((l) => segs(line, l));
    };
    // where it stood last frame, if that is still clear
    // (its own spot first, a moved label returning to it only once it is clear by a little more than it needs; else
    // where it stood last frame while that is still fit; else the nearest fit spot)
    let found: { dx: number; dy: number } | null = null;
    const p = it.prev;
    const moved = !!p && (p.dx !== 0 || p.dy !== 0);
    if (!blocker(natural, moved ? GAP + 6 : GAP) && fit(0, 0)) found = { dx: 0, dy: 0 };
    else if (p && moved && Math.hypot(p.dx, p.dy) <= REACH && !blocker(at(p.dx, p.dy)) && fit(p.dx, p.dy)) found = { dx: p.dx, dy: p.dy };
    // else the nearest free spot: from where the label stands, each move that clears what is in its way, a few deep,
    // the moves off other labels adding up to a label height or two at most
    if (!found) {
      let nearest = Infinity;
      const seen = new Set<string>();
      const search = (dx: number, dy: number, depth: number, off: number) => {
        const key = `${Math.round(dx)},${Math.round(dy)}`;
        if (seen.has(key) || Math.hypot(dx, dy) > REACH) return;
        seen.add(key);
        const b = at(dx, dy);
        const hit = blocker(b);
        if (!hit) {
          const d = Math.hypot(dx, dy);
          if (d < nearest && fit(dx, dy)) {
            nearest = d;
            found = { dx, dy };
          }
          return;
        }
        if (depth === 0) return;
        if (hit.kind === "edge") return search(dx + hit.dx, dy + hit.dy, depth - 1, off);
        const r = hit.r;
        const label = hit.kind === "label";
        const go = (mx: number, my: number) => {
          const used = label ? off + Math.abs(mx + my) : off;
          if (used <= NUDGE * h) search(dx + mx, dy + my, depth - 1, used);
        };
        go(0, -(b.y + b.h - r.y + GAP));
        go(0, r.y + r.h - b.y + GAP);
        go(-(b.x + b.w - r.x + GAP), 0);
        go(r.x + r.w - b.x + GAP, 0);
      };
      search(0, 0, DEPTH, 0);
    }
    const f = found as { dx: number; dy: number } | null;
    if (!f) {
      crowded.push(i);
      // (left where it is for now: the caller merges it into a neighbour, or places it first)
      placed.push(natural);
      out.set(i, base);
      continue;
    }
    const box = at(f.dx, f.dy);
    placed.push(box);
    if (Math.hypot(f.dx, f.dy) > h) leaders.push([it.ax, it.ay, Math.max(box.x, Math.min(it.ax, box.x + box.w)), Math.max(box.y, Math.min(it.ay, box.y + box.h))]);
    out.set(i, { ...base, dx: f.dx, dy: f.dy, x: it.ax + f.dx, y: it.ay + f.dy, box });
  }
  // the absorbed labels are drawn nowhere
  const all: LabelOut[] = items.map(
    (it, i) => out.get(i) ?? { id: it.id, ax: it.ax, ay: it.ay, dx: 0, dy: 0, x: it.ax, y: it.ay, count: it.count, strength: it.strength, bad: it.bad, words: "", merged: [], into: it.into, hidden: true, box: { x: 0, y: 0, w: 0, h: 0 } },
  );
  return { out: all, crowded };
}
