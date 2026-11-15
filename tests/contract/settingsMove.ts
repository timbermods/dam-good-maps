// Every move of a generator control changes the next map, or the panel greys the control (D527). For each theme, at
// 96², each control of the generator panel is moved from the theme's preset: its smallest move both ways (the
// slider's step, the next choice, one on a count) and its largest (to each end of its range), and each move must
// change the world (land, water, objects: the map's world entry) on at least one of seeds 1–5. The controls, their
// ranges, their steps and their greying are the panel's own (`genFields`, src/editor/generator/fields.tsx): each move
// is made through the control's own handler, so a coupling the panel makes (Verticality carrying Highest terrain) is
// made here too, and a control the panel greys there is not moved. There is no list of exceptions: a control is live
// or greyed. Seed, size, theme and idea pick the map rather than shape it, and stay as they are.
//
// settingsMove.<theme>.heavy.test.ts runs a theme each in the nightly suite, a test a panel group;
// `npx tsx tests/contract/settingsMove.ts [theme …] [--seeds 1,2]` runs by hand and prints every move's result.
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type { VNode } from "preact";
import { generate } from "../../src/core/gen/generate";
import { encodeWorld } from "../../src/core/format/world";
import { makeSpec, THEMES, type MapSpec, type Settings, type ThemeId } from "../../src/core/spec/mapspec";
import { genFields, GROUPS, MixSetting, type FieldKey, type GroupName } from "../../src/editor/generator/fields";
import type { SettingsProps } from "../../src/editor/generator/hints";
import { ChoiceSetting, NumberSetting } from "../../src/editor/settings";

/** The size and seeds of the sample (D527; seeds 1–5 rather than 1–2: Lake Basin's Waterfalls Off has no fall to take
 *  away at Few on seeds 1–2, #1174, and Islands' Max walk to water from 20 to 21 changes seeds 5, 7 and 9 but none of
 *  1–4, a bound those maps already meet; planning, #236 comments 6893749012 and 6895084088). */
export const MOVE_SIZE = 96;
export const MOVE_SEEDS = [1, 2, 3, 4, 5] as const;

/** One move of one control: what the panel would hand the generator after it. */
export interface Move {
  /** The control and the move, as a player reads them ("Relief 50 → 51, smallest"). */
  name: string;
  /** The panel's group the control sits in (Easy start, on the Size line, goes with Difficulty). */
  group: GroupName;
  settings: Settings;
}

type Props = Record<string, any>;

/** The panel's controls for this spec, each a vnode `genFields` made: the props it was given are the control's range,
 *  value, greying and handler. `onSettings` hands back what the control's handler made. */
function panel(spec: MapSpec): { fields: Record<FieldKey, VNode<Props>>; took: { settings: Settings | null } } {
  const took: { settings: Settings | null } = { settings: null };
  const none = () => {};
  const p: SettingsProps = {
    spec,
    seedText: String(spec.seed),
    onSeed: none,
    seedPinned: true,
    onUnpinSeed: none,
    onPinSeed: none,
    onSize: none,
    onTheme: none,
    onPremise: none,
    onSettings: (s) => (took.settings = s),
    onReset: none,
  };
  return { fields: genFields(p) as unknown as Record<FieldKey, VNode<Props>>, took };
}

/** Every move the panel offers from this spec, and the controls it greys there. */
export function panelMoves(spec: MapSpec): { moves: Move[]; greyed: string[] } {
  const { fields, took } = panel(spec);
  const moves: Move[] = [];
  const greyed: string[] = [];
  let group: GroupName = GROUPS[0].name;
  const make = (name: string, act: () => void) => {
    took.settings = null;
    act();
    if (!took.settings) throw new Error(`${name}: the control's handler gave the panel nothing`);
    moves.push({ name, group, settings: took.settings });
  };
  for (const [key, g] of GROUPS.flatMap((g) => g.keys.map((k) => [k, g.name] as const))) {
    group = g;
    const el = fields[key];
    const q = el.props;
    if (el.type === NumberSetting) {
      if (q.disabled) {
        greyed.push(q.label);
        continue;
      }
      const v: number = q.value;
      const targets = new Map<number, string[]>();
      const add = (t: number, why: string) => t !== v && t >= q.min && t <= q.max && targets.set(t, [...(targets.get(t) ?? []), why]);
      add(v - q.step, "smallest");
      add(v + q.step, "smallest");
      add(q.min, "largest");
      add(q.max, "largest");
      for (const [t, why] of targets) make(`${q.label} ${v} → ${t}, ${why.join(" and ")}`, () => q.onChange(t));
    } else if (el.type === ChoiceSetting) {
      if (q.off) {
        greyed.push(q.label);
        continue;
      }
      // (an option the panel disables there, a drought reserve too big for the map, is not a move it offers)
      const open = (q.options as [string, string, string, string | false][]).filter((o) => !o[3]);
      const at = open.findIndex((o) => o[0] === q.value);
      if (at < 0) throw new Error(`${q.label}: the preset's ${q.value} is not an option the panel offers`);
      const targets = new Map<number, string[]>();
      const add = (i: number, why: string) => i !== at && i >= 0 && i < open.length && targets.set(i, [...(targets.get(i) ?? []), why]);
      add(at - 1, "smallest");
      add(at + 1, "smallest");
      add(0, "largest");
      add(open.length - 1, "largest");
      for (const [i, why] of targets) make(`${q.label} ${open[at][1]} → ${open[i][1]}, ${why.join(" and ")}`, () => q.onChange(open[i][0]));
    } else if (el.type === MixSetting) {
      // the bar's three edges, each nudged one share either way (an arrow key) and dragged to either end of its reach;
      // the shares are the bar's (`MixSetting`'s own arithmetic)
      const mix = q.mix as Settings["resources"]["speciesMix"];
      const kinds = ["pine", "birch", "oak", "succulent"] as const;
      const total = kinds.reduce((a, k) => a + mix[k], 0) || 1;
      const raw = kinds.map((k) => Math.round((mix[k] / total) * 100));
      const shares = [raw[0], raw[1], raw[2], Math.max(0, 100 - raw[0] - raw[1] - raw[2])];
      const edges = [shares[0], shares[0] + shares[1], shares[0] + shares[1] + shares[2]];
      const names = ["Pine and birch", "Birch and oak", "Oak and succulent"];
      edges.forEach((e, i) => {
        const lo = i ? edges[i - 1] : 0;
        const hi = i < 2 ? edges[i + 1] : 100;
        const targets = new Map<number, string[]>();
        const add = (t: number, why: string) => t !== e && t >= lo && t <= hi && targets.set(t, [...(targets.get(t) ?? []), why]);
        add(e - 1, "smallest");
        add(e + 1, "smallest");
        add(lo, "largest");
        add(hi, "largest");
        for (const [t, why] of targets) {
          const m = [...edges];
          m[i] = t;
          make(`Species mix, ${names[i]} edge ${e} → ${t}, ${why.join(" and ")}`, () => q.onChange({ pine: m[0], birch: m[1] - m[0], oak: m[2] - m[1], succulent: 100 - m[2] }));
        }
      });
    } else throw new Error(`${key}: a control the test does not know how to move`);
  }
  // Easy start, the toggle on the Size line
  group = "Difficulty";
  const size = fields.size.props;
  make(`Easy start ${size.easy ? "on → off" : "off → on"}`, () => size.onEasy(!size.easy));
  return { moves, greyed };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** The world a spec makes: the map's world entry (land, water, objects), which the game loads; the metadata beside it,
 *  which carries the settings in the map's link, is left out. */
export function worldOf(spec: MapSpec): string {
  return sha(encodeWorld(generate(spec).file.world));
}

/** The theme's spec on a seed, at its preset. */
export function presetOf(theme: ThemeId, seed: number): MapSpec {
  return makeSpec({ seed, size: { x: MOVE_SIZE, y: MOVE_SIZE }, theme });
}

export interface MoveResult {
  name: string;
  /** The first seed whose world the move changed, or null when none did. */
  changedOn: number | null;
}

/** Each seed's preset world, made once and shared by the groups' tests. */
const presets = new Map<string, string>();

/** Every move on a theme (of one group, or all), each tried seed by seed until one changes the world (a seed's preset
 *  map is made only while a move is still unchanged). */
export function themeMoves(theme: ThemeId, seeds: readonly number[] = MOVE_SEEDS, only?: GroupName): { results: MoveResult[]; greyed: string[]; maps: number } {
  const open = new Map<string, MoveResult>();
  const greyed = new Set<string>();
  let maps = 0;
  for (const seed of seeds) {
    const preset = presetOf(theme, seed);
    const all = panelMoves(preset);
    const offered = { greyed: all.greyed, moves: only ? all.moves.filter((m) => m.group === only) : all.moves };
    // (the preset is the theme's on every seed; a move a later seed offered first would be tried from there)
    for (const g of offered.greyed) greyed.add(g);
    for (const m of offered.moves) if (!open.has(m.name)) open.set(m.name, { name: m.name, changedOn: null });
    const left = offered.moves.filter((m) => open.get(m.name)?.changedOn === null);
    if (!left.length) break;
    const key = `${theme} ${seed}`;
    if (!presets.has(key)) {
      presets.set(key, worldOf(preset));
      maps++;
    }
    const base = presets.get(key)!;
    for (const m of left) {
      maps++;
      if (worldOf({ ...preset, settings: m.settings }) !== base) open.get(m.name)!.changedOn = seed;
    }
  }
  return { results: [...open.values()], greyed: [...greyed], maps };
}

/** The theme as tests, a group of the panel each (a theme's moves take longer than one test's time limit on a loaded
 *  machine): every move the panel offers changes the world on at least one seed. */
export function moveTest(theme: ThemeId): void {
  for (const { name } of GROUPS)
    it(`every move of a ${name} control changes the ${theme} map at ${MOVE_SIZE}², seeds ${MOVE_SEEDS[0]}–${MOVE_SEEDS[MOVE_SEEDS.length - 1]}, unless the panel greys it (D527)`, () => {
      const { results } = themeMoves(theme, MOVE_SEEDS, name);
      const dead = results.filter((r) => r.changedOn === null).map((r) => r.name);
      expect(dead, `${theme}: moves that changed nothing on seeds ${MOVE_SEEDS.join(", ")} at ${MOVE_SIZE}²`).toEqual([]);
    });
}

// (by hand: npx tsx tests/contract/settingsMove.ts [theme …] [--seeds 1,2]; prints every move and the first seed it changed)
if (typeof process !== "undefined" && process.argv[1]?.replace(/\\/g, "/").endsWith("tests/contract/settingsMove.ts")) {
  const args = process.argv.slice(2);
  const si = args.indexOf("--seeds");
  const seeds = si >= 0 ? args.splice(si, 2)[1].split(",").map(Number) : [...MOVE_SEEDS];
  const themes = (args.length ? args : THEMES) as ThemeId[];
  for (const theme of themes) {
    const t0 = performance.now();
    const { results, greyed, maps } = themeMoves(theme, seeds);
    for (const r of results) console.log(JSON.stringify({ theme, move: r.name, changedOn: r.changedOn }));
    const dead = results.filter((r) => r.changedOn === null).length;
    console.log(JSON.stringify({ theme, moves: results.length, dead, greyed, maps, s: Math.round((performance.now() - t0) / 1000) }));
  }
}
