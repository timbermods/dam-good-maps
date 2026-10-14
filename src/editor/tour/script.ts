// The 20-second tour's choreography (D377): stored gestures, replayed through the conductor's hands, so every
// step goes through the editor's own input paths. Two forces only (Carve, a river grown with F and the mouse;
// Craterize, a crater whose Power is scrolled up with F), then the brushes' flow: Raise a hill and size it
// with F, Shift+click to lower, Ctrl+click the hilltop to take its level and Flatten a spot to it, Smooth the
// edges, then Save to Timberborn (shown, never done). The keys are shown as they are pressed.

import type { Conductor, Pt } from "./conductor";
import type { Says } from "./TourPill";
import type { BrushSpots, ForceSpots, Tile } from "./spots";

export type { Says };

/** What the script needs of the page. */
export interface Stage {
  hands: Conductor;
  forces: ForceSpots;
  /** Where the ground at (x, y) (tile coordinates, the tile's middle at +0.5) at `level` is on screen. */
  at(x: number, y: number, level: number): Pt;
  /** The ground's level at a tile, as it is drawn now. */
  level(t: Tile): number;
  say(s: Says | null): void;
  /** The camera glides to frame what the forces work on, and has landed when this returns. */
  frameForces(): Promise<void>;
  /** Where the brushes work, chosen on the land as it stands now; the camera glides to frame it (tilted to read the
   *  land's heights) and has landed when this returns. */
  brushSpots(): Promise<BrushSpots>;
  /** Craterize's Power now. */
  power(): number;
  /** A force is at work. */
  forcing(): boolean;
  /** The Save to Timberborn button: where it is, and lit while the tour shows it pressed. */
  save(): { at: Pt; lit(on: boolean): void } | null;
  /** The tour's pace: 1 plays the gestures at the timings written here (about 20 seconds, the forces' own time on top);
   *  tests run it quicker. */
  pace: number;
}

/** A point on the ground `dx`, `dy` tiles from `t`, at the ground's level there. */
const near = (s: Stage, t: Tile, dx = 0, dy = 0, level = s.level(t)) => s.at(t.x + 0.5 + dx, t.y + 0.5 + dy, level);

export async function playTour(s: Stage): Promise<void> {
  const c = s.hands;
  /** A time as written, in milliseconds, at the tour's pace. */
  const ms = (n: number) => n / s.pace;
  const { river, crater } = s.forces;

  /** F held and the mouse moved out from the ring's middle: the size. Its caption is up for a second and a half. */
  const size = async (t: Tile, radius: number, level = s.level(t)) => {
    s.say({ keys: ["F"], words: "move to size" });
    c.hold("f");
    await c.sleep(ms(200));
    await c.moveTo(s.at(t.x + 0.5 + radius, t.y + 0.5, level), ms(900));
    await c.sleep(ms(250));
    c.release("f");
    await c.sleep(ms(150));
    await c.moveTo(s.at(t.x + 0.5, t.y + 0.5, level), ms(250));
  };
  /** A force at work: watched while it plays; Esc (the editor's own) takes it to its end when it runs long. */
  const watch = async (limit: number) => {
    await c.sleep(ms(150));
    if (!(await c.until(() => !s.forcing(), ms(limit)))) {
      await c.tap("Escape");
      await c.until(() => !s.forcing(), 6000);
    }
  };

  // ------------------------------------------------------------------ Carve: a river
  const from = river[0];
  await s.frameForces();
  c.appear(near(s, from, 0, 18));
  await c.sleep(ms(300));
  s.say({ keys: ["Shift", "1"], words: "Carve" });
  await c.tap("Digit1", { shift: true });
  await c.sleep(ms(200));
  await c.moveTo(near(s, from), ms(600));
  await c.sleep(ms(100));
  await size(from, 4);
  s.say({ keys: [], words: "draw a river" });
  c.down();
  await c.along(curve(river).map((p) => near(s, p)), ms(1000));
  c.up();
  await watch(3000);

  // ------------------------------------------------------------------ Craterize: a crater, its Power scrolled up
  s.say({ keys: ["Shift", "2"], words: "Craterize" });
  await c.tap("Digit2", { shift: true });
  await c.sleep(ms(100));
  await c.moveTo(near(s, crater), ms(550));
  await c.sleep(ms(200));
  // (the copy's Craterize starts low, so the scroll only goes up: the ring grows)
  s.say({ keys: ["F"], words: "scroll for power", wheel: true });
  c.hold("f");
  await c.sleep(ms(150));
  for (let p = s.power(); p < s.forces.craterPower; p += 5) {
    c.wheel(-100);
    await c.sleep(ms(300));
  }
  await c.sleep(ms(100));
  c.release("f");
  await c.sleep(ms(150));
  s.say({ keys: [], words: "click to strike" });
  await c.click();
  await watch(3000);

  // ------------------------------------------------------------------ Raise: a hill, sized with F
  s.say({ keys: ["2"], words: "Raise" });
  await c.tap("Digit2");
  const { hill, shelf } = await s.brushSpots();
  await c.sleep(ms(100));
  await c.moveTo(near(s, hill), ms(550));
  await c.sleep(ms(150));
  await size(hill, 6);
  s.say({ keys: [], words: "paint a hill" });
  c.down();
  await c.along(ring(hill, 1.5, 6).map((p) => near(s, p)), ms(400));
  c.up();
  await c.sleep(ms(150));
  // (the same size, on the level it just made: the hill's second step)
  c.down();
  await c.along(ring(hill, 1, 5).map((p) => near(s, p)), ms(300));
  c.up();
  await c.sleep(ms(300));

  // ------------------------------------------------------------------ Shift+click: the opposite
  s.say({ keys: ["Shift"], words: "click to lower" });
  c.hold("Shift");
  await c.sleep(ms(350));
  const bite = { x: hill.x + 4, y: hill.y - 1 };
  await c.moveTo(near(s, bite), ms(650));
  await c.sleep(ms(250));
  await c.click();
  await c.sleep(ms(350));
  c.release("Shift");

  // ------------------------------------------------------------------ Ctrl+click: take the hilltop's level, Flatten to it
  s.say({ keys: ["4"], words: "Flatten" });
  await c.tap("Digit4");
  await c.sleep(ms(300));
  s.say({ keys: ["Ctrl"], words: "take its level" });
  c.hold("Control");
  await c.sleep(ms(250));
  await c.moveTo(near(s, hill), ms(600));
  await c.sleep(ms(250));
  await c.click();
  await c.sleep(ms(450));
  c.release("Control");
  s.say({ keys: [], words: "paint it flat" });
  await c.moveTo(near(s, shelf, -2, -1), ms(550));
  c.down();
  await c.along(ring(shelf, 1.5, 4).map((p) => near(s, p)), ms(450));
  c.up();
  await c.sleep(ms(300));

  // ------------------------------------------------------------------ Smooth: the edges
  s.say({ keys: ["5"], words: "Smooth" });
  await c.tap("Digit5");
  await c.sleep(ms(100));
  await c.moveTo(near(s, hill, 5, 0), ms(450));
  c.down();
  await c.along(ring(hill, 5, 10, Math.PI * 0.2).map((p) => near(s, p)), ms(600));
  c.up();
  await c.sleep(ms(250));

  // ------------------------------------------------------------------ Save to Timberborn (shown, never done)
  const save = s.save();
  if (save) {
    s.say({ keys: [], words: "Save to Timberborn" });
    await c.moveTo(save.at, ms(700));
    await c.sleep(ms(150));
    save.lit(true);
    await c.sleep(ms(650));
    save.lit(false);
  }
  s.say({ keys: [], words: "That was the tour" });
  await c.sleep(ms(700));
}

/** The river's course as a smooth line: the course's points with a point between each pair, so the hand curves. */
function curve(course: readonly Tile[]): Tile[] {
  const out: Tile[] = [course[0]];
  for (let k = 1; k < course.length; k++) {
    const a = course[k - 1];
    const b = course[k];
    const p = course[Math.max(0, k - 2)];
    const n = course[Math.min(course.length - 1, k + 1)];
    // (Catmull-Rom between a and b: the line bends as the course does, never in corners)
    for (const t of [0.5, 1]) {
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (p0: number, p1: number, p2: number, p3: number) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      out.push({ x: f(p.x, a.x, b.x, n.x), y: f(p.y, a.y, b.y, n.y) });
    }
  }
  return out;
}

/** A line round `t` at `radius`, `turns` of the way round once (from `from`), as a hand would draw it. */
function ring(t: Tile, radius: number, steps: number, from = 0): Tile[] {
  const out: Tile[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = from + (k / steps) * Math.PI * 2;
    // (a spiral in: the first lap wide, the last at the middle's edge)
    const r = radius * (1 - (k / steps) * 0.25);
    out.push({ x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r });
  }
  return out;
}
