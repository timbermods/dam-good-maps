// The 3D view's water in one place (PLAN §20 D177): clean water's and badwater's colours, their
// opacity by depth, how water turns from clean to bad with its badwater share (the contamination
// blend), and how the colours are calibrated on screen. The Standard look's water shader reads it
// through `WATER_GLSL` (generated from these values; the Light look runs the same shader code),
// the legend and the tests read the values, and Map look 2's High shader is to read it when it
// adopts #38, so the looks never drift apart. No other module defines a water colour
// (tests/unit/water-palette.test.ts). The 2D preview and the map file's thumbnail keep their own
// schematic colours; they are not the 3D view.
//
// Badwater is #38's, as Kyler approved it (the High prototype at e63a3ff): a crimson, matte,
// nearly opaque body with darker troughs and subdued streaks, see-through only at its shallow
// edges. Its on-screen colours are #38's calibration targets (`WATER_CALIBRATION`); the inputs here
// are calibrated so the Standard look lands on them. Colours are display values, before the light.
//
// Pure TypeScript, no three.js.

export type Rgb = readonly [number, number, number];

/** Badwater's crimson body (calibrated to #38's targets). */
const BAD_BODY: Rgb = [0.431, 0.204, 0.18];

export const WATER = {
  /** Clean water, as in the game (Kyler's clean look): clear in the shallows, where the bed shows
   *  through a light teal tint, and a deep teal body darkening to navy with depth. The body may be
   *  as dark as dry ground or darker; water reads as water by its shore foam, glints, ripples and
   *  see-through shallows, and badwater stays darker. */
  shallow: [0.36, 0.6, 0.64] as Rgb,
  /** The ripples' lit crests, where they catch the sky: the lightest the water gets. */
  crest: [0.26, 0.5, 0.62] as Rgb,
  /** The body of water a level or so deep. */
  teal: [0.09, 0.23, 0.25] as Rgb,
  /** The body of deep water. */
  navy: [0.07, 0.15, 0.2] as Rgb,
  foam: [0.9, 0.94, 0.95] as Rgb,
  /** The sky the water reflects (clean water's pale flow streaks are this, a little darker). */
  sky: [0.6, 0.72, 0.84] as Rgb,
  /** Badwater's body in its usual shallow pools (`BADWATER.shallow` deep or less), crimson,
   *  matte and nearly opaque; deeper it darkens toward `badDeep` (Kyler's option A), so it stays
   *  darker than clean water of the same depth. */
  bad: BAD_BODY,
  badDeep: [0.14, 0.066, 0.058] as Rgb,
  /** Badwater's darker troughs, in the ripples' low parts (`BADWATER.trough` of the way), and
   *  its subdued, lighter flow streaks; both in its shallows, darkening with depth as the body. */
  badTrough: [0.332, 0.163, 0.145] as Rgb,
  badStreak: [0.478, 0.266, 0.22] as Rgb,
  /** Badwater's slow glowing bubbles, denser the more of the water is bad. */
  badVein: [0.98, 0.5, 0.16] as Rgb,
  /** Foam on badwater: along its shores and below its falls. */
  badFoam: [0.66, 0.5, 0.36] as Rgb,
  /** The hues water partly bad passes through on its way from clean water's teal to badwater's
   *  crimson (`WATER_BLEND`; only their hues count, not their lightness): the game's measured
   *  mixing zone (#2E444C), a desaturated teal-grey, then a warm brown. The brown leans a little
   *  yellow, so the way from the teal-grey to it never passes through purple or mauve. */
  mixing: [0.18, 0.267, 0.298] as Rgb,
  warm: [0.439, 0.314, 0.204] as Rgb,
  /** Clear water (`CLEAR_WATER`): clean water's faint blue tint over the bed, and the soft bright
   *  line along its shore. */
  clearTint: [0.22, 0.53, 0.9] as Rgb,
  clearShore: [0.85, 0.94, 1.0] as Rgb,
} as const;

/** The editor's marks for water, not water itself: the brush ring's water-blue when smart Lower
 *  carves a bed the water follows (D198) and the thin dark outline every ring has, so it holds on
 *  bright shallows and pale ground (checked in greyscale and three colour-blindness simulations,
 *  tests/unit/brush-ring.test.ts); and the glow of the sources feeding the water under the pointer
 *  (D196). */
export const WATER_UI = {
  ring: [0.35, 0.82, 1.0] as Rgb,
  ringEdge: [0.0, 0.01, 0.03] as Rgb,
  sourceGlow: [1.0, 0.93, 0.55] as Rgb,
} as const;

/** Clean water's surface, as the water shader draws it: foam along the shore and broken foam
 *  just off it, glints on the ripples, and shallows clear enough to see the bed through, the more
 *  so toward the banks. */
export const WATER_SURFACE = {
  /** Foam: the line along the shore, and the broken foam just off it. */
  shoreFoam: 0.7,
  brokenFoam: 0.6,
  /** Glints of light on the ripples (up close). */
  glints: 0.6,
  /** Opacity where the water is shallowest, and where it is deep; the water's side at the map's
   *  edge. */
  clearest: 0.3,
  deepest: 0.93,
  edge: 0.85,
  /** At a bank the water is this share of its depth, deepening over this far from it (tiles). */
  bank: 0.3,
  bankWidth: 0.45,
  /** How quickly clean water turns from its clear shallows to its teal body (per level), and
   *  between which depths the teal turns navy. */
  absorb: 4,
  navyFrom: 0.6,
  navyTo: 2.8,
  /** How strongly the ripples' crests, the sky's reflection, the pale flow streaks and the sun's
   *  glint show. */
  crest: 0.3,
  reflect: 0.35,
  pale: 0.22,
  spec: 0.5,
} as const;

/** Clear water (D196, D212): the water see-through, so the bed, ledges and sources show; under and
 *  right round the brush while it paints a submerged bed, or the whole map with T. Clean water
 *  still reads as water: a faint blue tint (`WATER.clearTint`), its ripples catching the light and
 *  a soft bright line along its shore (`WATER.clearShore`), never pale grey glass. Badwater keeps
 *  its own colour, half see-through, with dark diagonal stripes: a pattern, so it stays apart from
 *  clean water in greyscale and every colour-blindness. */
export const CLEAR_WATER = {
  /** Clean water's opacity, and how much more its ripples' crests and glints take. */
  opacity: 0.13,
  ripple: 0.1,
  /** How far the crests turn toward the shore's light. */
  rippleLight: 0.3,
  /** The line along the shore: its opacity, and its width (a share of a tile). */
  shoreOpacity: 0.6,
  shoreWidth: 0.2,
  /** Badwater's opacity, and how dark its stripes are (a share of its colour). */
  badOpacity: 0.62,
  stripe: 0.45,
  /** Round the brush, the clear water fades back to normal over this many tiles. */
  fade: 1.5,
} as const;

/** Badwater's depth, opacity and surface. */
export const BADWATER = {
  /** Down to this depth (levels) badwater shows `WATER.bad`; below it, it darkens toward
   *  `WATER.badDeep`, this quickly (per level): Kyler's option A. */
  shallow: 0.25,
  absorb: 1.85,
  /** Its opacity, #38's (`badwaterOpacity`): nearly opaque, `opacity` from `opacityFrom` to
   *  `opacityTo` levels deep (by #38's own depth near a bank: this share of it at the bank, deepening
   *  over `bankWidth`), less by `edge` at its shallow edges (depths `edgeDepth`, `edgeShore` tiles
   *  from a bank, where the poisoned bed shows), and at least `grazing` of the way to opaque when
   *  seen at a grazing angle. At the map's edge, the water's side. */
  opacity: [0.975, 0.995] as readonly [number, number],
  opacityFrom: 0.25,
  opacityTo: 1.8,
  bank: 0.1,
  bankWidth: 0.55,
  edge: 0.52,
  edgeDepth: [0.03, 0.18] as readonly [number, number],
  edgeShore: [0.04, 0.3] as readonly [number, number],
  grazing: 0.85,
  side: 0.95,
  /** Its matte surface (#38's): how far the troughs and the subdued flow streaks turn toward their
   *  colours, and how little of the sky's reflection, the sun's glint and the glints shows (a
   *  twelfth of clean water's glints and glint, and a trace of the sky), and its bubbles' glow. */
  trough: 1,
  streak: 1,
  reflect: 0.03,
  spec: 0.04,
  glints: 0.028,
  bubbles: 0.55,
} as const;

/** How water turns from clean to bad with its badwater share `s` (0–1, blended between tiles by
 *  the water mesh), in parts that each follow their own curve (in linear light, so greyscale
 *  darkens at every step):
 *  - it darkens in proportion: its luminance goes from clean water's to badwater's by s^darken;
 *  - its hue (the colour over its luminance) turns early, along a path 1 - (1 - s)^hue of the way:
 *    from clean water's teal to the mixing zone's teal-grey (`WATER.mixing`, reached at `mixing` of
 *    the way), to the warm brown (`WATER.warm`, at `warm`), then to badwater's crimson, so mixed
 *    water goes teal, warm brownish, crimson, never purple; a tenth bad already reads warm, and pure
 *    badwater is exactly its body;
 *  - it grows murky: opacity, by s^opacity;
 *  and badwater's dull surface (fewer glints and crests, its streaks, foam and bubbles) comes in
 *  by s^surface. Clean water (s = 0) is exactly clean water. */
export const WATER_BLEND = { darken: 1, hue: 6, mixing: 0.2, warm: 0.5, opacity: 0.5, surface: 0.75 } as const;

/** How the water's colours are measured on screen, as #38's colour check does
 *  (investigation/maplook2/colour-check.mjs), and what they should measure. `npx tsx
 *  tools/capture-badwater.ts --measure` runs it: a bed of water one badwater share and one depth
 *  all over, its soil as contaminated as the water, drawn by the site's renderer on the GPU (a
 *  browser that draws in software gets the Light look), the camera orbiting at `pitch` (70° down,
 *  or lower), yaw −0.55 and 44 away, the water held at 8 s; the central patch's pixels sorted by
 *  r + 2g + b and each band's mean. Every target must land within `tolerance`. */
export const WATER_CALIBRATION = {
  method: {
    viewport: [1440, 940] as readonly [number, number],
    bed: 64,
    yaw: -0.55,
    distance: 44,
    time: 8,
    patch: [240, 96] as readonly [number, number],
    bands: { trough: [0.05, 0.15], body: [0.15, 0.4], typical: [0.45, 0.55], streak: [0.96, 0.985] } as Record<string, readonly [number, number]>,
    /** Codes a measured band may be off its target, per channel. */
    tolerance: 2,
  },
  /** On-screen targets (0–255): badwater's are #38's, as Kyler approved them (its check:colour
   *  at e63a3ff: the typical texture, the troughs and the streaks of pure badwater a quarter level
   *  deep over a poisoned bed); clean water's are the Standard look as approved (they hold it
   *  still). */
  targets: [
    { name: "badwater, a quarter level deep, 70° down (#38)", share: 1, depth: 0.25, pitch: 1.22, bands: { typical: [110, 52, 49], trough: [94, 46, 43], streak: [124, 69, 56] } },
    { name: "clean water, a quarter level deep, 70° down", share: 0, depth: 0.25, pitch: 1.22, bands: { body: [64, 98, 106] } },
    { name: "clean water, 1.25 deep, 70° down", share: 0, depth: 1.25, pitch: 1.22, bands: { body: [33, 67, 79] } },
    { name: "clean water, 4.25 deep, 70° down", share: 0, depth: 4.25, pitch: 1.22, bands: { body: [29, 53, 69] } },
  ] as readonly { name: string; share: number; depth: number; pitch: number; bands: Record<string, readonly [number, number, number]> }[],
  /** The ground level under a bed of water this deep (so the camera sees the same scene as #38's). */
  floor(depth: number): number {
    return depth <= 0.25 ? 8 : depth <= 1.25 ? 7 : 4;
  },
} as const;

// ------------------------------------------------------------------------------ the colours

/** Luminance weights (Rec. 709, linear light): the lightness the blend keeps apart from hue. */
const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
const luma = (c: Rgb) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
/** Display values to linear light and back (sRGB). */
const toLinear = (c: Rgb): Rgb => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as unknown as Rgb;
const toDisplay = (c: Rgb): Rgb => c.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)) as unknown as Rgb;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Clean water's depth as its colour and opacity see it, `fromBank` tiles from a bank. */
function seenDepth(depth: number, fromBank: number): number {
  const S = WATER_SURFACE;
  return depth * (S.bank + (1 - S.bank) * smooth(0, S.bankWidth, fromBank));
}

const absorbed = (d: number) => 1 - Math.exp(-d * WATER_SURFACE.absorb);

/** Clean water's body `depth` levels deep, `fromBank` tiles from a bank (open water by default). */
export function cleanWaterBody(depth: number, fromBank = 1): Rgb {
  const S = WATER_SURFACE;
  const d = seenDepth(depth, fromBank);
  return mixRgb(mixRgb(WATER.shallow, WATER.teal, absorbed(d)), WATER.navy, smooth(S.navyFrom, S.navyTo, d));
}

/** Badwater's body `depth` levels deep: `WATER.bad` in its shallows, darker below them. */
export function badwaterBody(depth: number): Rgb {
  return mixRgb(WATER.bad, WATER.badDeep, 1 - Math.exp(-Math.max(0, depth - BADWATER.shallow) * BADWATER.absorb));
}

/** The blend's curves at a badwater share (0–1): how far the lightness, the hue (along its path)
 *  the opacity and the surface have turned toward badwater's. */
export function waterBlend(share: number): { darken: number; hue: number; opacity: number; surface: number } {
  const s = Math.max(0, Math.min(1, share));
  const B = WATER_BLEND;
  if (s === 0) return { darken: 0, hue: 0, opacity: 0, surface: 0 };
  return { darken: s ** B.darken, hue: 1 - (1 - s) ** B.hue, opacity: s ** B.opacity, surface: s ** B.surface };
}

/** A colour's hue in linear light: the colour over its luminance. */
const hueOf = (c: Rgb): Rgb => {
  const l = Math.max(luma(c), 1e-5);
  return [c[0] / l, c[1] / l, c[2] / l];
};

/** Water between a clean colour and a bad one at a badwater share, as `WATER_BLEND` says, in
 *  linear light: its luminance darkens in proportion; its hue goes from clean water's through the
 *  mixing zone's and the warm brown's to badwater's. */
export function blendWater(clean: Rgb, bad: Rgb, share: number): Rgb {
  if (!(share > 0)) return clean;
  if (share >= 1) return bad;
  const B = WATER_BLEND;
  const k = waterBlend(share);
  const cl = toLinear(clean);
  const bl = toLinear(bad);
  const yc = luma(cl);
  const y = yc + (luma(bl) - yc) * k.darken;
  const p = k.hue;
  const mixing = hueOf(toLinear(WATER.mixing));
  const warm = hueOf(toLinear(WATER.warm));
  const h = p < B.mixing ? mixRgb(hueOf(cl), mixing, p / B.mixing) : p < B.warm ? mixRgb(mixing, warm, (p - B.mixing) / (B.warm - B.mixing)) : mixRgb(warm, hueOf(bl), (p - B.warm) / (1 - B.warm));
  return toDisplay([Math.max(0, y * h[0]), Math.max(0, y * h[1]), Math.max(0, y * h[2])]);
}

/** The body colour of water `depth` levels deep, `fromBank` tiles from a bank (open water by
 *  default), clean (false), pure badwater (true) or with a badwater share (0–1): before the light,
 *  the ripples, the foam and the glints (as the shader). */
export function waterBody(depth: number, bad: boolean | number, fromBank = 1): Rgb {
  const share = bad === true ? 1 : bad === false ? 0 : bad;
  return blendWater(cleanWaterBody(depth, fromBank), badwaterBody(depth), share);
}

/** Badwater's opacity `depth` levels deep, `fromBank` tiles from a bank, seen at `facing` (the
 *  view's height over the water: 1 from straight above, 0 edge-on), as #38's `badwaterOpacity`. */
export function badwaterOpacity(depth: number, fromBank = 1, facing = 1): number {
  const B = BADWATER;
  const d = depth * (B.bank + (1 - B.bank) * smooth(0, B.bankWidth, fromBank));
  const edge = (1 - smooth(B.edgeDepth[0], B.edgeDepth[1], d)) * (1 - smooth(B.edgeShore[0], B.edgeShore[1], fromBank));
  const grazing = 1 - smooth(0.18, 0.5, facing);
  return Math.max(B.opacity[0] + (B.opacity[1] - B.opacity[0]) * smooth(B.opacityFrom, B.opacityTo, d) - B.edge * edge, grazing * B.grazing);
}

/** The water's opacity `depth` levels deep and `fromBank` tiles from a bank, with a badwater share
 *  (clean by default): see-through in clean shallows and toward the banks, murkier the more of it
 *  is bad (as the shader, before foam and glints). */
export function waterOpacity(depth: number, fromBank = 1, share = 0, facing = 1): number {
  const S = WATER_SURFACE;
  const a = absorbed(seenDepth(depth, fromBank));
  const clean = S.clearest + (S.deepest - S.clearest) * a;
  return clean + (badwaterOpacity(depth, fromBank, facing) - clean) * waterBlend(share).opacity;
}

// ------------------------------------------------------------------------------ the shader's copy

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1000) / 1000)).join(", ")})`;

/** The same values and functions in GLSL, for every water shader: the colours as constants, and
 *  clean water's body and opacity, badwater's, and the blend between them. */
export const WATER_GLSL = /* glsl */ `
  #define WATER_SHALLOW ${glColor(WATER.shallow)}
  #define WATER_CREST ${glColor(WATER.crest)}
  #define WATER_TEAL ${glColor(WATER.teal)}
  #define WATER_NAVY ${glColor(WATER.navy)}
  #define WATER_FOAM ${glColor(WATER.foam)}
  #define WATER_SKY ${glColor(WATER.sky)}
  #define WATER_PALE (WATER_SKY * 0.85)
  #define BADWATER_BODY ${glColor(WATER.bad)}
  #define BADWATER_DEEP ${glColor(WATER.badDeep)}
  #define BADWATER_TROUGH ${glColor(WATER.badTrough)}
  #define BADWATER_STREAK ${glColor(WATER.badStreak)}
  #define BADWATER_VEIN ${glColor(WATER.badVein)}
  #define BADWATER_FOAM ${glColor(WATER.badFoam)}
  #define WATER_SOURCE_GLOW ${glColor(WATER_UI.sourceGlow)}
  #define WATER_MIXING ${glColor(WATER.mixing)}
  #define WATER_CLEAR_TINT ${glColor(WATER.clearTint)}
  #define WATER_CLEAR_SHORE ${glColor(WATER.clearShore)}
  #define CLEAR_OPACITY ${f(CLEAR_WATER.opacity)}
  #define CLEAR_RIPPLE ${f(CLEAR_WATER.ripple)}
  #define CLEAR_RIPPLE_LIGHT ${f(CLEAR_WATER.rippleLight)}
  #define CLEAR_SHORE_OPACITY ${f(CLEAR_WATER.shoreOpacity)}
  #define CLEAR_SHORE_WIDTH ${f(CLEAR_WATER.shoreWidth)}
  #define CLEAR_BAD_OPACITY ${f(CLEAR_WATER.badOpacity)}
  #define CLEAR_STRIPE ${f(CLEAR_WATER.stripe)}
  #define CLEAR_FADE ${f(CLEAR_WATER.fade)}
  #define WATER_WARM ${glColor(WATER.warm)}
  #define WATER_CREST_AMOUNT ${f(WATER_SURFACE.crest)}
  #define WATER_REFLECT ${f(WATER_SURFACE.reflect)}
  #define WATER_PALE_AMOUNT ${f(WATER_SURFACE.pale)}
  #define WATER_SPEC ${f(WATER_SURFACE.spec)}
  #define WATER_EDGE ${f(WATER_SURFACE.edge)}
  #define BADWATER_TROUGH_AMOUNT ${f(BADWATER.trough)}
  #define BADWATER_STREAK_AMOUNT ${f(BADWATER.streak)}
  #define BADWATER_REFLECT ${f(BADWATER.reflect)}
  #define BADWATER_SPEC ${f(BADWATER.spec)}
  #define BADWATER_GLINTS ${f(BADWATER.glints)}
  #define BADWATER_BUBBLES ${f(BADWATER.bubbles)}
  #define BADWATER_SIDE ${f(BADWATER.side)}
  /** Clean water's depth as its colour and opacity see it, by how far the point is from a shore. */
  float waterSeenDepth(float depth, float shore) {
    return depth * mix(${f(WATER_SURFACE.bank)}, 1.0, smoothstep(0.0, ${f(WATER_SURFACE.bankWidth)}, shore));
  }
  float waterAbsorb(float d) {
    return 1.0 - exp(-d * ${f(WATER_SURFACE.absorb)});
  }
  vec3 cleanWaterBody(float d, float absorb) {
    return mix(mix(WATER_SHALLOW, WATER_TEAL, absorb), WATER_NAVY, smoothstep(${f(WATER_SURFACE.navyFrom)}, ${f(WATER_SURFACE.navyTo)}, d));
  }
  float cleanWaterAlpha(float absorb) {
    return mix(${f(WATER_SURFACE.clearest)}, ${f(WATER_SURFACE.deepest)}, absorb);
  }
  vec3 badwaterBody(float depth) {
    return mix(BADWATER_BODY, BADWATER_DEEP, 1.0 - exp(-max(0.0, depth - ${f(BADWATER.shallow)}) * ${f(BADWATER.absorb)}));
  }
  /** A badwater colour (its troughs, its streaks) darkened with depth as its body is. */
  vec3 badwaterShade(vec3 c, float depth) {
    return c * badwaterBody(depth) / BADWATER_BODY;
  }
  /** How edge-on the water is seen (1 at a grazing angle), as #38 has it. */
  float waterGrazing(vec3 V, vec3 N) {
    return 1.0 - smoothstep(0.18, 0.5, clamp(V.y + (N.x + N.z) * 0.05, 0.0, 1.0));
  }
  /** Badwater's opacity (#38's badwaterOpacity): nearly opaque, less at its shallow edges. */
  float badwaterAlpha(float depth, float shore, float grazing) {
    float d = depth * mix(${f(BADWATER.bank)}, 1.0, smoothstep(0.0, ${f(BADWATER.bankWidth)}, shore));
    float edge = (1.0 - smoothstep(${f(BADWATER.edgeDepth[0])}, ${f(BADWATER.edgeDepth[1])}, d)) * (1.0 - smoothstep(${f(BADWATER.edgeShore[0])}, ${f(BADWATER.edgeShore[1])}, shore));
    return max(mix(${f(BADWATER.opacity[0])}, ${f(BADWATER.opacity[1])}, smoothstep(${f(BADWATER.opacityFrom)}, ${f(BADWATER.opacityTo)}, d)) - ${f(BADWATER.edge)} * edge, grazing * ${f(BADWATER.grazing)});
  }
  /** The blend's opacity and surface curves at a badwater share. */
  float waterMurk(float s) {
    return s > 0.0 ? pow(min(s, 1.0), ${f(WATER_BLEND.opacity)}) : 0.0;
  }
  float waterDull(float s) {
    return s > 0.0 ? pow(min(s, 1.0), ${f(WATER_BLEND.surface)}) : 0.0;
  }
  vec3 waterToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 waterToDisplay(vec3 v) {
    return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
  }
  /** A colour's hue in linear light: the colour over its luminance. */
  vec3 waterHue(vec3 lin) {
    return lin / max(dot(lin, vec3(${LUMA.map(f).join(", ")})), 0.00001);
  }
  /** Water between clean and bad at a badwater share, in linear light: it darkens in proportion,
   *  and its hue goes early from clean water's through the mixing zone's teal-grey and a warm
   *  brown to badwater's crimson, never through purple. */
  vec3 waterBlend(vec3 clean, vec3 bad, float s) {
    if (s <= 0.0) return clean;
    if (s >= 1.0) return bad;
    vec3 cl = waterToLinear(clean);
    vec3 bl = waterToLinear(bad);
    vec3 luma = vec3(${LUMA.map(f).join(", ")});
    float y = mix(dot(cl, luma), dot(bl, luma), pow(s, ${f(WATER_BLEND.darken)}));
    float p = 1.0 - pow(1.0 - s, ${f(WATER_BLEND.hue)});
    vec3 mixing = waterHue(waterToLinear(WATER_MIXING));
    vec3 warm = waterHue(waterToLinear(WATER_WARM));
    vec3 h = p < ${f(WATER_BLEND.mixing)} ? mix(waterHue(cl), mixing, p / ${f(WATER_BLEND.mixing)})
      : p < ${f(WATER_BLEND.warm)} ? mix(mixing, warm, (p - ${f(WATER_BLEND.mixing)}) / ${f(WATER_BLEND.warm - WATER_BLEND.mixing)})
      : mix(warm, waterHue(bl), (p - ${f(WATER_BLEND.warm)}) / ${f(1 - WATER_BLEND.warm)});
    return waterToDisplay(max(y * h, 0.0));
  }
`;
