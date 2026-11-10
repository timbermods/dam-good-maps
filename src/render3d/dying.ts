// A dying plant as the game draws it (D242 as amended 2026-10-29): between alive and dead each plant has a third model,
// `#Dying` (`NaturalResourceLifecycleModel`), shown while a cause of death runs (core/sim/withering.ts `dyingCause`).
// The game's `*Dry` models are its living ones with the same parts: no leaves are lost on a grown plant. Its foliage
// turns from green to ochre and draws in a little. Our models are our own (D178). This makes their dying forms the
// game's way: the foliage takes the game's dry colour at the lightness our own green has, and draws in and sinks as
// much as the game's does. The rest of the plant (trunk, bark, a bush's fruit) stays as it is.
//
// The numbers were read from the game's own models (resources.assets, read-only), averaged over their surface
// (texture × vertex colour, weighted by area and the texture's alpha), and compared for each species' Mature and
// MatureDry:
// - the foliage's colour alive and dry;
// - how far the foliage reaches from the trunk (dry ÷ alive);
// - its height (dry ÷ alive).
// The Succulent is all foliage and turns only a little browner, so its colour changes by the game's ratio instead.
// Pure TypeScript, no three.js.

export type Rgb = readonly [number, number, number];

export interface Drying {
  /** The game's foliage, alive and dry (gamma, as the game draws it). */
  alive: Rgb;
  dry: Rgb;
  /** The foliage's reach from the trunk and its height, dry ÷ alive. */
  reach: number;
  height: number;
  /** "hue": foliage takes the game's dry colour at its own lightness; "ratio": every colour scaled by dry ÷ alive. */
  mode: "hue" | "ratio";
}

/** From the game's Mature and MatureDry models (PineMature: 225 vertices, foliage reach 0.657 → 0.546; BirchMature:
 *  0.592 → 0.556; OakMature: 0.93 → 0.89; BlueberryBushMature: height 0.422 → 0.404; SucculentMature: 1.29 → 1.276). */
export const DRYING: Readonly<Record<string, Drying>> = {
  Pine: { alive: [0.114, 0.181, 0.099], dry: [0.203, 0.156, 0.044], reach: 0.83, height: 0.99, mode: "hue" },
  Birch: { alive: [0.174, 0.231, 0.099], dry: [0.246, 0.198, 0.057], reach: 0.94, height: 0.99, mode: "hue" },
  Oak: { alive: [0.126, 0.176, 0.083], dry: [0.252, 0.199, 0.079], reach: 0.96, height: 0.99, mode: "hue" },
  BlueberryBush: { alive: [0.153, 0.175, 0.088], dry: [0.301, 0.213, 0.085], reach: 1, height: 0.96, mode: "hue" },
  Succulent: { alive: [0.308, 0.223, 0.157], dry: [0.29, 0.184, 0.12], reach: 1, height: 0.99, mode: "ratio" },
};

const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** Whether a colour of our models is foliage: green above red and blue (leaves, needles, a succulent's pads). */
export function isFoliage(c: Rgb): boolean {
  return c[1] > c[0] && c[1] > c[2];
}

/** A colour of `species`' model as the dying plant has it: foliage in the game's dry colour at its own lightness ("hue"),
 *  or every colour by the game's ratio ("ratio"); anything else, and any species without a dying form, as it is. */
export function dryColour(species: string, c: Rgb): [number, number, number] {
  const d = DRYING[species];
  if (!d) return [c[0], c[1], c[2]];
  if (d.mode === "ratio") return [c[0] * (d.dry[0] / d.alive[0]), c[1] * (d.dry[1] / d.alive[1]), c[2] * (d.dry[2] / d.alive[2])];
  if (!isFoliage(c)) return [c[0], c[1], c[2]];
  const k = luma(c) / luma(d.alive);
  return [Math.min(1, d.dry[0] * k), Math.min(1, d.dry[1] * k), Math.min(1, d.dry[2] * k)];
}

/** A dead plant as the game draws it (its MatureDead models against its Mature ones, read as above): a pine, birch or oak
 *  is bare wood in its own bark's colour weathered (`wood`: dead wood ÷ living bark, per channel; the pine's and oak's
 *  lighter and greyer, the birch's a fifth darker), a blueberry bush keeps its leaves gone brown (`leaves`: the game's
 *  dead foliage, taken at our green's lightness as a dying form's is) and loses its berries, a succulent darkens
 *  (`ratio`); each `height` ÷ the living plant's (PineMatureDead 2.368 of 3.009, BirchMatureDead 1.387 of 1.924,
 *  OakMatureDead 1.533 of 2.259, BlueberryBushMatureDead 0.30 of 0.422, SucculentMatureDead 0.967 of 1.29). The birch's
 *  wood is its bark's light part, as its living bark (palette.ts `TREE_COLOURS.birchBark`): BirchMatureDead's texels
 *  lighter than 0.3, 0.517/0.466/0.388, over BirchMature's, 0.634/0.579/0.490 (`tools/game-model-albedo.py --above 0.3`;
 *  until 2026-11-08 0.93/0.93/0.92). */
export const DEAD_FORM: Readonly<Record<string, { height: number; wood?: Rgb; leaves?: Rgb; ratio?: Rgb }>> = {
  Pine: { height: 0.79, wood: [1.25, 1.43, 1.6] },
  Birch: { height: 0.72, wood: [0.815, 0.805, 0.792] },
  Oak: { height: 0.68, wood: [1.21, 1.24, 1.41] },
  BlueberryBush: { height: 0.71, leaves: [0.297, 0.178, 0.092] },
  Succulent: { height: 0.75, ratio: [0.81, 0.7, 0.74], leaves: [0.248, 0.156, 0.116] },
};

/** A part of a dead tree's wood: a line of points (x, y, z, radius; radius 0 a point), its sides round and its shade
 *  ("wood" the tree's dead wood, "dark" a stub a shade darker, "break" pale where a limb broke); `tip`, its last length's
 *  shade where it differs; `cap`, its top end closed in that shade (a trunk's top, which the limbs only partly cover). */
export interface DeadLimb {
  line: readonly (readonly [number, number, number, number])[];
  sides: number;
  part: DeadPart;
  tip?: DeadPart;
  cap?: DeadPart;
}
export type DeadPart = "wood" | "dark" | "break";
/** A stub of a branch from the trunk's axis at height y out to (x, z) and a little up, `length` long. */
const stub = (x: number, y: number, z: number): DeadLimb => {
  const d = Math.hypot(x, z), k = (2 * d - 0.09) / d;
  return { line: [[0, y, 0, 0.035], [x * k, y + 0.04, z * k, 0]], sides: 4, part: "dark" };
};
/** The game's dead trees' wood at its size (its MatureDead models' trunks and limbs, read as slices: each slice's middle
 *  and its mean distance from it, numbers only), in both looks: the pine a pole 0.12 thick at its foot and 0.06 near its
 *  top, broken off askew at 2.37, with five stubs; the birch a trunk forking at 0.4 into two limbs that rise near upright,
 *  0.25 apart, to 1.39; the oak a trunk 0.27 at its flared foot and 0.15 at 1.0, splitting into three limbs broken off
 *  at 1.33, 0.3 out, a pale broken twig on each to 1.53 (its twig cards, cut by their texture's alpha to a sixth of
 *  their area). Until 2026-11-10 ours were half as thick, so they covered 0.4 to 0.7 of what the game's do from the
 *  widest views, and the dead birches' white read faint on the dry ground (fix/dry-widest, docs/progress/3d-view.md). */
export const DEAD_LIMBS: Readonly<Record<"Pine" | "Birch" | "Oak", readonly DeadLimb[]>> = {
  Pine: [
    { line: [[0, 0, 0, 0.12], [0, 0.3, 0, 0.1], [0.01, 2.0, 0, 0.06], [0.08, 2.368, -0.04, 0]], sides: 6, part: "wood" },
    stub(0.1, 1.06, -0.11),
    stub(-0.17, 0.6, 0.04),
    stub(0.13, 0.73, 0.07),
    stub(-0.09, 0.89, -0.1),
    stub(-0.02, 1.21, 0.12),
  ],
  Birch: [
    { line: [[0, 0, 0, 0.073], [-0.01, 0.42, 0, 0.05]], sides: 6, part: "wood", cap: "wood" },
    { line: [[-0.01, 0.42, 0, 0.048], [-0.1, 1.0, 0, 0.032], [-0.05, 1.387, 0.01, 0]], sides: 5, part: "wood" },
    { line: [[0, 0.39, 0.02, 0.046], [0.12, 1.0, 0.1, 0.036], [0.13, 1.38, 0.08, 0]], sides: 5, part: "wood" },
  ],
  Oak: [
    // (its trunk's top broken pale; each limb's broken end a pale twig, which closes it)
    { line: [[0, 0, 0, 0.27], [0, 0.2, 0, 0.21], [0, 0.97, 0, 0.148]], sides: 5, part: "wood", cap: "break" },
    ...([[-0.24, 0.14], [0.22, 0.18], [0.04, -0.3]] as const).map(([x, z]): DeadLimb => ({
      line: [[x * 0.25, 0.92, z * 0.25, 0.08], [x, 1.33, z, 0.045], [x * 1.25, 1.533, z * 1.25, 0]],
      sides: 4,
      part: "wood",
      tip: "break",
    })),
  ],
};

/** A living bark colour of `species` as its dead wood. */
export function deadWood(species: string, bark: Rgb): [number, number, number] {
  const w = DEAD_FORM[species]?.wood ?? [1, 1, 1];
  return [Math.min(1, bark[0] * w[0]), Math.min(1, bark[1] * w[1]), Math.min(1, bark[2] * w[2])];
}

/** A living foliage colour of `species` as the dead plant's leaves: the game's dead foliage at the lightness the game's
 *  dead foliage has against its living (`DRYING`'s alive), as a dying form's colour is taken. */
export function deadLeaves(species: string, c: Rgb): [number, number, number] {
  const d = DRYING[species];
  const leaves = DEAD_FORM[species]?.leaves;
  if (!d || !leaves) return [c[0], c[1], c[2]];
  const k = luma(c) / luma(d.alive);
  return [Math.min(1, leaves[0] * k), Math.min(1, leaves[1] * k), Math.min(1, leaves[2] * k)];
}

/** Any colour of a dead succulent: the living one's by the game's ratio. */
export function deadRatio(species: string, c: Rgb): [number, number, number] {
  const r = DEAD_FORM[species]?.ratio ?? [1, 1, 1];
  return [c[0] * r[0], c[1] * r[1], c[2] * r[2]];
}
