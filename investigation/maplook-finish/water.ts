import { Vector2, Vector3, type ShaderMaterial } from 'three';
import { WATER } from '../../src/render3d/palette';

// Display-space palette, calibrated through the renderer (see colour-check.mjs).
// Targets are the user's measurements; these inputs also allow for the lit bed and finish.
export const CLEAN_PALETTE = {
  mlShallow: [34, 71.5, 86], mlBody: [33, 65, 77], mlDeep: [28, 49, 62],
  mlStreakAbove: [45, 83, 96], mlStreakLow: [56, 86, 98],
  mlGrazing: [51, 79, 91], mlStreakGrazing: [82.5, 127.5, 137],
} as const;
// Crimson body; the poisoned bed contributes only at very shallow edges.
export const MIX_PALETTE = { mlMix: [44,66,76], mlBad: [107,51,49] } as const;
// Keep the existing swirling texture and compensate its contrast for transmission.
export const BAD_DETAIL = { mlBadTrough: [-21,-8,-7], mlBadStreak: [12,15,5] } as const;

/** Our procedural water. Keep the baseline vertex layout, shared finish and map meanings. */
export function highWater(material: ShaderMaterial): ShaderMaterial {
  material.uniforms = { ...material.uniforms };
  material.uniforms.mlFlow = { value: null };
  material.uniforms.mlFlowSize = { value: new Vector2(1, 1) };
  for (const [name, rgb] of Object.entries({...CLEAN_PALETTE,...MIX_PALETTE,...BAD_DETAIL})) {
    material.uniforms[name] = { value: new Vector3(...rgb).divideScalar(255) };
  }
  const marker = '      /** The slope of the ripples';
  const i = material.fragmentShader.indexOf(marker);
  if (i < 0) throw new Error('Water shader bridge needs updating');
  material.fragmentShader = material.fragmentShader.slice(0, i) + /* glsl */ `
vec3 rippleNormal(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  slope += cos(dot(p, vec2(1.1, 0.4)) + t * 1.05) * vec2(1.1, 0.4) * 0.065;
  slope += cos(dot(p, vec2(-0.5, 1.7)) - t * 0.82) * vec2(-0.5, 1.7) * 0.038;
  slope += cos(dot(p, vec2(3.2, 2.1)) + t * 1.4) * vec2(3.2, 2.1) * 0.012;
  float detail = 1.0 - smoothstep(0.1, 0.5, max(fwidth(p.x), fwidth(p.y)));
  return normalize(vec3(slope.x * detail, 1.0, -slope.y * detail));
}
uniform vec3 mlShallow, mlBody, mlDeep, mlStreakAbove, mlStreakLow, mlGrazing, mlStreakGrazing;
uniform vec3 mlMix, mlBad;
uniform vec3 mlBadTrough, mlBadStreak;
uniform sampler2D mlFlow;
uniform vec2 mlFlowSize;
float fleckHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float detailNoise(vec2 p) {
  vec2 cell=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
  return mix(mix(fleckHash(cell),fleckHash(cell+vec2(1.0,0.0)),u.x),
    mix(fleckHash(cell+vec2(0.0,1.0)),fleckHash(cell+1.0),u.x),u.y);
}
// Short irregular crests at two incommensurate scales. World-space hashing has
// no tiled texture, repeated strip or long sine band. Advection follows local flow.
float chop(vec2 p) {
  vec2 warp = vec2(detailNoise(p*1.73+8.0), detailNoise(p*1.91-17.0)) - 0.5;
  vec2 q = mat2(0.91,0.41,-0.41,0.91) * (p + warp*0.19);
  float coarse = detailNoise(q*vec2(3.3,7.1));
  float fine = detailNoise(mat2(0.63,-0.78,0.78,0.63)*p*11.3+31.7);
  return coarse*0.82+fine*0.18;
}
float microFlecks(vec2 p, float t, float speed, float pixel) {
  vec2 cell = floor(p*7.0);
  vec2 point = vec2(fleckHash(cell+13.0),fleckHash(cell+47.0))*0.6+0.2;
  float radius = max(pixel*7.0*0.5,0.065);
  float spot = 1.0-smoothstep(radius*0.25,radius,length(fract(p*7.0)-point));
  float twinkle = smoothstep(0.1,0.85,sin(t*(1.1+speed*1.2)+fleckHash(cell)*51.0));
  return spot * step(mix(0.96,0.82,speed),fleckHash(cell+91.0)) * twinkle;
}
float badwaterOpacity(float depth, float shore, float grazing) {
  float edge=(1.0-smoothstep(0.03,0.18,depth))*(1.0-smoothstep(0.04,0.30,shore));
  return max(mix(0.975,0.995,smoothstep(0.25,1.80,depth))-0.52*edge,grazing*0.85);
}
vec4 measuredSurfaceWater(vec2 g, float depth, float shore, float contamination, vec3 N, vec3 V, float lit, float t) {
  float bodyDepth = smoothstep(0.25, 1.25, depth);
  float deep = smoothstep(1.25, 4.25, depth);
  vec3 body = mix(mix(mlShallow, mlBody, bodyDepth), mlDeep, deep);
  // Above: >=55 degrees; low: 30 degrees; grazing: about 10 degrees above water.
  float facing = clamp(V.y + (N.x + N.z) * 0.05, 0.0, 1.0);
  float low = 1.0 - smoothstep(0.50, 0.82, facing);
  float grazing = 1.0 - smoothstep(0.18, 0.50, facing);
  body = mix(body, mlGrazing, grazing);
  vec3 streakColour = mix(mix(mlStreakAbove, mlStreakLow, low), mlStreakGrazing, grazing);
  // A continuous concentration gradient, never a stochastic red/blue mask.
  // The supplied warm mixing sample anchors a mostly-clean (25%) concentration.
  vec3 cleanBody=body;
  vec3 mixedBody=mlMix+(body-mlBody)*0.25;
  vec3 badBody=mlBad*(1.0-deep*0.12)+vec3(0.0012,0.0008,0.0006)*grazing;
  body=contamination<=0.25 ? mix(body,mixedBody,contamination/0.25) : mix(mixedBody,badBody,(contamination-0.25)/0.75);
  // Preserve the same crest/fleck field on both sides of the front.
  vec3 badCrest=mix(vec3(0.035,0.023,0.018)+vec3(0.008,0.006,0.004)*low,
    vec3(0.009,0.007,0.004)+vec3(0.0008,0.0006,0.0004)*low,smoothstep(0.25,1.0,contamination));
  streakColour=body+mix(streakColour-cleanBody,badCrest,contamination);
  vec2 velocity = (texture2D(mlFlow,g/mlFlowSize).rg*255.0-128.0)/63.5;
  float speed = smoothstep(0.02,1.2,length(velocity));
  // Still lakes retain a little slow wind motion; current dominates in channels.
  vec2 drift = velocity*0.65 + vec2(0.018,-0.012)*(1.0-speed);
  // Two overlapping phases prevent accumulated flow-map stretching or a reset pop.
  float phase = fract(t/12.0), second = fract(t/12.0+0.5);
  float blend = abs(phase*2.0-1.0);
  vec2 p = g-drift*(phase*12.0), p2 = g-drift*(second*12.0)+vec2(19.13,7.71);
  float pixel = max(fwidth(g.x), fwidth(g.y));
  float near = 1.0 - smoothstep(0.18, 0.80, pixel);
  float texture = 0.5+(mix(chop(p),chop(p2),blend)-0.5)/sqrt(blend*blend+(1.0-blend)*(1.0-blend));
  float streak = smoothstep(0.51,0.79,texture) * near;
  vec3 colour = mix(body, streakColour, streak);
  if(contamination>0.25) {
    // The same advected texture drives crimson troughs and lighter crests.
    // Keep contrast continuous as the badwater body becomes more opaque.
    float trough=(1.0-smoothstep(0.20,0.38,texture))*near;
    float signalOpacity=mix(0.40,0.94,smoothstep(0.05,1.80,depth));
    signalOpacity=mix(0.30,signalOpacity,smoothstep(0.0,0.20,shore));
    signalOpacity=max(signalOpacity,grazing*0.62);
    signalOpacity=mix(signalOpacity,badwaterOpacity(depth,shore,grazing),smoothstep(0.25,1.0,contamination));
    colour += (mlBadTrough*trough+mlBadStreak*streak)
      *((contamination-0.25)/0.75)/signalOpacity;
  }
  // Palette is anchored in full sun; preserve the existing sun's shadow attenuation.
  vec3 referenceLight = skyColor*1.05 + sunColor*0.42*max(sunDir.y, 0.0);
  vec3 rippleLight = skyColor*1.05 + sunColor*0.42*max(dot(normalize(mix(vec3(0.0,1.0,0.0),N,0.35)),sunDir),0.0)*lit;
  colour *= rippleLight / max(referenceLight, vec3(0.01));
  // Many tiny facets, denser in fast flow. Clean water keeps its accepted colour.
  float glint = mix(microFlecks(p,t,speed,pixel),microFlecks(p2,t,speed,pixel),blend);
  glint *= lit*(1.0-smoothstep(0.08,0.22,pixel));
  // Keep the facet positions and motion, but make polluted water duller
  // even in greyscale. Its highlights catch warm light, not a cool sky lobe.
  glint *= mix(1.0,0.35,contamination);
  // Matte badwater: retain rare dull facets, never a pink glossy highlight.
  // Fade above the mostly-clean anchor; clean reflection remains untouched.
  glint *= mix(1.0,0.08,smoothstep(0.25,1.0,contamination));
  colour = mix(colour, mix(vec3(0.97,0.985,1.0),vec3(0.78,0.67,0.56),contamination), glint);
  // Retain Standard's own slow glowing badwater bubbles as a distinct cue.
  if(contamination>0.01) {
    float bt=t*mix(1.0,0.55,contamination);
    float fine=1.0-smoothstep(0.03,0.09,fwidth(g.x));
    float bubbles=fine*smoothstep(0.83,0.93,vnoise(g*5.0+vec2(bt*0.05,-bt*0.08)))
      *smoothstep(0.55,0.8,vnoise(g*1.3-vec2(0.0,bt*0.04)));
    colour += vec3(${WATER.badVein.join(',')})*bubbles*contamination*0.55;
  }
  // Faint real transmission, strongest over the shallow terrace and close to its bank.
  float alpha = mix(mix(0.86,0.96,bodyDepth),0.995,deep);
  alpha = mix(0.76,alpha,smoothstep(0.0,0.20,shore));
  alpha = max(alpha, grazing*0.98);
  float badAlpha=mix(0.40,0.94,smoothstep(0.05,1.80,depth));
  badAlpha=mix(0.30,badAlpha,smoothstep(0.0,0.20,shore));
  badAlpha=max(badAlpha,grazing*0.62);
  alpha = mix(alpha,badAlpha,contamination);
  alpha = mix(alpha,badwaterOpacity(depth,shore,grazing),smoothstep(0.25,1.0,contamination));
  return vec4(colour,alpha);
}
void main() {
  vec3 n = normalize(vNormal);
  vec2 g = vec2(vWorld.x, -vWorld.z);
  vec2 fr = fract(g);
  float cont = clamp(vData.y, 0.0, 1.0);
  float t = time * mix(1.0, 0.55, cont);
  // Mixed water remains streaked with its actual contamination share.
  float stream = vnoise(vec2(g.x * 1.4 + sin(g.y * 0.8), g.y * 3.8 - t * 0.16));
  float bad = cont >= 0.95 ? 1.0 : (cont <= 0.05 ? cont :
    mix(cont * 0.55, 1.0, smoothstep(1.0 - cont - 0.20, 1.0 - cont + 0.20, stream)));
  float shore = 1.0;
  float fall = 1.0;
  if (n.y > 0.5) {
    if (bitOf(vFlags, 1.0) > 0.5) shore = min(shore, 1.0-fr.x);
    if (bitOf(vFlags, 2.0) > 0.5) shore = min(shore, fr.x);
    if (bitOf(vFlags, 4.0) > 0.5) shore = min(shore, 1.0-fr.y);
    if (bitOf(vFlags, 8.0) > 0.5) shore = min(shore, fr.y);
    if (bitOf(vFlags, 16.0) > 0.5) fall = min(fall, 1.0-fr.x);
    if (bitOf(vFlags, 32.0) > 0.5) fall = min(fall, fr.x);
    if (bitOf(vFlags, 64.0) > 0.5) fall = min(fall, 1.0-fr.y);
    if (bitOf(vFlags, 128.0) > 0.5) fall = min(fall, fr.y);
  }
  float d = max(0.0, vData.x) * mix(0.10, 1.0, smoothstep(0.0, 0.55, shore));
  float absorb = 1.0 - exp(-d * 0.65);
  vec3 clean = mix(vec3(0.13, 0.58, 0.60), vec3(0.045, 0.36, 0.48), absorb);
  clean = mix(clean, vec3(0.025, 0.16, 0.30), 1.0-exp(-max(d-2.0, 0.0)*0.32));
  vec3 murky = mix(vec3(0.19, 0.064, 0.034), vec3(0.060, 0.022, 0.018), absorb);
  vec3 c = mix(clean, murky, bad);
  // Let the bed show at the banks, without letting its dark colour muddy the whole river.
  float bank = smoothstep(0.03, 0.65, shore);
  float cleanAlpha = mix(0.13 + 0.35 * absorb, 0.62 + 0.34 * absorb, bank);
  cleanAlpha *= smoothstep(0.0, 0.12, vData.x);
  float alpha = mix(cleanAlpha, 0.91 + 0.07 * absorb, bad);
  vec3 N = n.y > 0.5 ? rippleNormal(g, time) : n;
  vec3 V = normalize(cameraPosition - vWorld);
  float lit = sunLit(g, vWorld.y);
  c *= skyColor * 1.05 + sunColor * 0.42 * max(dot(N, sunDir), 0.0) * lit;
  float foam = 0.0;
  if (n.y > 0.5) {
    // A broadened Fresnel lobe over our own sky; readable at normal orbit angles too.
    vec3 R = reflect(-V, N);
    float fresnel = 0.035 + 0.965 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float cloud = smoothstep(0.48, 0.78, vnoise(R.xz * 5.0 / max(0.25, abs(R.y))));
    vec3 sky = mix(vec3(0.74, 0.86, 0.94), vec3(0.32, 0.58, 0.79), clamp(R.y, 0.0, 1.0));
    sky = mix(sky, vec3(0.91, 0.95, 0.96), cloud * 0.32);
    c = mix(c, sky, fresnel * mix(0.90, 0.20, bad));
    alpha = max(alpha, fresnel * 0.88);
    // Fine glints only where a wave reflects the sun. No random white flecks.
    float aa = 1.0 - smoothstep(0.05, 0.22, max(fwidth(g.x), fwidth(g.y)));
    float spec = pow(max(dot(reflect(-sunDir, N), V), 0.0), 95.0);
    c += sunColor * spec * 0.40 * aa * lit * (1.0 - bad * 0.92);
    // Long moving crest highlights, broken by low-frequency noise, not random white flecks.
    float wave = sin(dot(g, vec2(1.7, 3.1)) - t * 1.8 + vnoise(g * 0.65) * 5.0);
    float width = max(fwidth(wave) * 0.8, 0.09);
    float crest = smoothstep(0.80-width*0.5, 0.98+width*0.5, wave);
    float broken = smoothstep(0.30, 0.68, vnoise(g * 1.1 + vec2(t*0.13, -t*0.09)));
    float crossing = sin(dot(g, vec2(-2.4, 4.8)) + t * 1.15 + vnoise(g*0.9+7.0)*4.0);
    crest = crest * broken + 0.22 * smoothstep(0.84-width, 1.0+width, crossing) * (1.0-broken);
    float near = 1.0 - smoothstep(0.20, 0.90, max(fwidth(g.x), fwidth(g.y)));
    float catchLight = 0.60 + 0.40 * max(dot(N, sunDir), 0.0) * lit;
    c = mix(c, vec3(0.36, 0.76, 0.85) * catchLight, crest * near * 0.65 * (1.0-bad));
    c += vec3(0.028, 0.050, 0.060) * smoothstep(-0.04, 0.08, N.x + N.z) * (1.0-bad);
    // Slow broken brown ribbons keep murky water visibly liquid even from above.
    float ribbon = smoothstep(0.48, 0.72, vnoise(vec2(g.x*0.8+g.y*0.25, g.y*4.3-g.x*0.6-t*0.35)));
    c += vec3(0.080, 0.043, 0.025) * ribbon * bad;
    float noise = vnoise(g * 4.0 + vec2(t*0.1, -t*0.2));
    foam = (1.0-smoothstep(0.015, 0.16, shore)) * (0.26 + noise * 0.38);
    float churn = vnoise(g*6.0 + vec2(t*0.7, -t*1.4));
    foam += (1.0-smoothstep(0.12, 0.95, fall)) * (0.72+0.45*churn);
  } else {
    bool edge = vFlags > 254.5;
    float drop = edge ? 0.0 : vFlags / 30.0;
    float along = abs(n.x) > 0.5 ? g.y : g.x;
    float streak = vnoise(vec2(along*7.0, vWorld.y*1.4+t*3.6));
    float strands = smoothstep(0.30, 0.72, streak);
    foam = edge ? 0.0 : smoothstep(0.12, 0.6, drop) * (0.42+strands*0.60);
    alpha = edge ? mix(0.78, 0.96, bad) : (0.32+0.53*strands)*smoothstep(0.06, 0.25, drop);
    if (alpha < 0.01) discard;
  }
  // Waterfall curtains retain their accepted path; all tops share one detail field.
  if (n.y > 0.5) {
    bad=texture2D(mlFlow,g/mlFlowSize).b;
    vec4 matched = measuredSurfaceWater(g, d, shore, bad, N, V, lit, time);
    c = matched.rgb;
    alpha = matched.a;
  }
  foam *= 1.0 - bad * 0.55;
  foam = clamp(foam, 0.0, 1.0);
  c = mix(c, mix(vec3(0.90, 0.96, 0.98), vec3(0.31, 0.17, 0.085), bad) * (0.85+0.15*lit), foam);
  alpha = mix(alpha, 0.97, foam);
  gl_FragColor = vec4(finish(c, vWorld), alpha);
}
`;
  return material;
}
