// The seasons as the game shows them (D250 as amended 2026-10-29 by planning: follows the game, D496's rule): a held
// Drought or Badtide day changes only the fog's colour (SkySystem `Sun.UpdateColorsAndRotation`: `RenderSettings.fogColor`
// from the day stage's `TemperateWeatherFog` or its hazard's `HazardousWeatherFogs`, `Sun.blueprint`; the sun's colours,
// the sky and the fog's density are the same in every weather). The ground dries by the day's own soil and the plants
// wither by the game's timers (core/sim/withering.ts); badwater and its veins are the water's and the soil's own. The
// game has no straw, heat shimmer or sickly sky, so neither do we. Both looks.

/** The fog's colour by the day's weather: the game's daytime values (`Sun.blueprint` `DayColors`). */
export const FOG = {
  temperate: [0.4470589, 0.7607844, 0.8235295],
  drought: [0.7058824, 0.5490196, 0.3764706],
  badtide: [0.6980392, 0.4392157, 0.3490196],
} as const satisfies Record<string, readonly [number, number, number]>;

/** The haze's colour on a held day of this hazard (null: none held, the temperate fog). */
export function fogOf(hazard: "drought" | "badtide" | null): readonly [number, number, number] {
  return FOG[hazard ?? "temperate"];
}
