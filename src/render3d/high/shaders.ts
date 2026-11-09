// The High look's shader additions (PLAN §20 D147, D242, D250, D284), put in at the Standard
// shaders' named points (materials.ts `ShaderHooks`). Ported from the investigations:
// - #38 (investigation/maplook2): the water shader (colour by depth, clear shallows, the calibrated crimson
//   badwater; its surface the game's flow-carried one since D496 and D497; its poisoned bed under badwater gave way
//   to the bed every look draws, D496 as amended 2026-11-07) and
//   soft shadows from the real meshes (a 2048² sun depth map, 25-tap PCF, receiver-plane bias);
// - #65 (investigation/maplook3): warm sunlight, rock strata, soil edges and colour variation (its tone
//   curve, grade and distance haze gave way to the game's fog and post chain, every look's: D497);
// - #66 (investigation/vegetation): the vegetation's material (palette regions, wrapped light, matte
//   specular) and its wind;
// - #67 (investigation/maplook-finish), stages 1–3: the diorama edge (rock beds, soil cap, water
//   section), the water's finish (a continuous crown, an irregular landing, bubbly froth, rough
//   water), the landmarks' fine detail and slopes' natural material. Stage 4's seasons (straw, a heat
//   shimmer, a sickly sky) are superseded by D250's 2026-10-29 amendment: a held day changes the haze
//   to the game's fog colour in both looks (render3d/high/seasons.ts); its dark stain on contaminated
//   soil by D334 (contamination's veins, the game's own pattern, in every look: materials.ts
//   `contaminationWeight`, soilTexture.ts).
// - Timberborn's references (D334, investigation/high-soul, adopted with the High look): exposure
//   1.00 and a restrained grade, a lower ambient-occlusion floor, olive stone (its caustics and rolling light on
//   the water gone with D334's water terms, 2026-11-07: the game's surface instead), pink highlights and (the game's own since D496's
//   amendment) the glow of shallow water partly bad, a bluer sky with fewer, larger clouds.
// Every effect has a switch (a uniform, 1 on, 0 off), so switching never recompiles a shader. The
// investigations' colours are display RGB, like the Standard shaders'. Where #65 graded the whole
// frame in a pass of its own, each High material grades its own colour at the end of `finish()`:
// the same curve and grade per pixel, without a second full-screen target (a default the session
// chose: docs/decisions-pending.md #110).

import { HIGH_WATER_GLSL, WATER_LIGHT } from "../waterPalette";
import { GAME_LIGHT, LIGHT } from "../palette";
import { RUN_LEVELS } from "../runSoil";

/** A number as GLSL writes a float. */
const g = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
import type { ShaderHooks } from "../materials";

/** The switches' uniform names (render3d/high/effects.ts maps the effects onto them). */
export const SWITCHES = [
  "hlWater",
  "hlShadows",
  "hlStrata",
  "hlVariation",
  "hlGeology",
  "hlSoilCap",
  "hlSection",
  "hlObjectDetail",
] as const;
export type Switch = (typeof SWITCHES)[number];

const switches = (names: readonly Switch[]) => `\n  uniform float ${names.join(", ")};`;

/** Soft shadows from the real meshes (#38): the sun's depth map, read as four bilinear compares (each its four
 *  texels' share the point is in front of), a receiver-plane bias so sloping surfaces don't stripe; off, the baked shadow. The taps spread so the edge
 *  is the game's in play (`LIGHT.edge` along the sun's way: about 1.4 of the game's texels; docs/progress/3d-view.md,
 *  "High's shadow edge"), never under half a texel of the map nor half a pixel of the screen. */
const SHADOW_GLSL = /* glsl */ `
  uniform sampler2D hlDepth;
  uniform mat4 hlShadowMatrix;
  uniform float hlTexel;
  /** The receiver plane's depth gradient across the depth map (its depth's change with the map's u and v), from the
   *  plane's two screen derivatives; none where the plane is seen edge-on from the sun (its uv derivatives
   *  degenerate). The divisor is the determinant only where it is not degenerate, else 1 (its quotient then unused):
   *  HLSL evaluates both sides of a choice, and a division by a determinant that may be 0 there drew D3D's
   *  "X4008: floating point division by zero" and could make NaN. */
  vec2 receiverGradient(vec3 dx, vec3 dy) {
    float determinant = dx.x * dy.y - dx.y * dy.x;
    bool solvable = abs(determinant) > 1e-10;
    vec2 gradient = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / (solvable ? determinant : 1.0);
    return solvable ? gradient : vec2(0.0);
  }
  /** The depth map's uv per tile of the world, along its u and v (the matrix's rows' scale, halved to uv). */
  vec2 hlUvPerTile() {
    return 0.5 * vec2(length(vec3(hlShadowMatrix[0][0], hlShadowMatrix[1][0], hlShadowMatrix[2][0])), length(vec3(hlShadowMatrix[0][1], hlShadowMatrix[1][1], hlShadowMatrix[2][1])));
  }
  /** The taps' half spread (uv): a 2 x 2 of bilinear compares turns from shadow to sun over about 0.8 x (a texel + the
   *  spread), so the spread that makes that the game's width across the light, at least half a texel (finer, a tap's
   *  own texels show) and half the pixel's footprint \`pixel\` (finer, a far view's edge would step). */
  vec2 hlSpread(vec2 pixel) {
    vec2 want = 0.5 * (${g(LIGHT.edge * Math.sin(LIGHT.sunElevation) / 0.8)} * hlUvPerTile() - vec2(hlTexel));
    return max(max(want, vec2(0.5 * hlTexel)), 0.5 * pixel);
  }
  /** The share of the four texels round uv the depth \`ref\` is in front of, weighted as a bilinear read (fetched, so
   *  no gradient is taken in a branch or a loop). */
  float hlCompare(vec2 uv, float ref) {
    float size = 1.0 / hlTexel;
    vec2 f = uv * size - 0.5;
    vec2 w = fract(f);
    ivec2 i = ivec2(floor(f));
    ivec2 top = ivec2(int(size) - 1);
    float a = step(ref, texelFetch(hlDepth, clamp(i, ivec2(0), top), 0).r);
    float b = step(ref, texelFetch(hlDepth, clamp(i + ivec2(1, 0), ivec2(0), top), 0).r);
    float c = step(ref, texelFetch(hlDepth, clamp(i + ivec2(0, 1), ivec2(0), top), 0).r);
    float d = step(ref, texelFetch(hlDepth, clamp(i + ivec2(1, 1), ivec2(0), top), 0).r);
    return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
  }
  /** How lit the depth map has q (uv and depth), through four bilinear compares spread h about it. */
  float hlTaps(vec3 q, vec2 gradient, float bias, vec2 h) {
    float light = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 offset = vec2(k == 0 || k == 2 ? -h.x : h.x, k < 2 ? -h.y : h.y);
      light += hlCompare(q.xy + offset, q.z + dot(gradient, offset) - bias);
    }
    return light * 0.25;
  }
  float sunLit(vec2 g, float z) {
    // (the derivatives first, outside any branch or loop; the depth read at its own level)
    vec3 n = normalize(vNormal);
    // (pushed off the surface along its normal, more the more it turns from the sun, by the depth map's texels:
    // a wall the sun grazes is drawn in the map as thin slivers of its own triangles, and with too small a push
    // it shadowed itself in their pattern, a dotted seam down a close wall; the map's texel in the world from the
    // matrix's scale, the coarser of its two axes)
    vec2 uvPerTile = hlUvPerTile();
    float texelWorld = hlTexel / min(uvPerTile.x, uvPerTile.y);
    float grazing = 1.0 - clamp(abs(dot(n, sunDir)), 0.0, 1.0);
    vec4 p = hlShadowMatrix * vec4(vWorld + n * (0.045 + 1.5 * texelWorld * grazing), 1.0);
    vec3 q = p.xyz / p.w * 0.5 + 0.5;
    vec3 dx = dFdx(q), dy = dFdy(q);
    vec2 gradient = receiverGradient(dx, dy);
    gradient = clamp(gradient, vec2(-2.0), vec2(2.0));
    // (each tap compares its four texels at its own point's depth: up to a texel off the plane)
    float bias = 0.00006 + dot(abs(gradient), vec2(hlTexel));
    vec2 h = hlSpread(max(abs(dx.xy), abs(dy.xy)));
    float lit = 1.0;
    if (hlShadows < 0.5) lit = bakedSunLit(g, z);
    else if (all(greaterThanEqual(q, vec3(0.0))) && all(lessThanEqual(q, vec3(1.0)))) lit = hlTaps(q, gradient, bias, h);
    return lit;
  }
  /** The soft shadow at a point on open ground facing up (a cave's roof line, seen from inside). */
  float hlSunAt(vec3 world) {
    vec4 p = hlShadowMatrix * vec4(world + vec3(0.0, 0.045, 0.0), 1.0);
    vec3 q = p.xyz / p.w * 0.5 + 0.5;
    if (any(lessThan(q, vec3(0.0))) || any(greaterThan(q, vec3(1.0)))) return 1.0;
    // (sunLit's receiver-plane bias, for the level plane: its derivatives are the matrix's own columns)
    vec3 dx = (hlShadowMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz * 0.5;
    vec3 dy = (hlShadowMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz * 0.5;
    vec2 gradient = receiverGradient(dx, dy);
    gradient = clamp(gradient, vec2(-2.0), vec2(2.0));
    float bias = 0.00006 + dot(abs(gradient), vec2(hlTexel));
    return hlTaps(q, gradient, bias, hlSpread(vec2(0.0)));
  }
`;

/** The hooks every lit High material shares: its shadows (the fog and the post chain are every look's, the game's:
 *  materials.ts finish). */
function lit(names: readonly Switch[], more = ""): ShaderHooks {
  return {
    decl: switches(["hlShadows", ...names]) + more,
    sunLit: SHADOW_GLSL,
  };
}

/** Objects and falls under a roof: the soft shadow of the real meshes, the roof included (off: the light volume's
 *  sun). */
const ROOFED_SUN = "(hlShadows > 0.5 ? lit : sunMarchAt(vWorld))";

// ------------------------------------------------------------------------------------ the terrain

export function terrainHooks(): ShaderHooks {
  return {
    ...lit(["hlStrata", "hlVariation", "hlGeology", "hlSoilCap", "hlWater"], /* glsl */ `
  uniform sampler2D hlFlow;
  uniform vec2 hlFlowSize;
`),
    // under a roof, the soft shadow of the real meshes, the roof included, as on the ground before it
    // (off: the march through the light volume)
    caveSun: "hlShadows > 0.5 ? sunHere : caveSunMarch(vWorld, n)",
    // under a roof, the occlusion of the open ground at the roof line its light comes in by, never more
    // than here
    caveSunOpen: "hlShadows > 0.5 ? hlSunAt(mouth.xyz) : sunLit(vec2(mouth.x, -mouth.z), mouth.y)",
    // (where grass meets earth, the game's share per tile, D135 as amended; where contamination ends, the game's blend
    // too, D154 as amended 2026-11-07, so #65's soil-edges switch, which widened it, is gone)
    moist: "clamp(s.x, 0.0, 1.0)",
    // colour variation (#65): two broad world scales on the ground's colour, not its soil
    groundVariation: /* glsl */ `
        if (hlVariation > 0.5) {
          float broad = vnoise(g * 0.043 + vec2(12.0, 33.0)) - 0.5;
          float mottling = vnoise(g * 0.317 + vec2(21.0, 8.0)) - 0.5;
          c *= 1.0 + broad * 0.15 + mottling * 0.065;
          c *= vec3(1.0 + broad * 0.055, 1.0 + broad * 0.015, 1.0 - broad * 0.045);
        }
`,
    filmBad: "(hlWater > 0.5 ? WATER_FILM_HIGH_BAD_TINT : WATER_FILM_BAD_TINT)",
    // (the scene's flow texture is High's own, hlFlow: read through it, one sampler fewer, materials.ts filmShare)
    filmShare: "texture2D(hlFlow, g / hlFlowSize).b",
    // (a still film's flow at a tile corner, as the water's vertex shader reads it: shoreFilm.ts)
    shoreFlow: "texture2D(hlFlow, P / hlFlowSize).rg",
    // rock (#65's strata, D334's stone): stones of unequal size and slope, soft mortar between them, calibrated as
    // Standard's (D497: their mean albedo the game's CliffDetail texture's, 68/62/52, tools/albedo-means.ts) and tinted
    // by the game's cliff gradient
    wall: /* glsl */ `          if (hlStrata > 0.5) {
            vec3 stone = mix(vec3(0.244, 0.233, 0.197), vec3(0.355, 0.307, 0.259), vnoise(vec2(along * 0.32, y * 0.4)));
            wc = mix(vec3(0.164, 0.15, 0.137) * cliffTint, stone * cliffTint * (0.40 + k * 0.85 + (vnoise(vec2(along * 8.1, y * 9.3)) - 0.5) * 0.13), smoothstep(0.015, 0.35, k));
          }
`,
    // the diorama edge (#67 stage 1): the map's four outer faces cut through its rock, the same
    // soft flagstones as the cliffs inland a shade darker (D334), with a soil cap and the water's section
    lit: /* glsl */ `
        bool hlCut = abs(n.y) < 0.5 && (vWorld.x < 0.003 || vWorld.x > mapSize.x - 0.003 || -vWorld.z < 0.003 || -vWorld.z > mapSize.y - 0.003);
        if (hlCut && (hlGeology > 0.5 || hlSoilCap > 0.5)) {
          float a = abs(n.x) > 0.5 ? -vWorld.z : vWorld.x;
          float y = vWorld.y;
          float grain = vnoise(vec2(a * 8.3, y * 16.7));
          if (hlGeology > 0.5) c *= 0.94;
          if (hlSoilCap > 0.5) {
            float depth = h0 - y;
            float soilDepth = 0.54 + 0.22 * vnoise(vec2(a * 1.53, 7.2));
            float cap = 1.0 - smoothstep(soilDepth - 0.12, soilDepth + 0.12, depth);
            vec3 earth = mix(vec3(0.43, 0.30, 0.18), vec3(0.63, 0.46, 0.28), grain);
            float roots = pow(1.0 - abs(sin(a * 11.3 + y * 2.7 + vnoise(vec2(a, y)) * 4.0)), 14.0);
            earth = mix(earth, vec3(0.29, 0.24, 0.14), roots * smoothstep(0.15, 0.45, depth) * 0.55);
            c = mix(c, earth, cap);
            float moistTop = grassAt(soilOf(d0));
            c = mix(c, mix(vec3(0.63, 0.53, 0.30), vec3(0.49, 0.61, 0.22), moistTop), 1.0 - smoothstep(0.015, 0.09, depth));
          }
          light = skyColor * 1.1 + sunColor * 0.50 * max(dot(n, sunDir), 0.0);
        }`,
  };
}

// -------------------------------------------------------------------------------------- the water

/** #38's water surface: the calibrated palette (waterPalette.ts HIGH_WATER, display RGB, through the renderer's light)
 *  or the game's formulas (GAME_WATER, GAME_BADWATER) × the albedo the flow carries, lit by the flow's normal (both
 *  the Standard surface's one sample: materials.ts `waterMaterial`, Q9 P5, P9 and P11), the contamination front as a
 *  continuous gradient to crimson, badwater's pattern and its glowing lines carried by the same flow. Nothing of our
 *  own besides (D496, D497). */
const WATER_FUNCTIONS = /* glsl */ `
  uniform sampler2D hlFlow;
  uniform vec2 hlFlowSize;
${HIGH_WATER_GLSL}
  /** The last measuredSurfaceWater's badwater, lit, with its glowing lines: High's own badwater, which the clear
   *  water's veil keeps (materials.ts clearBad), so the T view shows the badwater of the look it is in. */
  vec3 hlBadLit;
  /** The surface at g: N the flow's normal, albedo the flow's albedo, bpat badwater's pattern (R its base colour's, G
   *  its emissive detail's; all the Standard surface's, from its one sample). */
  vec4 measuredSurfaceWater(vec2 g, float depth, float shore, float contamination, vec3 N, vec3 V, float lit, vec3 albedo, vec2 bpat, float smoothness) {
    float bodyDepth = smoothstep(0.25, 1.25, depth);
    float deep = smoothstep(1.0, 3.5, depth);
    vec3 body = mix(mix(HW_SHALLOW, HW_BODY, bodyDepth), HW_DEEP, deep);
    // (badwater darkens with depth by the game's _DepthGradients ramp, as the Standard look's: badwaterLight; the game's
    // glow of shallow water partly bad, badwaterGlow, in place of our own red contact at the shore)
    vec3 badBody = HW_BAD * badwaterLight(depth);
    badBody = badwaterGlow(badBody, HW_BAD, depth, contamination);
    vec3 referenceLight = skyColor * 1.05 + sunColor * 0.42 * max(sunDir.y, 0.0);
    vec3 rippleLight = skyColor * 1.05 + sunColor * 0.42 * max(dot(normalize(mix(vec3(0.0, 1.0, 0.0), N, 0.35)), sunDir), 0.0) * lit;
    vec3 shade = rippleLight / max(referenceLight, vec3(0.01));
    // clean water's colour × the albedo the flow carries, as the Standard look's: ours × the albedo over its mean, or the
    // game's formula lit as the game lights it (waterPalette.ts GAME_WATER.use)
    #if WATER_FORMULA
      body = gameWaterFormula(depth, albedo, N, lit, shade);
    #else
      body *= albedo / WATER_ALBEDO_MEAN;
    #endif
    // badwater the same way, as the Standard look's (Q9 P9), by High's own choice (waterPalette.ts
    // GAME_BADWATER.use.high): the game's contaminated colour lit as the game lights it, or our crimson × its pattern's
    // variation over its mean
    #if BADWATER_FORMULA_HIGH
      badBody = gameBadwaterColour(depth, contamination, bpat.x) * gameWaterLight(N, lit) / max(shade, 0.01);
    #else
      badBody *= badwaterPatternShade(bpat.x);
    #endif
    // water partly bad as the Standard look has it (one shared blend, the game's: waterPalette.ts WATER_BLEND)
    vec3 colour = waterBlend(body, badBody, contamination);
    float tint = waterTint(contamination);
    // the game's own highlight on the ripples (its camera-tied light; WATER_SURFACE.highlight), not a sun hotspot:
    // in the colour before its light, and again after it as the game's emission, unlit and unshadowed
    #if WATER_GAME_LIGHT_HIGH
      // the game's light on its water (Q9 P15, waterPalette.ts WATER_LIGHT.game), as the Standard look draws it: the
      // highlight in the game's sun colour, lit by the game's light as the albedo it is added to; the probe by the
      // reflected direction (its head-on part where WATER_LIGHT.held); the sun's GGX glint by its shadow
      // (none where a fall lands: the game's waterfall mask, fallMask.ts, Q9 P1)
      vec3 highlight = GAME_SUN_COLOUR * waterCameraHighlight(N, V, tint) * (1.0 - waterFall);
      colour *= shade;
      colour += highlight * gameWaterLight(N, lit);
      colour += waterEnvironment(N, V, smoothness, float(WATER_HELD_HIGH));
      colour += highlight;
      colour += GAME_SUN_COLOUR * waterSunGlint(N, V, sunDir, smoothness) * lit;
    #else
      vec3 highlight = sunColor * waterCameraHighlight(N, V, tint) * (1.0 - waterFall);
      colour += highlight;
      colour *= shade;
      colour += highlight;
    #endif
    // badwater's emissive detail, unlit (the Standard look's: its glowing lines carried by the flow)
    vec3 badEmission = gameBadwaterEmission(contamination, bpat.y, g);
    colour += badEmission;
    hlBadLit = badBody * shade + badEmission;
    // the ground behind shows as the game's does, clean water and badwater alike (waterPalette.ts
    // WATER_SURFACE.seeThrough; the depth here is the one seen along the view, viewDepth.ts)
    float alpha = cleanWaterAlpha(depth);
    return vec4(colour, alpha);
  }
`;

export function waterHooks(): ShaderHooks {
  return {
    ...lit(["hlWater", "hlSection"]),
    // (after the shared palette's GLSL: the surface uses its blend)
    waterDecl: WATER_FUNCTIONS,
    // #38's water in place of the Standard surface, before clear water, the overlays, the layers
    // and the sources' upwelling with Markers on (those stay as the Standard look has them)
    water: /* glsl */ `        if (hlWater > 0.5) {
          // (the water's diffuse share and clean water's detail overlay as this look draws them: waterPalette.ts
          // WATER_LIGHT.held and .detail, materials.ts gameWaterLight, gameWaterFormula)
          #if WATER_HELD_HIGH
            gameWaterDiffuse = ${g(WATER_LIGHT.diffuse)};
          #else
            gameWaterDiffuse = ${g(GAME_LIGHT.diffuse)};
          #endif
          gameWaterDetail = float(WATER_DETAIL_HIGH);
          if (n.y > 0.5) {
            // (the share as the game blends it between tiles, the Standard surface's: materials.ts waterShareAt; under a
            // roof, its own column's, not the one of the water seen from above there)
            float hlBad = cont;
            // (the depth as the game reads it, the Standard surface's: along the view to the ground behind, viewDepth.ts)
            float hlDepth = max(0.0, d);
            // (its smoothness as the Standard surface's, by this look's badwater share: the gloss's slow variation, toward
            // badwater's by the tint × the pattern's R)
            float hlSmooth = mix(clamp(WATER_SMOOTHNESS + (gloss - 0.5) * WATER_SMOOTHNESS_SPREAD, 0.0, 1.0), BADWATER_SMOOTHNESS, waterTint(hlBad) * bpat.x);
            vec4 hlSurface = measuredSurfaceWater(g, hlDepth, shore, hlBad, N, V, lit, albedo, bpat, hlSmooth);
            // the same water at any depth: only a sliver at a shore's very edge fades in, over WATER_FILM.to
            // deep, as the Standard look's (waterPalette.ts WATER_FILM: our anti-aliasing of the edge, where the
            // game clips hard), by its own depth, not the one seen along the view; no foam, no froth, as the game draws none
            float hlFilm = waterFilm(depth);
            float hlTint = waterTint(hlBad);
            c = hlSurface.rgb;
            clearBad = hlBadLit;
            alpha = mix(min(mix(WATER_FILM_CLEAN, WATER_FILM_BAD, hlTint), hlSurface.a), hlSurface.a, hlFilm);
          } else {
            // the water's side toward lower dry ground (a fall is the water below's slope, a top: fallSlope.ts): its own
            // colour where it sees the cliff right behind (its shallowest), nearly opaque
            // (WATER_SURFACE.fallSeeThrough), no whitewater and no highlight (the game's waterfall mask takes it off,
            // Q9 P1); at the map's edge, the water's side
            float hlBad = cont;
            float hlTint = waterTint(hlBad);
            bool edge = vFlags > 254.5;
            float drop = edge ? 0.0 : vFlags / 30.0;
            // High's surface colour at its shallowest × the albedo the current carries over the lip (the Standard
            // surface's sample: the game carries its albedo by each vertex's flow, Q9 P5)
            vec3 faceLight = skyColor * 1.05 + sunColor * 0.42 * max(dot(n, sunDir), 0.0) * lit;
            #if WATER_FORMULA
              vec3 faceClean = gameWaterFormula(0.05, albedo, n, lit, faceLight);
            #else
              vec3 faceClean = HW_SHALLOW * albedo / WATER_ALBEDO_MEAN;
            #endif
            // badwater as High's surface draws it (GAME_BADWATER.use.high, the Standard look's falls too: Q9 P9, the
            // face the same surface with the same formula as the pool): the game's contaminated colour at its shallowest
            // by the pattern the current carries over the lip, lit as the game lights it, with its glowing lines
            #if BADWATER_FORMULA_HIGH
              vec3 faceBad = gameBadwaterColour(0.05, hlBad, bpat.x) * gameWaterLight(n, lit) / max(faceLight, vec3(0.01));
            #else
              vec3 faceBad = badwaterGlow(HW_BAD * badwaterLight(0.05), HW_BAD, 0.05, hlBad) * badwaterPatternShade(bpat.x);
            #endif
            vec3 face = waterBlend(faceClean, faceBad, hlBad);
            vec3 faceEmission = gameBadwaterEmission(hlBad, bpat.y, g);
            c = face * faceLight;
            #if WATER_GAME_LIGHT_HIGH
              // (lit as the game lights every pixel of its water, the Standard look's falls too: its probe and the glint)
              c += waterEnvironment(n, V, WATER_SMOOTHNESS, float(WATER_HELD_HIGH)) + GAME_SUN_COLOUR * waterSunGlint(n, V, sunDir, WATER_SMOOTHNESS) * lit;
            #endif
            c += faceEmission;
            clearBad = faceBad * faceLight + faceEmission;
            if (edge) {
              float hlAbsorb = 1.0 - exp(-max(0.0, depth) * 0.65);
              vec3 sideClean = mix(mix(HW_SIDE_SHALLOW, HW_SIDE_BODY, hlAbsorb), HW_SIDE_DEEP, 1.0 - exp(-max(depth - 2.0, 0.0) * 0.32));
              c = waterBlend(sideClean, mix(HW_SIDE_BAD, HW_SIDE_BAD_DEEP, hlAbsorb), hlBad) * faceLight;
            }
            alpha = edge ? mix(0.78, 0.96, hlTint) : (1.0 - WATER_FALL_SEE_THROUGH);
            // the water's section at the map's edge (#67 stage 1)
            if (hlSection > 0.5 && edge) {
              vec3 section = mix(HW_SECTION, HW_SECTION_DEEP, 1.0 - exp(-max(depth, 0.0) * 0.65));
              section = waterBlend(section, HW_SECTION_BAD, cont);
              c = section * (0.94 + vnoise(vec2(g.x + g.y, vWorld.y * 5.7)) * 0.08);
              alpha = mix(0.91, 0.98, waterTint(cont));
            }
            // a small step between two waters: the surface going on, as the game's face shares the surface's material,
            // High's surface itself (its formulas, light, highlight and glowing lines: measuredSurfaceWater) at its depth
            // as the surface sees it from above, facing up as the Standard look's step does; its patterns at their means
            // (a face's place on the map is a line, which would stretch the surface's flecks and lines down it into a
            // bright line)
            if (!edge && vFlags < WATER_FALL_FLAGS) {
              vec3 up = vec3(0.0, 1.0, 0.0);
              float stepSmooth = mix(WATER_SMOOTHNESS, BADWATER_SMOOTHNESS, waterTint(cont) * BADWATER_PATTERN_FLAT.x);
              vec4 stepSurface = measuredSurfaceWater(g, max(0.0, depth), 1.0, cont, up, V, lit, WATER_ALBEDO_MEAN, BADWATER_PATTERN_FLAT, stepSmooth);
              c = stepSurface.rgb;
              // (what the clear water's veil keeps of its badwater: the step's own, at its depth, not the fall's film)
              clearBad = hlBadLit;
              alpha = stepSurface.a * smoothstep(0.02, 0.06, drop);
            }
            if (alpha < 0.01) discard;
          }
          foam = 0.0;
        }
`,
  };
}

export function objectHooks(): ShaderHooks {
  return { ...lit([]), roofedSun: ROOFED_SUN };
}

/** The landmarks (#67 stage 3): the High object material with a fine grain and patina close up. */
export function landmarkHooks(): ShaderHooks {
  return {
    ...lit(["hlObjectDetail"], "\n  varying vec3 hlLocal;"),
    roofedSun: ROOFED_SUN,
    objectVertexDecl: "\n      varying vec3 hlLocal;",
    objectVertex: "        hlLocal = position;\n",
    objectFinal: /* glsl */ `(hlObjectDetail > 0.5 ? vColor * (1.0 + (vnoise(hlLocal.xz * 31.7 + hlLocal.y * vec2(1.3, 19.1)) - 0.5) * 0.12 * (1.0 - smoothstep(0.025, 0.11, max(fwidth(vWorld.x), fwidth(vWorld.y)))) + (vnoise(hlLocal.xz * 5.7 + hlLocal.y * vec2(7.3, 3.1)) - 0.5) * 0.07) : vColor) * light`,
  };
}

/** Slopes (#67 stage 3): the ramp in natural materials, soil, stone and grass where moist. A slope on a run top below
 *  its tile's top (a cave's floor, a ledge under an overhang) takes that run's soil from the run texture, as
 *  runSoil.ts `objectSoilAt` gives it (only on a map with them, the renderer's `RUN_SOIL`; every other map draws
 *  slopes with the same program as before). */
export function slopeHooks(): ShaderHooks {
  const landmark = landmarkHooks();
  return {
    ...landmark,
    objectVertexDecl: landmark.objectVertexDecl + /* glsl */ `
      #ifdef RUN_SOIL
      varying vec3 hlFoot;
      #endif`,
    objectVertex: landmark.objectVertex + /* glsl */ `        #ifdef RUN_SOIL
        hlFoot = m[3].xyz;
        #endif
`,
    decl: landmark.decl + /* glsl */ `
  #ifdef RUN_SOIL
  uniform highp sampler3D runTex;
  varying vec3 hlFoot;
  #endif
  vec3 hlSlopeColour(vec3 n) {
    vec2 g = vec2(vWorld.x, -vWorld.z);
    float grain = vnoise(g * 5.7), earthPatch = vnoise(g * 0.8 + 13.1);
    vec3 color = mix(vec3(0.34, 0.36, 0.33), vec3(0.43, 0.445, 0.405), grain);
    if (n.y > 0.5) {
      color = mix(vec3(0.39, 0.38, 0.37), vec3(0.47, 0.43, 0.36), earthPatch) * (0.90 + 0.16 * grain);
      float packed = floor(texture2D(tileTex, (floor(g) + 0.5) / mapSize).g * 255.0 + 0.5);
      #ifdef RUN_SOIL
        // standing on a run top below its tile's top: that run's soil (its tile and level the slope's own)
        vec3 foot = vec3(floor(hlFoot.x), floor(-hlFoot.z), floor(hlFoot.y + 0.5));
        if (all(greaterThanEqual(foot, vec3(0.0))) && all(lessThan(foot, vec3(mapSize, ${g(RUN_LEVELS)})))) {
          vec2 run = floor(texelFetch(runTex, ivec3(foot), 0).rg * 255.0 + 0.5);
          if (run.y > 0.5) packed = run.x;
        }
      #endif
      float moist = grassOf(floor(packed / 16.0));
      float grass = smoothstep(0.66, 0.96, hlLocal.z + 0.5 + (grain - 0.5) * 0.15) * moist;
      color = mix(color, mix(vec3(0.5, 0.655, 0.32), vec3(0.48, 0.635, 0.3), earthPatch) * (0.87 + 0.14 * grain), grass);
    }
    return color;
  }`,
    objectFinal: "hlSlopeColour(n) * light",
  };
}

/** The vegetation (#66): palette regions (the colours are uniforms), wind in the vertex shader
 *  (roots fixed, the same bend for the normal), wrapped sun light and a matte sheen. */
export function vegetationHooks(slots: number): ShaderHooks {
  return {
    ...objectHooks(),
    objectVertexDecl: /* glsl */ `
      attribute float region;
      attribute vec4 wind;
      uniform vec3 vegPalette[${slots}];
      uniform float vegTime;
      uniform float vegSway;
      vec2 windVector() {
        if (vegSway < 0.001 || wind.z < 0.001) return vec2(0.0);
        float t = vegTime * wind.y;
        return wind.z * vegSway * vec2(sin(t + wind.x) + 0.28 * sin(t * 1.73 + wind.x * 2.3), 0.48 * cos(t * 0.83 + wind.x));
      }
      vec3 bend(vec3 p, vec2 w) {
        float h = max(wind.w, 0.1);
        p.xz += w * pow(max(p.y, 0.0) / h, 2.0);
        return p;
      }
      vec3 bendNormal(vec3 p, vec3 n, vec2 w) {
        n.y -= dot(w, n.xz) * 2.0 * max(p.y, 0.0) / max(wind.w * wind.w, 0.01);
        return normalize(n);
      }`,
    objectVertex: "        vec2 wv = windVector();\n",
    objectNormal: "bendNormal(position, normal, wv)",
    objectColor: "pcolor * vegPalette[int(region + 0.5)]",
    objectPosition: "bend(position, wv)",
    objectSun: "(dot(n, sunDir) + 0.25) / 1.25",
    objectFinal: "vColor * light + sunColor * 0.045 * (1.0 - 0.92 * 0.85) * pow(max(dot(n, normalize(sunDir + normalize(cameraPosition - vWorld))), 0.0), mix(64.0, 4.0, 0.92)) * lit",
  };
}

