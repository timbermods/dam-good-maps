// The High look's shader additions (PLAN §20 D147, D242, D250, D284), put in at the Standard
// shaders' named points (materials.ts `ShaderHooks`). Ported from the investigations:
// - #38 (investigation/maplook2): the water shader (colour by depth, clear shallows, fine crests and
//   flecks advected by the flow, the calibrated crimson badwater, the poisoned bed under it) and
//   soft shadows from the real meshes (a 2048² sun depth map, 25-tap PCF, receiver-plane bias);
// - #65 (investigation/maplook3): warm sunlight, ambient occlusion, the colour-preserving tone
//   curve and grade, the distance haze, the sky, rock strata, soil edges and colour variation;
// - #66 (investigation/vegetation): the vegetation's material (palette regions, wrapped light, matte
//   specular) and its wind;
// - #67 (investigation/maplook-finish), stages 1–3 and stage 4's poisoned soil: the diorama edge
//   (rock beds, soil cap, water section), the water's finish (a continuous crown, an irregular
//   landing, bubbly froth, rough water), the landmarks' fine detail and slopes' natural material,
//   and poisoned soil stained dark instead of glowing. Stage 4's seasons wait (D286 (4)).
// Every effect has a switch (a uniform, 1 on, 0 off), so switching never recompiles a shader. The
// investigations' colours are display RGB, like the Standard shaders'. Where #65 graded the whole
// frame in a pass of its own, each High material grades its own colour at the end of `finish()`:
// the same curve and grade per pixel, without a second full-screen target (a default the session
// chose: docs/decisions-pending.md #110).

import { WATER } from "../palette";
import { BADWATER as B, HIGH_WATER_GLSL } from "../waterPalette";

/** A number as GLSL writes a float. */
const g = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
import type { ShaderHooks } from "../materials";

/** The switches' uniform names (render3d/high/effects.ts maps the effects onto them). */
export const SWITCHES = [
  "hlWater",
  "hlShadows",
  "hlAO",
  "hlTone",
  "hlGrade",
  "hlHaze",
  "hlSky",
  "hlStrata",
  "hlBlend",
  "hlVariation",
  "hlGeology",
  "hlSoilCap",
  "hlSection",
  "hlCrown",
  "hlLanding",
  "hlBubbles",
  "hlRiver",
  "hlObjectDetail",
  "hlPoison",
] as const;
export type Switch = (typeof SWITCHES)[number];

const switches = (names: readonly Switch[]) => `\n  uniform float ${names.join(", ")};`;

/** The tone curve and grade (#65), in linear light, from the display RGB the shaders make: decode,
 *  a little more saturation and a warm highlight balance, chroma restrained round its luminance
 *  (warm neutrals more than foliage), bright yellow-greens nudged toward green, then exposure 1.22
 *  and a shoulder that compresses only peaks above 0.82, scaling the channels together (no grey
 *  lift, no whitening); encoded once. From three.js r186's NeutralToneMapping (MIT) without its toe
 *  or highlight desaturation. */
export const GRADE_GLSL = /* glsl */ `
  vec3 hlDecode(vec3 c) { return mix(c / 12.92, pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4)), step(vec3(0.04045), c)); }
  vec3 hlEncode(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
  vec3 hlShoulder(vec3 c) {
    float peak = max(c.r, max(c.g, c.b));
    if (peak <= 0.82) return c;
    float d = 0.18;
    float newPeak = 1.0 - d * d / (peak + d - 0.82);
    return c * (newPeak / peak);
  }
  vec3 hlGradeColour(vec3 display) {
    vec3 c = hlDecode(max(display, vec3(0.0)));
    if (hlGrade > 0.5) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, 1.06), vec3(0.0));
      c *= mix(vec3(1.008, 1.0, 0.995), vec3(1.030, 1.016, 0.960), smoothstep(0.035, 0.55, l));
      float litLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float peak = max(c.r, max(c.g, c.b));
      float chroma = peak - min(c.r, min(c.g, c.b));
      float vividness = chroma / max(peak, 0.0001);
      float warmNeutral = smoothstep(0.0, 0.25, (c.r - c.g) / max(chroma, 0.0001)) * (1.0 - smoothstep(0.70, 0.95, vividness));
      float restraint = mix(0.90, 1.0, smoothstep(0.35, 0.75, vividness));
      c = mix(vec3(litLuma), c, restraint);
      float yellowGreen = smoothstep(-0.12, 0.10, (c.g - c.r) / max(chroma, 0.0001)) * smoothstep(0.25, 0.70, (c.r - c.b) / max(chroma, 0.0001));
      float shift = 0.06 * chroma * yellowGreen * smoothstep(0.14, 0.40, litLuma);
      c += vec3(-shift, shift * (0.2126 / 0.7152), 0.0);
    }
    if (hlTone > 0.5) c = hlShoulder(c * 1.0);
    return clamp(hlEncode(max(c, vec3(0.0))), 0.0, 1.0);
  }
`;

/** Soft shadows from the real meshes (#38): the sun's depth map, 25 taps, a receiver-plane bias so
 *  sloping surfaces don't stripe; off, the baked shadow. */
const SHADOW_GLSL = /* glsl */ `
  uniform sampler2D hlDepth;
  uniform mat4 hlShadowMatrix;
  uniform float hlTexel;
  float sunLit(vec2 g, float z) {
    // (the derivatives first, outside any branch or loop; the depth read at its own level)
    vec3 n = normalize(vNormal);
    vec4 p = hlShadowMatrix * vec4(vWorld + n * 0.045, 1.0);
    vec3 q = p.xyz / p.w * 0.5 + 0.5;
    vec3 dx = dFdx(q), dy = dFdy(q);
    float determinant = dx.x * dy.y - dx.y * dy.x;
    vec2 gradient = abs(determinant) > 1e-10 ? vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant : vec2(0.0);
    gradient = clamp(gradient, vec2(-2.0), vec2(2.0));
    float bias = 0.00006 + dot(abs(gradient), vec2(hlTexel)) * 0.7;
    float lit = 1.0;
    if (hlShadows < 0.5) lit = bakedSunLit(g, z);
    else if (all(greaterThanEqual(q, vec3(0.0))) && all(lessThanEqual(q, vec3(1.0)))) {
      float light = 0.0;
      for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
        vec2 offset = vec2(float(x), float(y)) * hlTexel * 0.8;
        float d = textureLod(hlDepth, q.xy + offset, 0.0).r;
        light += step(q.z + dot(gradient, offset) - bias, d);
      }
      lit = light / 25.0;
    }
    return lit;
  }
`;

/** Ambient occlusion (#65): the map's horizons at four radii in eight directions and the trees' and
 *  ruins' soft footprints, one texel a tile; it darkens only the sky's light, fading up a cliff from
 *  its foot. */
const AMBIENT_GLSL = /* glsl */ `
  uniform sampler2D hlAmbient;
  float ambientVisibility(vec3 world, vec3 normal) {
    if (hlAO < 0.5) return 1.0;
    vec2 g = vec2(world.x + normal.x * 0.55, -world.z - normal.z * 0.55);
    vec4 a = texture2D(hlAmbient, clamp(g / mapSize, 0.5 / mapSize, 1.0 - 0.5 / mapSize));
    float ground = texture2D(tileTex, (clamp(floor(g), vec2(0.0), mapSize - 1.0) + 0.5) / mapSize).r * 255.0;
    float above = max(0.0, world.y - ground);
    float terrain = mix(a.r, 1.0, smoothstep(0.1, 3.5, above));
    float canopy = mix(a.g, 1.0, smoothstep(0.0, 2.4, above));
    return max(0.40, terrain * canopy);
  }
`;

/** The finish's High haze (#65): a clear afternoon, no wash near the camera, at most 5.5% far off;
 *  off, the Standard haze. None from straight above (hazeAmount is 0 there). */
const HAZE = /* glsl */ `if (hlHaze > 0.5 && hazeAmount > 0.0) {
      float farAir = smoothstep(max(64.0, hazeRange.x * 1.5), max(160.0, hazeRange.y * 1.3), d);
      c = mix(c, vec3(0.78, 0.84, 0.91), farAir * 0.055);
    } else c = mix(c, hazeColor, hazeAmount * smoothstep(hazeRange.x, hazeRange.y, d));`;

const FINISH_END = /* glsl */ `return (hlTone > 0.5 || hlGrade > 0.5) ? hlGradeColour(c) : clamp(c, 0.0, 1.0);`;

/** The hooks every lit High material shares: shadows, the haze and the grade. */
function lit(names: readonly Switch[], more = ""): ShaderHooks {
  return {
    decl: switches(["hlShadows", "hlTone", "hlGrade", "hlHaze", ...names]) + GRADE_GLSL + more,
    sunLit: SHADOW_GLSL,
    haze: HAZE,
    finishEnd: FINISH_END,
  };
}

// ------------------------------------------------------------------------------------ the terrain

export function terrainHooks(): ShaderHooks {
  return {
    ...lit(["hlAO", "hlStrata", "hlBlend", "hlVariation", "hlGeology", "hlSoilCap", "hlPoison", "hlWater"], AMBIENT_GLSL + /* glsl */ `
  uniform sampler2D hlFlow;
  uniform vec2 hlFlowSize;
`),
    skyLight: "ambientVisibility(vWorld, n) * ",
    // soil edges (#65): a slightly wider blend where grass meets earth and where contamination ends (still
    // crisp at the tile's edge, since the soil weights themselves are: D324's follow-up)
    moist: "hlBlend > 0.5 ? smoothstep(0.36, 0.64, s.x + edge) : smoothstep(0.42, 0.58, s.x + edge)",
    bad: "hlBlend > 0.5 ? smoothstep(0.34, 0.66, s.z + edge * 0.6) : smoothstep(0.4, 0.6, s.z + edge * 0.6)",
    // colour variation (#65): two broad world scales on the ground's colour, not its soil
    groundVariation: /* glsl */ `
        if (hlVariation > 0.5) {
          float broad = vnoise(g * 0.043 + vec2(12.0, 33.0)) - 0.5;
          float mottling = vnoise(g * 0.317 + vec2(21.0, 8.0)) - 0.5;
          c *= 1.0 + broad * 0.15 + mottling * 0.065;
          c *= vec3(1.0 + broad * 0.055, 1.0 + broad * 0.015, 1.0 - broad * 0.045);
        }
        // D324 (Kyler's follow-up): the tone curve's exposure lifts grass about 5 L* above Standard's; hold it to
        // the game's (L* 50-55) like Standard's, by the grass's own share of the ground
        c *= 1.0;
        vec3 hlCleanGround = c;`,
    // poisoned soil (#67's High proposal, D250): the same contamination, a dark olive-brown stain and
    // dark sickly veins instead of the glow
    groundEnd: /* glsl */ `        if (hlPoison > 0.5) {
          c = mix(hlCleanGround, vec3(0.52, 0.13, 0.035), fracture.x * 0.92);
          glow = fracture.y * mix(0.16, 0.30, lvl);
        }
`,
    // the poisoned bed (#38): under polluted water, the ground's own contamination shows through
    groundTop: /* glsl */ `
          if (hlWater > 0.5 && d0.a > 0.002 && soil.w > 0.0 && clev > 0.0) {
            float polluted = texture2D(hlFlow, g / hlFlowSize).b * soil.w;
            if (polluted > 0.0) {
              float poisonGlow;
              vec3 poisoned = groundColor(vec4(soil.xyz, 0.0), g, detail, clev, poisonGlow);
              ground = mix(ground, poisoned, polluted);
              glow = mix(glow, poisonGlow, polluted);
            }
          }`,
    // rock strata (#65): warped bedding, grain, faint fractures, a quiet line at each level
    wall: /* glsl */ `          if (hlStrata > 0.5) {
            vec3 stone = mix(vec3(0.35, 0.355, 0.26), vec3(0.51, 0.47, 0.34), vnoise(vec2(along * 0.32, y * 0.4)));
            wc = mix(vec3(0.235, 0.23, 0.18) * shade, stone * shade * (0.40 + k * 0.85 + (vnoise(vec2(along * 8.1, y * 9.3)) - 0.5) * 0.13), smoothstep(0.015, 0.35, k));
          }
`,
    wallLines: "markers",
    // the diorama edge (#67 stage 1): the map's four outer faces cut through its rock, with a soil
    // cap and the water's section; inland cliffs keep the strata
    lit: /* glsl */ `
        bool hlCut = abs(n.y) < 0.5 && (vWorld.x < 0.003 || vWorld.x > mapSize.x - 0.003 || -vWorld.z < 0.003 || -vWorld.z > mapSize.y - 0.003);
        if (hlCut && (hlGeology > 0.5 || hlSoilCap > 0.5)) {
          float a = abs(n.x) > 0.5 ? -vWorld.z : vWorld.x;
          float y = vWorld.y;
          float warp = (vnoise(vec2(a * 0.075, 19.7)) - 0.5) * 0.75;
          float bed = y + warp + (vnoise(vec2(a * 0.13, y * 0.19) + 13.7) - 0.5) * 1.3;
          float broad = vnoise(vec2(a * 0.24, y * 1.6));
          float band = vnoise(vec2(a * 0.06, bed * 0.83));
          vec3 stone = mix(vec3(0.36, 0.38, 0.35), vec3(0.43, 0.445, 0.405), band);
          float seam = smoothstep(0.60, 0.74, vnoise(vec2(a * 0.10, bed * 2.31) + 34.7));
          stone *= 1.0 - seam * 0.13;
          float grain = vnoise(vec2(a * 8.3, y * 16.7));
          float joint = cracks(vec2(a * 0.67 + warp, y * 0.93) + 41.8).x;
          stone *= 0.87 + broad * 0.18 + grain * 0.10;
          stone *= 1.0 - joint * 0.18 * (1.0 - smoothstep(0.06, 0.22, fwidth(a)));
          stone *= 0.86 + 0.14 * smoothstep(-3.0, 1.0, y);
          if (hlGeology > 0.5) c *= 0.94;
          if (hlSoilCap > 0.5) {
            float depth = h0 - y;
            float soilDepth = 0.54 + 0.22 * vnoise(vec2(a * 1.53, 7.2));
            float cap = 1.0 - smoothstep(soilDepth - 0.12, soilDepth + 0.12, depth);
            vec3 earth = mix(vec3(0.43, 0.30, 0.18), vec3(0.63, 0.46, 0.28), grain);
            float roots = pow(1.0 - abs(sin(a * 11.3 + y * 2.7 + vnoise(vec2(a, y)) * 4.0)), 14.0);
            earth = mix(earth, vec3(0.29, 0.24, 0.14), roots * smoothstep(0.15, 0.45, depth) * 0.55);
            c = mix(c, earth, cap);
            float moistTop = step(0.5, soilOf(d0).x);
            c = mix(c, mix(vec3(0.63, 0.53, 0.30), vec3(0.49, 0.61, 0.22), moistTop), 1.0 - smoothstep(0.015, 0.09, depth));
          }
          light = skyColor * 1.1 + sunColor * 0.50 * max(dot(n, sunDir), 0.0);
        }`,
  };
}

// -------------------------------------------------------------------------------------- the water

/** #38's water surface: the calibrated palette (waterPalette.ts HIGH_WATER, display RGB, through the
 *  renderer's light), fine
 *  irregular crests and tiny flecks in one detail field advected by the flow in two phases, the
 *  contamination front as a continuous gradient to crimson, matte badwater with its slow bubbles. */
const WATER_FUNCTIONS = /* glsl */ `
  uniform sampler2D hlFlow;
  uniform vec2 hlFlowSize;
  uniform sampler2D hlRough;
${HIGH_WATER_GLSL}
  vec3 hlRippleNormal(vec2 p, float t) {
    vec2 slope = vec2(0.0);
    slope += cos(dot(p, vec2(1.1, 0.4)) + t * 1.05) * vec2(1.1, 0.4) * 0.065;
    slope += cos(dot(p, vec2(-0.5, 1.7)) - t * 0.82) * vec2(-0.5, 1.7) * 0.038;
    slope += cos(dot(p, vec2(3.2, 2.1)) + t * 1.4) * vec2(3.2, 2.1) * 0.012;
    float detail = 1.0 - smoothstep(0.1, 0.5, max(fwidth(p.x), fwidth(p.y)));
    return normalize(vec3(slope.x * detail, 1.0, -slope.y * detail));
  }
  float fleckHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float detailNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(fleckHash(cell), fleckHash(cell + vec2(1.0, 0.0)), u.x), mix(fleckHash(cell + vec2(0.0, 1.0)), fleckHash(cell + 1.0), u.x), u.y);
  }
  float chop(vec2 p) {
    vec2 warp = vec2(detailNoise(p * 1.73 + 8.0), detailNoise(p * 1.91 - 17.0)) - 0.5;
    vec2 q = mat2(0.91, 0.41, -0.41, 0.91) * (p + warp * 0.19);
    float coarse = detailNoise(q * vec2(3.3, 7.1));
    float fine = detailNoise(mat2(0.63, -0.78, 0.78, 0.63) * p * 11.3 + 31.7);
    return coarse * 0.82 + fine * 0.18;
  }
  float microFlecks(vec2 p, float t, float speed, float pixel) {
    vec2 cell = floor(p * 7.0);
    vec2 point = vec2(fleckHash(cell + 13.0), fleckHash(cell + 47.0)) * 0.6 + 0.2;
    float radius = max(pixel * 7.0 * 0.5, 0.065);
    float spot = 1.0 - smoothstep(radius * 0.25, radius, length(fract(p * 7.0) - point));
    float twinkle = smoothstep(0.1, 0.85, sin(t * (1.1 + speed * 1.2) + fleckHash(cell) * 51.0));
    return spot * step(mix(0.96, 0.82, speed), fleckHash(cell + 91.0)) * twinkle;
  }
  /** #38's badwater opacity at its own depth (already shallower toward a bank), with the shared
   *  palette's numbers (BADWATER). */
  float badwaterOpacity(float depth, float shore, float grazing) {
    float edge = (1.0 - smoothstep(${g(B.edgeDepth[0])}, ${g(B.edgeDepth[1])}, depth)) * (1.0 - smoothstep(${g(B.edgeShore[0])}, ${g(B.edgeShore[1])}, shore));
    return max(mix(${g(B.opacity[0])}, ${g(B.opacity[1])}, smoothstep(${g(B.opacityFrom)}, ${g(B.opacityTo)}, depth)) - ${g(B.edge)} * edge, grazing * ${g(B.grazing)});
  }
  vec4 measuredSurfaceWater(vec2 g, float depth, float shore, float contamination, vec3 N, vec3 V, float lit, float t) {
    float bodyDepth = smoothstep(0.25, 1.25, depth);
    float deep = smoothstep(1.0, 3.5, depth);
    vec3 body = mix(mix(HW_SHALLOW, HW_BODY, bodyDepth), HW_DEEP, deep);
    float facing = clamp(V.y + (N.x + N.z) * 0.05, 0.0, 1.0);
    float low = 1.0 - smoothstep(0.50, 0.82, facing);
    float grazing = 1.0 - smoothstep(0.18, 0.50, facing);
    body = mix(body, HW_GRAZING * mix(1.0, 0.72, deep), grazing * 0.65);
    vec3 streakColour = mix(mix(HW_STREAK_ABOVE, HW_STREAK_LOW, low), HW_STREAK_GRAZING, grazing);
    vec3 cleanBody = body;
    vec3 badBody = HW_BAD * (1.0 - deep * 0.12) + vec3(0.0012, 0.0008, 0.0006) * grazing;
    // water partly bad as the Standard look has it (D177: one shared blend, through the game's
    // mixing zone and a warm brown to crimson, a tenth bad already warm)
    body = waterBlend(body, badBody, contamination);
    vec3 badCrest = mix(vec3(0.035, 0.023, 0.018) + vec3(0.008, 0.006, 0.004) * low, vec3(0.009, 0.007, 0.004) + vec3(0.0008, 0.0006, 0.0004) * low, smoothstep(0.25, 1.0, contamination));
    streakColour = body + mix(streakColour - cleanBody, badCrest, contamination);
    vec2 velocity = (texture2D(hlFlow, g / hlFlowSize).rg * 255.0 - 128.0) / 63.5;
    float speed = smoothstep(0.02, 1.2, length(velocity));
    vec2 drift = velocity * 0.65 + vec2(0.018, -0.012) * (1.0 - speed);
    float phase = fract(t / 12.0), second = fract(t / 12.0 + 0.5);
    float blend = abs(phase * 2.0 - 1.0);
    vec2 p = g - drift * (phase * 12.0), p2 = g - drift * (second * 12.0) + vec2(19.13, 7.71);
    float pixel = max(fwidth(g.x), fwidth(g.y));
    float near = 1.0 - smoothstep(0.18, 0.80, pixel);
    float waterTexture = 0.5 + (mix(chop(p), chop(p2), blend) - 0.5) / sqrt(blend * blend + (1.0 - blend) * (1.0 - blend));
    float streak = smoothstep(0.51, 0.79, waterTexture) * near;
    vec3 colour = mix(body, streakColour, streak * 0.45);
    vec2 direction = normalize(mix(vec2(0.8, 0.6), normalize(velocity + vec2(0.0001, 0.0002)), speed));
    vec2 across = vec2(-direction.y, direction.x);
    vec2 flowA = vec2(dot(p, across) * 2.8, dot(p, direction) * mix(2.1, 0.42, speed));
    vec2 flowB = vec2(dot(p2, across) * 2.8, dot(p2, direction) * mix(2.1, 0.42, speed));
    flowA += vec2(vnoise(p * 0.71), vnoise(p * 0.83 + 8.1)) * 2.2;
    flowB += vec2(vnoise(p2 * 0.71), vnoise(p2 * 0.83 + 8.1)) * 2.2;
    float network = mix(cracks(flowA).x * smoothstep(0.28, 0.66, vnoise(p * 4.2 + 31.0)), cracks(flowB).x * smoothstep(0.28, 0.66, vnoise(p2 * 4.2 + 31.0)), blend);
    float ribbons = mix(smoothstep(0.49, 0.72, vnoise(flowA * vec2(1.7, 0.7))), smoothstep(0.49, 0.72, vnoise(flowB * vec2(1.7, 0.7))), blend);
    float broad = mix(vnoise(p * 0.51), vnoise(p2 * 0.51), blend);
    float rough = texture2D(hlRough, g / hlFlowSize).r * hlRiver;
    float highlights = (network * (0.18 + broad * 0.72) + ribbons * (0.16 + rough * 0.43)) * (0.35 + broad * 0.80);
    float rollA = vnoise(p * 0.70) * 0.50 + vnoise((p + direction * 1.7) * 0.70) * 0.30 + vnoise(p * 1.3 + 47.0) * 0.20;
    float rollB = vnoise(p2 * 0.70) * 0.50 + vnoise((p2 + direction * 1.7) * 0.70) * 0.30 + vnoise(p2 * 1.3 + 47.0) * 0.20;
    float rolling = mix(smoothstep(0.41, 0.72, rollA), smoothstep(0.41, 0.72, rollB), blend);
    highlights = mix(highlights, rolling * (0.43 + rough * 0.34), smoothstep(0.10, 0.65, speed));
    colour *= 1.0 - speed * (1.0 - rolling) * 0.14;
    highlights *= mix(1.0, 0.68, deep);
    vec3 networkColour = mix(vec3(0.34, 0.61, 0.73), vec3(0.85, 0.43, 0.43), contamination);
    colour *= 0.80 + broad * 0.40;
    colour = mix(colour, networkColour, clamp(highlights, 0.0, 0.82));
    colour += vec3(0.26, 0.035, 0.008) * contamination * (1.0 - smoothstep(0.0, 0.32, shore));
    if (contamination > 0.25) {
      float trough = (1.0 - smoothstep(0.20, 0.38, waterTexture)) * near;
      float signalOpacity = mix(0.40, 0.94, smoothstep(0.05, 1.80, depth));
      signalOpacity = mix(0.30, signalOpacity, smoothstep(0.0, 0.20, shore));
      signalOpacity = max(signalOpacity, grazing * 0.62);
      signalOpacity = mix(signalOpacity, badwaterOpacity(depth, shore, grazing), smoothstep(0.25, 1.0, contamination));
      colour += (HW_BAD_TROUGH * trough + HW_BAD_STREAK * streak) * ((contamination - 0.25) / 0.75) / signalOpacity;
    }
    vec3 referenceLight = skyColor * 1.05 + sunColor * 0.42 * max(sunDir.y, 0.0);
    vec3 rippleLight = skyColor * 1.05 + sunColor * 0.42 * max(dot(normalize(mix(vec3(0.0, 1.0, 0.0), N, 0.35)), sunDir), 0.0) * lit;
    colour *= rippleLight / max(referenceLight, vec3(0.01));
    float glint = mix(microFlecks(p, t, speed, pixel), microFlecks(p2, t, speed, pixel), blend);
    glint *= lit * (1.0 - smoothstep(0.08, 0.22, pixel));
    glint *= mix(1.0, 0.35, contamination);
    glint *= mix(1.0, 0.08, smoothstep(0.25, 1.0, contamination));
    colour = mix(colour, mix(HW_GLINT, HW_BAD_GLINT, contamination), glint);
    if (contamination > 0.01) {
      float bt = t * mix(1.0, 0.55, contamination);
      float fine = 1.0 - smoothstep(0.03, 0.09, fwidth(g.x));
      float bubbles = fine * smoothstep(0.83, 0.93, vnoise(g * 5.0 + vec2(bt * 0.05, -bt * 0.08))) * smoothstep(0.55, 0.8, vnoise(g * 1.3 - vec2(0.0, bt * 0.04)));
      colour += vec3(${WATER.badVein.join(", ")}) * bubbles * contamination * 0.55;
    }
    float alpha = mix(mix(0.86, 0.96, bodyDepth), 0.995, deep);
    alpha = mix(0.76, alpha, smoothstep(0.0, 0.20, shore));
    alpha = max(alpha, grazing * 0.98);
    float badAlpha = mix(0.40, 0.94, smoothstep(0.05, 1.80, depth));
    badAlpha = mix(0.30, badAlpha, smoothstep(0.0, 0.20, shore));
    badAlpha = max(badAlpha, grazing * 0.62);
    alpha = mix(alpha, badAlpha, contamination);
    alpha = mix(alpha, badwaterOpacity(depth, shore, grazing), smoothstep(0.25, 1.0, contamination));
    return vec4(colour, alpha);
  }
`;

export function waterHooks(): ShaderHooks {
  return {
    ...lit(["hlWater", "hlSection", "hlRiver"]),
    // (after the shared palette's GLSL: the surface uses its blend)
    waterDecl: WATER_FUNCTIONS,
    // #38's water in place of the Standard surface, before clear water, the overlays, the layers
    // and the sources' upwelling (those stay as the Standard look has them)
    water: /* glsl */ `        if (hlWater > 0.5) {
          vec2 hlFr = fract(g);
          float hlT = time * mix(1.0, 0.55, cont);
          float hlFoam = 0.0;
          if (n.y > 0.5) {
            float hlBad = texture2D(hlFlow, g / hlFlowSize).b;
            float hlDepth = max(0.0, depth) * mix(0.10, 1.0, smoothstep(0.0, 0.55, shore));
            vec4 hlSurface = measuredSurfaceWater(g, hlDepth, shore, hlBad, hlRippleNormal(g, time), V, lit, time);
            // foam along the shore, and churning where a fall comes down into the water
            float fallIn = 1.0;
            if (bitOf(vFlags, 16.0) > 0.5) fallIn = min(fallIn, 1.0 - hlFr.x);
            if (bitOf(vFlags, 32.0) > 0.5) fallIn = min(fallIn, hlFr.x);
            if (bitOf(vFlags, 64.0) > 0.5) fallIn = min(fallIn, 1.0 - hlFr.y);
            if (bitOf(vFlags, 128.0) > 0.5) fallIn = min(fallIn, hlFr.y);
            hlFoam = (1.0 - smoothstep(0.015, 0.16, shore)) * (0.26 + vnoise(g * 4.0 + vec2(hlT * 0.1, -hlT * 0.2)) * 0.38);
            hlFoam += (1.0 - smoothstep(0.12, 0.95, fallIn)) * (0.72 + 0.45 * vnoise(g * 6.0 + vec2(hlT * 0.7, -hlT * 1.4)));
            // rough water (#67 stage 2): froth only below falls, in rapids and in fast wakes
            if (hlRiver > 0.5) {
              float strength = texture2D(hlRough, g / hlFlowSize).r;
              vec2 vel = (texture2D(hlFlow, g / hlFlowSize).rg * 255.0 - 128.0) / 63.5;
              if (strength > 0.005) hlFoam = max(hlFoam, strength * 0.68 * smoothstep(0.40, 0.78, detailNoise(g * 1.71 - vel * hlT * 0.23)));
            }
            hlFoam = clamp(hlFoam * (1.0 - hlBad * 0.55), 0.0, 1.0) * 0.30;
            c = mix(hlSurface.rgb, mix(vec3(0.35, 0.61, 0.69), vec3(0.71, 0.34, 0.30), hlBad) * (0.85 + 0.15 * lit), hlFoam);
            alpha = mix(hlSurface.a, 0.97, hlFoam);
          } else {
            // the water's side: streaks where it steps down, the water's body at the map's edge
            float stream = vnoise(vec2(g.x * 1.4 + sin(g.y * 0.8), g.y * 3.8 - hlT * 0.16));
            float hlBad = cont >= 0.95 ? 1.0 : (cont <= 0.05 ? cont : mix(cont * 0.55, 1.0, smoothstep(1.0 - cont - 0.20, 1.0 - cont + 0.20, stream)));
            float hlAbsorb = 1.0 - exp(-max(0.0, depth) * 0.65);
            vec3 clean = mix(HW_SIDE_SHALLOW, HW_SIDE_BODY, hlAbsorb);
            clean = mix(clean, HW_SIDE_DEEP, 1.0 - exp(-max(depth - 2.0, 0.0) * 0.32));
            vec3 murk = mix(HW_SIDE_BAD, HW_SIDE_BAD_DEEP, hlAbsorb);
            c = mix(clean, murk, hlBad) * (skyColor * 1.05 + sunColor * 0.42 * max(dot(n, sunDir), 0.0) * lit);
            bool edge = vFlags > 254.5;
            float drop = edge ? 0.0 : vFlags / 30.0;
            float along = abs(n.x) > 0.5 ? g.y : g.x;
            float strands = smoothstep(0.30, 0.72, vnoise(vec2(along * 7.0, vWorld.y * 1.4 + hlT * 3.6)));
            hlFoam = edge ? 0.0 : smoothstep(0.12, 0.6, drop) * (0.42 + strands * 0.60);
            alpha = edge ? mix(0.78, 0.96, hlBad) : (0.32 + 0.53 * strands) * smoothstep(0.06, 0.25, drop);
            // the water's section at the map's edge (#67 stage 1)
            if (hlSection > 0.5 && edge) {
              vec3 section = mix(HW_SECTION, HW_SECTION_DEEP, 1.0 - exp(-max(depth, 0.0) * 0.65));
              section = mix(section, HW_SECTION_BAD, cont);
              c = section * (0.94 + vnoise(vec2(g.x + g.y, vWorld.y * 5.7)) * 0.08);
              alpha = mix(0.91, 0.98, cont);
            }
            // tiny steps between two waters take the surface's own colour (#67 stage 2)
            if (hlRiver > 0.5 && vFlags < 9.0) {
              vec4 joined = measuredSurfaceWater(g, max(0.0, depth), 1.0, cont, vec3(0.0, 1.0, 0.0), V, lit, time);
              c = joined.rgb;
              alpha = joined.a;
              hlFoam = 0.0;
            }
            hlFoam = clamp(hlFoam * (1.0 - hlBad * 0.55), 0.0, 1.0) * 0.30;
            c = mix(c, mix(vec3(0.35, 0.61, 0.69), vec3(0.71, 0.34, 0.30), hlBad) * (0.85 + 0.15 * lit), hlFoam);
            alpha = mix(alpha, 0.97, hlFoam);
            if (alpha < 0.01) discard;
          }
          foam = hlFoam;
        }
`,
  };
}

// ------------------------------------------------------------------------------------------ falls

const BUBBLES_GLSL = /* glsl */ `
  float hlHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hlBubblePattern(vec2 p, float t) {
    vec2 q = mat2(0.83, 0.56, -0.56, 0.83) * p * 8.73;
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float bubbles = 0.0;
    float qa = max(fwidth(q.x), fwidth(q.y));
    float aa = max(qa, 0.025);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)), id = cell + o;
      vec2 center = o + vec2(hlHash(id + 13.7), hlHash(id - 48.2)) * 0.82 + 0.09;
      float radius = 0.08 + 0.19 * hlHash(id + 71.4);
      float d = length(f - center);
      float ring = (1.0 - smoothstep(radius - aa, radius + aa, d)) * smoothstep(radius * 0.33 - aa, radius * 0.75 + aa, d);
      float s = sin(t * 1.8 + hlHash(id) * 19.0);
      bubbles = max(bubbles, ring * (0.55 + 0.45 * s * s));
    }
    return mix(bubbles, 0.30, smoothstep(0.35, 0.95, qa));
  }
`;

export function fallHooks(): ShaderHooks {
  return {
    ...lit(["hlWater", "hlCrown", "hlLanding", "hlBubbles"], BUBBLES_GLSL + HIGH_WATER_GLSL),
    // D324: the fall's tone (teal first, white in streaks and at the landing) is in the shared shader; High
    // gives the sheet its own water teal
    fallBody: "(hlWater > 0.5 ? waterBlend(HW_SHALLOW * 1.06, vec3(0.55, 0.15, 0.065), cont) : waterBlend(WATER_SHALLOW, badwaterBody(0.25), cont))",
    // the crown (#67 stage 2): one continuous billow along joined falls, never a row of cylinders
    fallVertexDecl: "\n      uniform float hlCrown;\n      uniform float time;",
    fallVertex: /* glsl */ `        if (kind > 4.5 && hlCrown > 0.5) {
          float billow = 0.84 + 0.10 * sin(p.x * 2.17 + p.z * 1.31 + time * 0.9) + 0.06 * sin(p.z * 4.37 - p.x * 1.73 - time * 1.1);
          p.y = land + 0.012 + (p.y - land - 0.012) * billow;
        }
`,
    fallNormal: "kind > 4.5 && hlCrown > 0.5 ? vec3(0.0, 1.0, 0.0) : normalize(vNormal)",
    crownNoise: /* glsl */ `            if (hlCrown > 0.5) {
              b1 = vnoise(g * 4.17 + vec2(t * 0.4, -t * 0.71) + vWorld.y * 0.37);
              b2 = vnoise(g * 9.31 + vec2(-t * 0.8, t * 0.93) + vWorld.y * 0.81);
            }
`,
    crownFoam: /* glsl */ `
          if (hlCrown > 0.5) {
            float front = smoothstep(0.55, 0.93, swirl);
            foam *= mix(1.0, smoothstep(0.02, 0.28 + bil * 0.24, up), front);
          }`,
    // bubbly froth where it lands (D231's milky froth), and an irregular landing edge (D231's
    // straight edge)
    splashFroth: /* glsl */ `
          if (hlBubbles > 0.5) {
            float bubble = hlBubblePattern(g - vec2(0.037, -0.083) * t, t);
            broken = pow(tail, 1.1) * (0.10 + 0.78 * bubble + 0.12 * froth);
          }`,
    splashFoam: /* glsl */ `
          if (hlLanding > 0.5) {
            float irregular = 0.12 + 0.22 * vnoise(g * 2.73 + vec2(t * 0.11, 17.7));
            foam *= smoothstep(irregular, irregular + 0.30, vEdge.x);
          }`,
    fallEnd: /* glsl */ `        if (hlLanding > 0.5 && kind < 3.5) {
          float dissolve = 0.06 + 0.22 * vnoise(g * 3.17 + vec2(t * 0.09, 11.7));
          alpha *= smoothstep(-0.02, dissolve, vRib.z);
        }
`,
  };
}

// ---------------------------------------------------------------------------------------- objects

export function objectHooks(): ShaderHooks {
  return { ...lit(["hlAO"], AMBIENT_GLSL), skyLight: "ambientVisibility(vWorld, n) * " };
}

/** The landmarks (#67 stage 3): the High object material with a fine grain and patina close up. */
export function landmarkHooks(): ShaderHooks {
  return {
    ...lit(["hlAO", "hlObjectDetail"], AMBIENT_GLSL + "\n  varying vec3 hlLocal;"),
    skyLight: "ambientVisibility(vWorld, n) * ",
    objectVertexDecl: "\n      varying vec3 hlLocal;",
    objectVertex: "        hlLocal = position;\n",
    objectFinal: /* glsl */ `(hlObjectDetail > 0.5 ? vColor * (1.0 + (vnoise(hlLocal.xz * 31.7 + hlLocal.y * vec2(1.3, 19.1)) - 0.5) * 0.12 * (1.0 - smoothstep(0.025, 0.11, max(fwidth(vWorld.x), fwidth(vWorld.y)))) + (vnoise(hlLocal.xz * 5.7 + hlLocal.y * vec2(7.3, 3.1)) - 0.5) * 0.07) : vColor) * light`,
  };
}

/** Slopes (#67 stage 3): the ramp in natural materials, soil, stone and grass where moist. */
export function slopeHooks(): ShaderHooks {
  return {
    ...landmarkHooks(),
    decl: landmarkHooks().decl + /* glsl */ `
  vec3 hlSlopeColour(vec3 n) {
    vec2 g = vec2(vWorld.x, -vWorld.z);
    float grain = vnoise(g * 5.7), earthPatch = vnoise(g * 0.8 + 13.1);
    vec3 color = mix(vec3(0.34, 0.36, 0.33), vec3(0.43, 0.445, 0.405), grain);
    if (n.y > 0.5) {
      color = mix(vec3(0.39, 0.38, 0.37), vec3(0.47, 0.43, 0.36), earthPatch) * (0.90 + 0.16 * grain);
      float packed = floor(texture2D(tileTex, (floor(g) + 0.5) / mapSize).g * 255.0 + 0.5);
      float moist = step(1.0, floor(packed / 16.0));
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

// ---------------------------------------------------------------------------------------- the sky

/** #65's sky: a clear blue, the same pale horizon as the haze, soft static clouds above it, a broad
 *  glow toward the sun instead of a disc; graded like the land. */
export function skyHooks(): ShaderHooks {
  return {
    decl: switches(["hlSky", "hlTone", "hlGrade"]) + GRADE_GLSL,
    sky: /* glsl */ `
        if (hlSky > 0.5) {
          float horizon = exp(-abs(d.y) * 5.5);
          c = mix(vec3(0.30, 0.49, 0.76), vec3(0.29, 0.52, 0.79), horizon);
          if (d.y < 0.0) c = mix(vec3(0.19, 0.36, 0.55), c, exp(d.y * 3.0));
          vec2 hp = d.xz / (0.28 + abs(d.y)) * 4.2;
          float hn = vn(hp) * 0.52 + vn(hp * 2.07 + 3.7) * 0.30 + vn(hp * 4.31 + 19.1) * 0.18;
          float cloudBank = smoothstep(0.34, 0.62, vn(hp * 0.29 + 17.1));
          float hcloud = cloudBank * smoothstep(0.52, 0.73, hn) * (0.65 + 0.35 * smoothstep(0.0, 0.22, abs(d.y)));
          c = mix(c, vec3(0.97, 0.96, 0.89), hcloud * 0.46);
          float sun = pow(max(dot(d, normalize(vec3(-0.45, 0.77, -0.45))), 0.0), 24.0);
          c += vec3(0.11, 0.075, 0.028) * sun;
        }
        if (hlTone > 0.5 || hlGrade > 0.5) c = hlGradeColour(c);`,
  };
}
