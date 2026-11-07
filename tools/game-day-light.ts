// The game's light by the time of day (Timberborn 1.1.2.x, read from its files, never run), for the pixel judge
// (tools/water-pixel-judge.ts): the editor draws the day's light alone (D497), but the probe's shots fall at whatever
// hour their moment does, and the game's light changes through the day.
//
// The game (decompiled `Timberborn.SkySystem` `DayStageCycle`, `Sun.UpdateColors` and `UpdateRotation`;
// `Timberborn.TimeSystem` `DayNightCycle`): a day is 24 hours, the first 16 daytime (`DayNightCycle.blueprint`
// `ConfiguredDaytimeLengthInHours`). Its four stages' colours are `Sun.blueprint`'s `SunriseColors`, `DayColors`,
// `SunsetColors` and `NightColors`. In daytime, for its first 2 hours (`DayStageCycle.blueprint`
// `SunriseSunsetLengthInHours`) the stage is Sunrise turning to Day, then Day turning to Sunset; at night, Sunset turning
// to Night, then Night turning to Sunrise. Each turn takes the last hour before the next stage
// (`TransitionLengthInHours` 1), by smoothstep. The sun's colour, intensity, height (`SunXAngle`) and shadow strength,
// the Trilight's three colours and the fog's colour (the stage's temperate fog, or its hazard's on a hazardous day) are
// each blended by it. Every stage's reflection intensity is 1 and every fog's density 0.003.

import { trilightSH } from "../src/render3d/palette";

import type { Rgb } from "../src/render3d/waterPalette";

interface Stage {
  sun: Rgb;
  intensity: number;
  angle: number;
  shadow: number;
  sky: Rgb;
  equator: Rgb;
  ground: Rgb;
  fog: { temperate: Rgb; drought: Rgb; badtide: Rgb };
}

/** `Sun.blueprint.json`'s four stages (Timberborn 1.1.2.8). */
export const DAY_STAGES: Record<"sunrise" | "day" | "sunset" | "night", Stage> = {
  sunrise: {
    sun: [1, 0.9294118, 0.8],
    intensity: 1.2,
    angle: 32,
    shadow: 1,
    sky: [0.09758736, 0.3005438, 0.4793202],
    equator: [1, 0.783538, 0.5088814],
    ground: [1, 0.48515, 0],
    fog: { temperate: [0.682353, 0.6705883, 0.6705883], drought: [0.8156863, 0.7098039, 0.4980392], badtide: [0.8, 0.5607843, 0.4823529] },
  },
  day: {
    sun: [1, 0.9625, 0.85],
    intensity: 1.1,
    angle: 45,
    shadow: 1,
    sky: [0.6239606, 0.6307573, 0.9734455],
    equator: [1, 1, 1],
    ground: [0.2831488, 0.2269659, 0.3712378],
    fog: { temperate: [0.4470589, 0.7607844, 0.8235295], drought: [0.7058824, 0.5490196, 0.3764706], badtide: [0.6980392, 0.4392157, 0.3490196] },
  },
  sunset: {
    sun: [1, 0.8313726, 0.5137255],
    intensity: 1.3,
    angle: 30,
    shadow: 1,
    sky: [0.6509434, 0.12589, 0.3709472],
    equator: [1, 0.4677838, 0.3813261],
    ground: [1, 0.6724433, 0.2788943],
    fog: { temperate: [0.8392158, 0.6156863, 0.6470588], drought: [0.8392158, 0.6980392, 0.6156863], badtide: [0.8, 0.6196079, 0.5607843] },
  },
  night: {
    sun: [0, 0.3254902, 1],
    intensity: 1.2,
    angle: 45,
    shadow: 0.5,
    sky: [0.2581829, 0.4072403, 1],
    equator: [0.5394797, 0.5583406, 0.9046614],
    ground: [0.09254902, 0.105882354, 0.05882353],
    fog: { temperate: [0, 0.3960785, 0.7450981], drought: [0.4, 0.4, 0.4], badtide: [0.5019608, 0.4509804, 0.4509804] },
  },
};

const DAYTIME = 16;
const SUNRISE_SUNSET = 2;
const TRANSITION = 1;

export type Hazard = "drought" | "badtide" | null;

/** The game's light at a moment: the sun (colour × intensity, its height in degrees, its shadow's strength), the
 *  Trilight's irradiance SH and the fog's colour, with the stages it falls between. */
export interface DayLight {
  label: string;
  sun: Rgb;
  angle: number;
  shadow: number;
  sh: { c0: Rgb; c1: Rgb; c2: Rgb };
  fog: Rgb;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** The light at a partial day number (the probe's `day`: whole days plus the day's progress) in the weather then (a
 *  hazard, or null for temperate; the next stage's at a turn into Sunrise is taken as the same). */
export function dayLight(day: number, hazard: Hazard): DayLight {
  const h = (day - Math.floor(day)) * 24;
  let from: keyof typeof DAY_STAGES;
  let to: keyof typeof DAY_STAGES;
  let hoursToNext: number;
  if (h < DAYTIME) {
    if (h < SUNRISE_SUNSET) [from, to, hoursToNext] = ["sunrise", "day", SUNRISE_SUNSET - h];
    else [from, to, hoursToNext] = ["day", "sunset", DAYTIME - h];
  } else if (h - DAYTIME < SUNRISE_SUNSET) [from, to, hoursToNext] = ["sunset", "night", SUNRISE_SUNSET - (h - DAYTIME)];
  else [from, to, hoursToNext] = ["night", "sunrise", 24 - h];
  const x = 1 - Math.min(1, Math.max(0, hoursToNext / TRANSITION));
  const t = x * x * (3 - 2 * x);
  const a = DAY_STAGES[from];
  const b = DAY_STAGES[to];
  const weather = hazard ?? "temperate";
  const sun = lerp3(a.sun, b.sun, t).map((v) => v * lerp(a.intensity, b.intensity, t)) as unknown as Rgb;
  const lin = (c: Rgb) => c.map(toLinear) as unknown as Rgb;
  return {
    label: t <= 0.001 ? from : t >= 0.999 ? to : `${from} ${Math.round((1 - t) * 100)}% / ${to} ${Math.round(t * 100)}%`,
    sun,
    angle: lerp(a.angle, b.angle, t),
    shadow: lerp(a.shadow, b.shadow, t),
    sh: trilightSH(lin(lerp3(a.sky, b.sky, t)), lin(lerp3(a.equator, b.equator, t)), lin(lerp3(a.ground, b.ground, t))),
    fog: lerp3(a.fog[weather], b.fog[weather], t),
  };
}
