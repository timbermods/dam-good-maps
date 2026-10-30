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
