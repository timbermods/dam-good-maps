// The 3D view's colours (ROADMAP "Map look", PLAN §20 D86, D110, D114 and Kyler's clean look), in
// one place: the shaders and models read them and the legend shows the same swatches, so the legend
// always says what the scene shows. The clean view is as close to the game as we can make it with
// our own shaders (Kyler's reference screenshots): moist ground a muted yellowish grass (living
// plants grow), dry ground cracked earth in a grey-brown, contamination a layer over either (red-
// orange veins, more and brighter the more contaminated: dry earth's own cracks glow orange, dark
// red veins run through grass), clean water a deep teal body darkening to navy with depth, clear in
// the shallows (the water's own palette is waterPalette.ts, D177), and ground under water a dark
// wet bed; a toggle switches the ground to height colours.
// Walls are dark cobbled stone, every other level a shade darker. Colours are display values (the
// renderer outputs them without conversion).
//
// Meanings differ in lightness too, so they read in greyscale and with any colour blindness: from
// light to dark, dead trees, moist ground, dry ground, badwater. Contamination reads by its veins:
// light lines on dry earth, dark lines on grass, and a darker stain from afar. Clean water's body is
// about as dark as the stained contaminated earth (Kyler, 2026-09-25: as in the game); it reads as
// water by its light shore foam, glints and ripple crests and its see-through shallows, and in
// colour by its blue. Badwater is darker than clean water of the same depth, and dull; water partly
// bad turns smoothly from one to the other over a few tiles where they meet, through a teal-grey and
// a warm brown to crimson, never in streaks, patches or purple (D177). Living trees are dark, dead trees pale. The walls, in the side light, are darker than the ground above them. The information
// layer (**Markers**) adds dam sites, hatched light and dark with a dark rim so they show on any
// ground or water, slope arrows and a pale line at every level.
//
// Pure TypeScript, no three.js: the unit tests and the page's legend read it too.

import { BADWATER, WATER, waterBody, type Rgb } from "./waterPalette";

// The water's colours, opacity and blend live in waterPalette.ts (D177); they are re-exported here
// for the pages and tests that read the palette.
export { BADWATER, blendWater, badwaterBody, badwaterOpacity, cleanWaterBody, WATER, WATER_BLEND, WATER_CALIBRATION, WATER_SURFACE, WATER_UI, waterBlend, waterBody, waterOpacity, type Rgb } from "./waterPalette";

/** What colours the tops of the ground. */
export type GroundMode = "moisture" | "height";

/** A tile's ground, as its colour shows it. */
export type GroundKind = "moist" | "dry" | "contaminated" | "underwater";

export const GROUND = {
  /** Dry ground: cracked earth, the grey-brown of Kyler's reference (never reddish), with dark
   *  cracks; plants die there. Broad patches drift between it, a cooler grey and a warmer brown. */
  dry: [0.44, 0.395, 0.34] as Rgb,
  /** Dry ground's cooler, greyer patches. */
  dryCool: [0.39, 0.38, 0.37] as Rgb,
  /** Dry ground's warmer, browner patches. */
  dryWarm: [0.47, 0.39, 0.31] as Rgb,
  /** The cracks in dry ground. */
  crack: [0.19, 0.17, 0.17] as Rgb,
  /** Moist ground at the edge of the moist area (the least moisture): a muted, yellowish grass
   *  green, lighter than dry ground. */
  moistLow: [0.6, 0.66, 0.31] as Rgb,
  /** Moist ground by the water (the most moisture), a little deeper green. */
  moistHigh: [0.56, 0.66, 0.26] as Rgb,
  /** Contamination (badwater spoils the soil and plants die), a layer over the ground as in the
   *  game: the rust of the veins' rims on dry earth and of the stain round them... */
  contaminated: [0.4, 0.2, 0.14] as Rgb,
  /** ...the veins' glowing orange cores on dry earth... */
  contaminatedGlow: [0.96, 0.52, 0.2] as Rgb,
  /** ...the dark red veins through contaminated grass (wet contaminated ground)... */
  contaminatedWet: [0.34, 0.09, 0.06] as Rgb,
  /** ...and the sickly brown the grass round them is stained. */
  contaminatedGrass: [0.46, 0.36, 0.17] as Rgb,
  /** Ground under water (seen through it). */
  underwater: [0.36, 0.38, 0.34] as Rgb,
} as const;

/** Juice (D205): the dust a lowered stroke puffs up (a light, dry earth), and a source's splash
 *  (the editor's water-blue). A carve at work (D199): the foam surging round its head, the blocks
 *  crumbling at its front (the cut earth), and the muddy water along its last stretch. */
export const JUICE = {
  dust: [0.72, 0.65, 0.54] as Rgb,
  splash: [0.35, 0.82, 1.0] as Rgb,
  foam: [0.92, 0.96, 0.87] as Rgb,
  debris: [0.59, 0.51, 0.41] as Rgb,
  mud: [0.57, 0.5, 0.34] as Rgb,
} as const;

/** Height colours (the toggle): the low and high ends of the ramp, as before Map look. */
export const HEIGHT_RAMP = { low: [0.478, 0.588, 0.329] as Rgb, high: [0.769, 0.698, 0.549] as Rgb } as const;

/** The block walls: dark grey-green cobbled stone, as in Kyler's reference, every other level a
 *  shade darker and a little lighter higher up. With **Markers** on, a pale ledge over a dark
 *  groove between levels, so levels can be counted. */
export const WALL = {
  stone: [0.36, 0.38, 0.35] as Rgb,
  mortar: [0.15, 0.16, 0.15] as Rgb,
  ledge: [0.8, 0.78, 0.68] as Rgb,
  groove: [0.08, 0.08, 0.07] as Rgb,
  alternate: 0.86,
  low: 0.92,
  high: 1.12,
} as const;

/** Contamination as a layer (Kyler, 2026-09-25: as in the game): red-orange veins over the ground's
 *  own look, more of them and brighter the more contaminated, and the soil round them stained a
 *  little (more from afar, where the veins are too fine to see). The terrain shader reads these. */
export const CONTAMINATION = {
  /** The share of the vein network drawn, at the least and the most contamination. */
  reach: [0.15, 0.95] as const,
  /** From which contamination a second, finer network of veins joins (all of it at the most). */
  fineFrom: 0.45,
  /** The veins' glow on dry earth and on grass, at the least and the most contamination, and how
   *  strongly the glow shines (added after the light, so it shows in shade too). */
  glowDry: [0.45, 1] as const,
  glowWet: [0.05, 0.25] as const,
  glowAdd: 0.85,
  /** How dark a vein's rust rim is on dry earth (a share of the rust). */
  rim: 0.75,
  /** The stain round the veins, at the least and the most contamination. */
  stain: [0.06, 0.2] as const,
  /** From afar, where the veins are too fine to see, they tint the ground this much instead (rust
   *  on dry earth, dark red on grass), at the least and the most contamination. */
  cover: [0.12, 0.5] as const,
} as const;

/** With **Markers** on, an outline where contaminated ground ends: a light line between dark
 *  edges, so it shows on grass, earth and at the water's edge, in any colours. */
export const CONTAMINATION_OUTLINE = { light: [1, 0.86, 0.6] as Rgb, dark: [0.1, 0.03, 0.02] as Rgb } as const;

/** The contamination layer at a contamination level (0–1): the share of the vein network drawn,
 *  the finer network's strength, the veins' glow on dry earth and on grass, the stain round them,
 *  and how much the veins tint the ground from afar (as the terrain shader draws it). */
export function contaminationVeins(level: number): { reach: number; fine: number; glowDry: number; glowWet: number; stain: number; cover: number } {
  const C = CONTAMINATION;
  const l = Math.max(0, Math.min(1, level));
  const lerp = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * l;
  return { reach: lerp(C.reach), fine: smooth(C.fineFrom, 1, l), glowDry: lerp(C.glowDry), glowWet: lerp(C.glowWet), stain: lerp(C.stain), cover: lerp(C.cover) };
}

/** A vein's core as drawn (in full light), at a contamination level (0–1): on dry earth a rust rim
 *  glowing orange, through grass dark red with a faint glow. */
export function contaminationVein(level: number, onGrass: boolean): Rgb {
  const v = contaminationVeins(level);
  const base: Rgb = onGrass ? GROUND.contaminatedWet : [GROUND.contaminated[0] * CONTAMINATION.rim, GROUND.contaminated[1] * CONTAMINATION.rim, GROUND.contaminated[2] * CONTAMINATION.rim];
  const glow = CONTAMINATION.glowAdd * (onGrass ? v.glowWet : v.glowDry);
  return [Math.min(1, base[0] + glow * GROUND.contaminatedGlow[0]), Math.min(1, base[1] + glow * GROUND.contaminatedGlow[1]), Math.min(1, base[2] + glow * GROUND.contaminatedGlow[2])];
}

/** Contaminated ground between its veins, with the soil's moisture: stained a little close up, and
 *  from afar (where the veins are too fine to see) tinted by them, rust on earth, dark red on grass. */
export function contaminatedGround(moisture: number, level: number, afar: boolean): Rgb {
  const v = contaminationVeins(level);
  const onGrass = moisture > 0;
  let c = mixRgb(groundColor(moisture, 0, false), onGrass ? GROUND.contaminatedGrass : GROUND.contaminated, v.stain);
  if (afar) c = mixRgb(c, onGrass ? GROUND.contaminatedWet : GROUND.contaminated, v.cover);
  return c;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Dead trees: bare, pale wood (no crown), so they read as dead in any colours; the models use a
 *  greyer tone of it, so dead trees sit back in the landscape. */
export const DEAD_TREE: Rgb = [0.82, 0.78, 0.72];

/** Living trees' crowns (the legend; each species has its own shade in the models). */
export const LIVING_TREE: Rgb = [0.11, 0.27, 0.15];

/** A hatched overlay (dam sites): light stripes in the overlay's colour, dark stripes, and a
 *  dark rim round the hatched tiles. */
export const HATCH = { dark: [0.06, 0.05, 0.04] as Rgb } as const;

/** Dam sites on the map (the overlay colour; alpha 255 draws it hatched). */
export const DAM_SITE: Rgb = [1.0, 0.9, 0.3];

/** The overlay bytes for a dam site (RGBA; the editor's dam-site layer and the preview's best dam
 *  site). */
export const DAM_OVERLAY: readonly [number, number, number, number] = [255, 230, 77, 255];

/** The start: a timber lodge with pale walls, a dark roof and a yellow banner on a pale deck. */
export const START = {
  walls: [0.86, 0.78, 0.62] as Rgb,
  roof: [0.42, 0.13, 0.09] as Rgb,
  deck: [0.74, 0.62, 0.44] as Rgb,
  banner: [1.0, 0.82, 0.16] as Rgb,
} as const;

/** Ruins (Kyler's rounds, D178; his colours, measured in the game): ruined scaffold towers, one
 *  storey per level: thin rusty posts, beams and braces (#8D5631), beige slab panels (#B8A775) and,
 *  on moist ground, ivy (#405634, the brighter green on its clusters' edges) draped over about the
 *  lower half of the storeys, the panels' middles showing through. From afar each storey is a block in the scaffolding's rust (what
 *  makes ruins read from afar), a pale panel set in where it has one. The rust and the panels are
 *  lighter than rusty contaminated ground. */
export const RUIN = {
  rust: [0.553, 0.337, 0.192] as Rgb,
  panel: [0.722, 0.655, 0.459] as Rgb,
  ivy: [0.251, 0.337, 0.204] as Rgb,
  /** The ivy's brighter leaves, on its clusters' edges. */
  leaf: [0.36, 0.5, 0.24] as Rgb,
  /** From afar: the top of a storey (its beams, lit from above), a brighter rust. */
  top: [0.6, 0.38, 0.22] as Rgb,
} as const;

/** Slopes: a stone ramp; with **Markers** on, a pale arrow rimmed dark points uphill. */
export const SLOPE = { ramp: [0.5, 0.46, 0.4] as Rgb, side: [0.3, 0.31, 0.28] as Rgb, arrow: [0.97, 0.93, 0.78] as Rgb, rim: [0.14, 0.1, 0.07] as Rgb } as const;

/** Geothermal fields: a mound of dark rock with vents glowing orange. */
export const GEOTHERMAL: Rgb = [0.82, 0.48, 0.16];
export const GEOTHERMAL_ROCK: Rgb = [0.27, 0.26, 0.25];

/** Relics: weathered pale stone, broken columns on a plinth. */
export const RELIC_STONE: Rgb = [0.66, 0.62, 0.54];

/** Thorns: a low, dark red-brown bramble. */
export const THORNS: Rgb = [0.34, 0.16, 0.14];

/** The sky round the map: blue overhead, paler toward the horizon (the haze is the horizon's
 *  colour, so distant ground fades into it). */
export const SKY = { zenith: [0.36, 0.55, 0.8] as Rgb, horizon: [0.64, 0.75, 0.87] as Rgb, below: [0.46, 0.6, 0.77] as Rgb, cloud: [0.93, 0.95, 0.97] as Rgb } as const;

/** Mine sites (Kyler's rounds, D178; his colours, measured in the game): a rusty frame in a dull
 *  brown-orange (#844D2F) round the edge of the 5 × 5 footprint, and a pit with real depth filling
 *  the rest, its earth a dark grey-brown with roots, rubble and cracks; scaffold towers on the
 *  frame's corners with pale wooden platforms, crates and planks (#A78E65). With **Markers** on, an
 *  orange line between dark edges outlines the footprint, a few pixels wide from any distance. */
export const MINE = {
  /** The pit as it shows in its shade (about #373A34): the legend's colour. */
  pit: [0.216, 0.227, 0.204] as Rgb,
  /** The pit's earth as the model colours it: lit only by the sky down there, it shows about as
   *  `pit`. The walls' topsoil is browner and lighter, with a pale seam, and the earth darkens
   *  toward the floor; the floor darkens toward its edges. */
  earthTop: [0.66, 0.58, 0.45] as Rgb,
  earth: [0.56, 0.55, 0.46] as Rgb,
  earthLow: [0.43, 0.43, 0.37] as Rgb,
  seam: [0.68, 0.64, 0.53] as Rgb,
  floor: [0.43, 0.45, 0.37] as Rgb,
  floorEdge: [0.34, 0.35, 0.3] as Rgb,
  crack: [0.16, 0.16, 0.15] as Rgb,
  floorCrack: [0.24, 0.24, 0.21] as Rgb,
  /** The shaft in the pit's floor. */
  shaft: [0.2, 0.2, 0.18] as Rgb,
  root: [0.34, 0.25, 0.17] as Rgb,
  rootPale: [0.74, 0.64, 0.48] as Rgb,
  rubble: [[0.62, 0.58, 0.5], [0.44, 0.41, 0.36], [0.72, 0.67, 0.58]] as readonly Rgb[],
  ladder: [0.52, 0.42, 0.29] as Rgb,
  rope: [0.22, 0.17, 0.12] as Rgb,
  frame: [0.518, 0.302, 0.184] as Rgb,
  wood: [0.655, 0.557, 0.396] as Rgb,
  /** **Markers**: the outline round the footprint. */
  outline: [1.0, 0.56, 0.18] as Rgb,
  outlineDark: [0.1, 0.05, 0.02] as Rgb,
} as const;

/** The light: a warm sun from the north-west, a cool sky (violet in the shadows of the earth),
 *  and a blue-grey haze over distant ground. */
export const LIGHT = {
  /** Toward the sun: west and north (x east, y north), 50° above the horizon. */
  sunAzimuth: [-Math.SQRT1_2, Math.SQRT1_2] as const,
  sunElevation: (50 * Math.PI) / 180,
  /** The sun's disc and the sky's scatter soften shadows: two sweeps, this far either side. */
  penumbra: (6 * Math.PI) / 180,
  sun: [1.0, 0.95, 0.86] as Rgb,
  sky: [0.63, 0.64, 0.72] as Rgb,
  haze: [0.68, 0.77, 0.87] as Rgb,
} as const;

/** Soil moisture (the game's levels, 0–16) and contamination (0–1) as bytes: 0 stays 0, and any
 *  moisture or contamination at all stays above 0 (moist soil is where living plants grow). */
export function moistureByte(m: number): number {
  if (!(m > 0)) return 0;
  return Math.min(255, Math.max(1, Math.round(m * 15)));
}

export function contaminationByte(c: number): number {
  if (!(c > 0)) return 0;
  return Math.min(255, Math.max(1, Math.round(c * 255)));
}

/** A tile's ground kind from its soil bytes: under water first, then contaminated (plants die
 *  even on moist soil), then moist or dry. The shader follows the same order. */
export function groundKind(moisture: number, contamination: number, underwater: boolean): GroundKind {
  if (underwater) return "underwater";
  if (contamination > 0) return "contaminated";
  return moisture > 0 ? "moist" : "dry";
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The ground's base colour (before light and texture) for soil bytes, in moisture mode; the
 *  shader's `groundColor` does the same per pixel. Contamination is a layer drawn over it (its
 *  veins and stain, `contaminationVeins`): the ground under it keeps its own colour. */
export function groundColor(moisture: number, contamination: number, underwater: boolean): Rgb {
  switch (groundKind(moisture, contamination, underwater)) {
    case "underwater":
      return GROUND.underwater;
    case "contaminated":
      return groundColor(moisture, 0, false);
    case "moist":
      // the game's moisture levels: 1 at the moist area's edge, 10 and up by the water
      return mixRgb(GROUND.moistLow, GROUND.moistHigh, Math.max(0, Math.min(1, (Math.round(moisture / 15) - 1) / 9)));
    default:
      return GROUND.dry;
  }
}

/** The wall colour of a level (0 = the lowest the map can have, 22 the highest): the stone,
 *  a little lighter higher up, every other level darker. */
export function wallColor(level: number): Rgb {
  const t = Math.max(0, Math.min(1, level / 16));
  const k = (WALL.low + (WALL.high - WALL.low) * t) * (level % 2 ? WALL.alternate : 1);
  return [WALL.stone[0] * k, WALL.stone[1] * k, WALL.stone[2] * k];
}

export function cssColor(c: Rgb): string {
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

export interface LegendEntry {
  /** CSS background for the swatch (a colour, a gradient or a small picture). */
  swatch: string;
  label: string;
  /** Shown only with **Markers** on (the information layer). */
  markers?: boolean;
}

/** A small picture (24 × 16) as a CSS background. */
function icon(body: string, ground = "#00000000"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><rect width="24" height="16" fill="${ground}"/>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/** What the 3D view's colours mean for the ground, the water and the walls, for its legend. */
export function legendEntries(mode: GroundMode): LegendEntry[] {
  const c = cssColor;
  const cracks = (base: Rgb, line: Rgb, w = 1.5) => `repeating-linear-gradient(60deg, ${c(base)} 0 4px, ${c(line)} 4px ${4 + w}px, ${c(base)} ${4 + w}px 10px)`;
  const ground: LegendEntry[] =
    mode === "moisture"
      ? [
          { swatch: `linear-gradient(90deg, ${c(GROUND.moistLow)}, ${c(GROUND.moistHigh)})`, label: "Moist ground: plants grow" },
          { swatch: cracks(GROUND.dry, GROUND.crack), label: "Dry ground: plants die" },
          {
            // veins over the ground: glowing orange on dry earth, dark red through grass
            swatch: icon(
              `<rect width="12" height="16" fill="${c(GROUND.dry)}"/><rect x="12" width="12" height="16" fill="${c(GROUND.moistLow)}"/>` +
                `<path d="M0 4 L5 6 L4 11 L9 13 M5 6 L11 3" stroke="${c(GROUND.contaminatedGlow)}" stroke-width="1.3" fill="none"/>` +
                `<path d="M12 5 L17 7 L16 12 L22 14 M17 7 L23 3" stroke="${c(GROUND.contaminatedWet)}" stroke-width="1.3" fill="none"/>`,
            ),
            label: "Contaminated ground: plants die",
          },
        ]
      : [{ swatch: `linear-gradient(90deg, ${c(HEIGHT_RAMP.low)}, ${c(HEIGHT_RAMP.high)})`, label: "Ground by height: low to high" }];
  // walls: two levels of cobbled stone, one a shade darker
  const cobbles = (y: number) => [2, 9, 16].map((x, k) => `<rect x="${x + (y % 2) * 3}" y="${y + 1 + (k % 2)}" width="5" height="3" rx="1" fill="${c(WALL.mortar)}" opacity="0.5"/>`).join("");
  const walls = icon(`<rect width="24" height="8" fill="${c(wallColor(11))}"/><rect y="8" width="24" height="8" fill="${c(wallColor(10))}"/>` + cobbles(0) + cobbles(9));
  return [
    ...ground,
    { swatch: `linear-gradient(90deg, ${c(WATER.foam)} 0 2px, ${c(WATER.shallow)} 2px, ${c(WATER.teal)} 45%, ${c(WATER.navy)})`, label: "Water: darker is deeper" },
    { swatch: icon(`<path d="M0 7 Q6 4 12 7 T24 7" stroke="${c(WATER.badStreak)}" stroke-width="1.2" fill="none"/><circle cx="17" cy="11" r="1.3" fill="${c(WATER.badVein)}"/>`, c(WATER.bad)), label: "Badwater" },
    { swatch: walls, label: "Walls: one band per level" },
    { swatch: cssColor(DEAD_TREE), label: "Bare pale trees: dead" },
  ];
}

/** The legend's lines for water mixed with badwater and for what stands on the map: trees, the
 *  start, slopes, ruins and the other objects, each as its model looks from above. */
export function objectLegend(): LegendEntry[] {
  const c = cssColor;
  const grass = c(GROUND.moistLow);
  const dry = c(GROUND.dry);
  return [
    {
      // clean water turning to badwater (teal-grey, warm brown, crimson, darker), with badwater's
      // bubbles at its end
      swatch:
        icon(`<circle cx="18" cy="6" r="1.1" fill="${c(WATER.badVein)}"/><circle cx="21.5" cy="11" r="1.1" fill="${c(WATER.badVein)}"/>`) +
        `, linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((share) => c(waterBody(BADWATER.shallow, share))).join(", ")})`,
      label: "Water mixed with badwater: fades to murky brown",
    },
    {
      swatch: icon(`<circle cx="7" cy="8" r="5" fill="${c(LIVING_TREE)}"/><path d="M16 2 L21 14 H11Z" fill="${c([0.11, 0.28, 0.17])}"/>`, grass),
      label: "Living trees and bushes",
    },
    {
      swatch: icon(
        `<rect x="3" y="3" width="18" height="12" fill="${c(START.deck)}"/><rect x="6" y="5" width="12" height="8" fill="${c(START.walls)}"/><path d="M5 8 L12 4 L19 8 L19 11 L5 11Z" fill="${c(START.roof)}"/>` +
          `<rect x="3" y="0" width="1" height="9" fill="#3a2a1c"/><rect x="4" y="0.5" width="6" height="3.5" fill="${c(START.banner)}" stroke="#000" stroke-width="0.5"/>`,
        dry,
      ),
      label: "The start: district center",
    },
    {
      swatch: icon(`<path d="M3 14 L12 3 L21 14Z" fill="${c(SLOPE.ramp)}"/><path d="M3 14 L21 14 L21 15 L3 15Z" fill="${c(SLOPE.side)}"/>`, dry),
      label: "Slopes: stone ramps",
    },
    {
      // a rusty skeleton with beige panels, one askew, its top storey partly there
      swatch: icon(
        `<rect x="8.3" y="9.6" width="7.4" height="5.6" fill="${c(RUIN.panel)}"/><rect x="9" y="4.4" width="5" height="4.2" fill="${c(RUIN.panel)}" transform="rotate(-9 11.5 6.5)"/>` +
          `<rect x="7" y="3" width="1.3" height="13" fill="${c(RUIN.rust)}"/><rect x="15.7" y="0.5" width="1.3" height="15.5" fill="${c(RUIN.rust)}"/><rect x="7" y="8.6" width="10" height="1.1" fill="${c(RUIN.rust)}"/>` +
          `<path d="M8 8.6 L16 1.5" stroke="${c(RUIN.rust)}" stroke-width="0.9"/>`,
        dry,
      ),
      label: "Ruins: ruined scaffold towers, a storey per level",
    },
    {
      // the rusty frame round the footprint, the pit filling it, pale platforms on the frame's
      // corners, beams across
      swatch: icon(
        `<rect x="4" y="1" width="16" height="14" fill="${c(MINE.frame)}"/><rect x="5.3" y="2.3" width="13.4" height="11.4" fill="${c(MINE.pit)}"/>` +
          `<rect x="4" y="1" width="3.6" height="3.4" fill="${c(MINE.wood)}"/><rect x="16.4" y="1" width="3.6" height="3.4" fill="${c(MINE.wood)}"/><rect x="4" y="11.6" width="3.6" height="3.4" fill="${c(MINE.wood)}"/><rect x="16.4" y="11.6" width="3.6" height="3.4" fill="${c(MINE.wood)}"/>` +
          `<rect x="4" y="6.2" width="16" height="0.9" fill="${c(MINE.frame)}"/><rect x="4" y="8.9" width="16" height="0.9" fill="${c(MINE.frame)}"/>`,
        dry,
      ),
      label: "Mine site: a pit in a rusty frame",
    },
    {
      swatch: icon(`<circle cx="12" cy="8" r="6" fill="#77746d"/><circle cx="12" cy="8" r="4.2" fill="${c([0.32, 0.62, 0.95])}"/>`, dry) + `, ${dry}`,
      label: "Water source",
    },
    {
      swatch: icon(`<circle cx="12" cy="8" r="7" fill="#33261f"/><path d="M12 8 m-4 0 a4 4 0 1 1 4 4" stroke="${c([0.5, 0.3, 0.18])}" stroke-width="1.6" fill="none"/>`, dry),
      label: "Badwater source",
    },
    {
      swatch: icon(`<ellipse cx="12" cy="9" rx="10" ry="5" fill="${c(GEOTHERMAL_ROCK)}"/><circle cx="8" cy="8" r="1.6" fill="${c(GEOTHERMAL)}"/><circle cx="15" cy="10" r="1.6" fill="${c(GEOTHERMAL)}"/>`, dry),
      label: "Geothermal field: dark rock with glowing vents",
    },
    {
      swatch: icon(`<rect x="3" y="11" width="18" height="3" fill="${c(RELIC_STONE)}"/><rect x="6" y="3" width="3" height="8" fill="${c(RELIC_STONE)}"/><rect x="14" y="6" width="3" height="5" fill="${c(RELIC_STONE)}"/>`, dry),
      label: "Relic: broken stone columns",
    },
    { swatch: icon(`<path d="M4 13 L7 5 L9 12 L12 3 L14 12 L17 6 L20 13Z" fill="${c(THORNS)}"/>`, dry), label: "Thorns: dark brambles" },
    { swatch: icon(`<circle cx="9" cy="10" r="4" fill="#858380"/><circle cx="15" cy="11" r="3.5" fill="#6f6d6a"/><circle cx="12" cy="6" r="3" fill="#9a9894"/>`, dry), label: "Blockage: a heap of stones" },
    { swatch: icon(`<rect x="7" y="4" width="10" height="9" fill="#858380"/>`, dry), label: "Other objects: blocks" },
    // the information layer
    {
      swatch: icon(`<rect x="4" y="1" width="16" height="14" fill="${c(SLOPE.ramp)}"/><path d="M12 2 L18 8 L14.2 8 L14.2 14 L9.8 14 L9.8 8 L6 8Z" fill="${c(SLOPE.arrow)}" stroke="${c(SLOPE.rim)}" stroke-width="1.2"/>`, dry),
      label: "Slopes: arrows point uphill",
      markers: true,
    },
    {
      swatch: icon(`<rect width="24" height="16" fill="${c(wallColor(5))}"/><rect y="5" width="24" height="1.6" fill="${c(WALL.ledge)}"/><rect y="6.6" width="24" height="0.8" fill="${c(WALL.groove)}"/><rect y="12" width="24" height="1.6" fill="${c(WALL.ledge)}"/><rect y="13.6" width="24" height="0.8" fill="${c(WALL.groove)}"/>`),
      label: "Walls: a pale line at every level",
      markers: true,
    },
    {
      swatch: icon(
        `<rect width="12" height="16" fill="${c(GROUND.dry)}"/><rect x="12" width="12" height="16" fill="${c(GROUND.moistLow)}"/>` +
          `<path d="M2 4 L8 6 L7 11" stroke="${c(GROUND.contaminatedGlow)}" stroke-width="1.1" fill="none"/>` +
          `<rect x="10" width="4" height="16" fill="${c(CONTAMINATION_OUTLINE.dark)}"/><rect x="11" width="2" height="16" fill="${c(CONTAMINATION_OUTLINE.light)}"/>`,
      ),
      label: "Contaminated ground: an outline where it ends",
      markers: true,
    },
    {
      swatch: icon(`<rect x="4" y="1" width="16" height="14" fill="${c(MINE.outlineDark)}"/><rect x="5" y="2" width="14" height="12" fill="${c(MINE.outline)}"/><rect x="7" y="4" width="10" height="8" fill="${c(MINE.outlineDark)}"/><rect x="8" y="5" width="8" height="6" fill="${c(MINE.pit)}"/>`, dry),
      label: "Mine sites: an orange outline",
      markers: true,
    },
  ];
}

/** A dam site's legend swatch: hatched light and dark, rimmed dark. */
export function damLegendSwatch(): string {
  const c = cssColor;
  const stripes = Array.from({ length: 6 }, (_, k) => `<path d="M${k * 6 - 6} 16 L${k * 6 + 2} 0 L${k * 6 + 5} 0 L${k * 6 - 3} 16Z" fill="${c(HATCH.dark)}"/>`).join("");
  return icon(`<defs><clipPath id="d"><rect x="2" y="2" width="20" height="12"/></clipPath></defs><rect x="2" y="2" width="20" height="12" fill="${c(DAM_SITE)}"/><g clip-path="url(#d)">${stripes}</g><rect x="1" y="1" width="22" height="14" fill="none" stroke="${c(HATCH.dark)}" stroke-width="2"/>`);
}
