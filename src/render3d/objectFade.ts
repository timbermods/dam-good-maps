// Seeing the land behind objects while editing (an editing aid in its own channel, D496/D497's rule: the look itself
// never changes). Two parts, both the renderer's (`MapRenderer.setObjectFade`, `setObjectsHidden`), the page wiring them:
// - **Fade near the pointer:** every object whose place (its instance's origin, so a whole tree fades together) is within
//   a region round the pointer shows only OBJECT_FADE of itself and casts no shadow there. One uniform (`objectFade`),
//   read by the one object program every look draws its objects with (materials.ts `objectMaterial`: Standard's, High's
//   object, vegetation, landmark and slope, the light look's), so moving the region costs a uniform write, and nothing
//   at all while it is off (a branch on the uniform). Where the canvas is multisampled the object's alpha goes to
//   coverage (the object already draws with alpha to coverage): a quarter of each pixel's samples, a smooth see-through
//   that sorts with nothing and composites with the water and the cutaway as any opaque object does; elsewhere (the
//   light look's software drawing) a 4 × 4 screen-door dither. High's sun shadows drop the faded objects by the same
//   test in their depth pass (shadows.ts), redrawn when the region moves; the baked shadows are cast again round the
//   region without them (`shadowDropped` per tile), once a frame, only where the dropped tiles changed.
// - **Hide all:** the objects' group is not drawn, casts no shadow and shades no ground, while held.
// Pictures (the map's picture, a sized one, the shelf's icons) never show either: they are drawn on a renderer of their
// own (hero.ts) or with the fade put off for the picture (`MapRenderer.thumbnail`).

/** A region round the pointer, in tiles of the map (x east, y south, tile i spanning i to i + 1, as the brush cursor's). */
export interface FadeRegion {
  x: number;
  y: number;
  radius: number;
}

/** How much of an object shows inside the region. */
export const OBJECT_FADE = 0.25;
/** Past the radius objects come back to full over this many tiles (no hard line where the region ends). */
export const OBJECT_FADE_EDGE = 1;

/** How the fade is drawn (`objectFade.w`): off, as coverage (a multisampled canvas), as a dither (otherwise). */
export const FADE_OFF = 0;
export const FADE_COVERAGE = 1;
export const FADE_DITHER = 2;

/** How much of an object standing at (x, y) (tiles) shows with this region: OBJECT_FADE within the radius, rising
 *  smoothly to 1 over OBJECT_FADE_EDGE past it, 1 with no region. The object program's `objectFadeAt` is the same. */
export function objectFadeAt(region: FadeRegion | null, x: number, y: number): number {
  if (!region) return 1;
  const d = Math.hypot(x - region.x, y - region.y);
  const t = Math.min(1, Math.max(0, (d - region.radius) / OBJECT_FADE_EDGE));
  return OBJECT_FADE + (1 - OBJECT_FADE) * t * t * (3 - 2 * t);
}

/** Whether an object at (x, y) casts no shadow with this region: those faded more than halfway. */
export function shadowDropped(region: FadeRegion | null, x: number, y: number): boolean {
  return objectFadeAt(region, x, y) < (1 + OBJECT_FADE) / 2;
}

/** Whether a region is one the renderer takes: finite, the radius not negative. */
export function validRegion(r: FadeRegion | null): boolean {
  return r === null || (Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.radius) && r.radius >= 0);
}

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));

/** The GLSL of `objectFadeAt` and `shadowDropped` (the uniform `objectFade`: the region's middle in tiles, its radius,
 *  and FADE_* in w; `at` an object's origin in tiles). */
export const OBJECT_FADE_GLSL = /* glsl */ `
      uniform vec4 objectFade;
      float objectFadeAt(vec2 at) {
        return mix(${f(OBJECT_FADE)}, 1.0, smoothstep(objectFade.z, objectFade.z + ${f(OBJECT_FADE_EDGE)}, distance(at, objectFade.xy)));
      }
      bool shadowDropped(vec2 at) {
        return objectFade.w > 0.5 && objectFadeAt(at) < ${f((1 + OBJECT_FADE) / 2)};
      }
`;

/** A 4 × 4 ordered dither's threshold at a pixel (0–1, each of the 16 once): a pixel with alpha a is kept where a is
 *  above it, so a quarter of them at 0.25, evenly spread. */
export const DITHER_GLSL = /* glsl */ `
      float ditherAt(vec2 p) {
        ivec2 q = ivec2(mod(p, 4.0));
        int i = q.x + q.y * 4;
        int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
        return (float(b[i]) + 0.5) / 16.0;
      }
`;
