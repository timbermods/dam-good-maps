import {readFileSync} from 'node:fs';
// Original procedural proposal, MIT (repository license). No reference pixel becomes a texture.
export const BASE = '8c975822';
export const changes = new Map();
function edit(file, before, after) {
  const entries=changes.get(file)||[]; entries.push({before,after}); changes.set(file,entries);
}
const P='src/render3d/palette.ts', M='src/render3d/materials.ts', H='src/render3d/high/shaders.ts', W='src/render3d/waterPalette.ts';
for(const [a,b] of [
 ['dry: [0.41, 0.415, 0.39]','dry: [0.48, 0.405, 0.35]'],
 ['dryCool: [0.4, 0.4, 0.415]','dryCool: [0.46, 0.415, 0.445]'],
 ['dryWarm: [0.46, 0.415, 0.365]','dryWarm: [0.54, 0.44, 0.345]'],
 ['crack: [0.19, 0.17, 0.17]','crack: [0.19, 0.14, 0.125]'],
 ['moistLow: [0.5, 0.655, 0.32]','moistLow: [0.57, 0.68, 0.25]'],
 ['moistHigh: [0.48, 0.635, 0.3]','moistHigh: [0.535, 0.655, 0.225]'],
 ['stone: [0.49, 0.535, 0.56]','stone: [0.40, 0.395, 0.29]'],
 ['mortar: [0.2, 0.215, 0.23]','mortar: [0.13, 0.125, 0.095]'],
 ['rust: [0.553, 0.337, 0.192]','rust: [0.83, 0.47, 0.12]'],
 ['panel: [0.722, 0.655, 0.459]','panel: [0.89, 0.81, 0.59]'],
 ['far: [0.47, 0.39, 0.28]','far: [0.72, 0.43, 0.19]'],
 ['glowWet: [0.05, 0.25]','glowWet: [0.32, 0.65]'],
 ]) edit(P,a,b);
// Broad crack plates, continuous dark joins, low-frequency painted variation. Keep 16x anisotropy.
edit(M,'const PATTERN_SIZE = 512;','const PATTERN_SIZE = 1024;');
edit(M,'vec2 dry = cracks(g * 1.9);','vec2 dry = cracks(g * 3.1);');
edit(M,'smoothstep(0.5, 0.8, b2) * 0.6','smoothstep(0.32, 0.72, b2) * 0.85');
edit(M,'dry.x * open * (0.4 + 0.25 * detail)','dry.x * (0.58 + 0.20 * detail)');
edit(M,'0.05 * (dry.y - 0.5)','0.22 * (dry.y - 0.5)');
edit(M,'float tex = 1.0 + 0.16 * tuft + (0.14 * blade + 0.2 * n3) * detail;',`vec2 bladeUV = g * 9.0;
        vec2 bladeCell = floor(bladeUV);
        float bladeHash = fract(sin(dot(bladeCell, vec2(127.1, 311.7))) * 43758.5453);
        float bladeTurn = bladeHash * 6.28318;
        vec2 bf = fract(bladeUV) - vec2(0.20 + bladeHash * 0.6, 0.20 + fract(bladeHash * 13.7) * 0.6);
        bf = mat2(cos(bladeTurn), -sin(bladeTurn), sin(bladeTurn), cos(bladeTurn)) * bf;
        float bladeAA = max(0.025, max(fwidth(bladeUV.x), fwidth(bladeUV.y)));
        float painted = (1.0 - smoothstep(0.04, 0.04 + bladeAA, abs(bf.x + bf.y * 0.25))) * (1.0 - smoothstep(0.18, 0.42, abs(bf.y)));
        float tex = 0.94 + 0.25 * tuft + painted * 0.30 * detail + 0.10 * blade * detail;`);
edit(M,'detail * 0.07 * n3','detail * 0.20 * n3');
// Shared cliff form: large warped cobbles, deep vertical joints and a dark band at each level.
edit(M,'cobble(vec2(along * 2.0, y * 2.0))','cobble(vec2(along * 1.5 + (vnoise(vec2(along * 0.7, y)) - 0.5) * 0.35, y * 1.6))');
edit(M,'float ao = 1.0 - 0.55 * clamp(ox + oy + od - ox * oy, 0.0, 1.0);',`float topLip = max(step(0.5, h0 - hx) * (1.0 - smoothstep(0.025, max(0.06, fwidth(g.x)), 0.5 - w.x)), step(0.5, h0 - hy) * (1.0 - smoothstep(0.025, max(0.06, fwidth(g.y)), 0.5 - w.y)));
          c *= 1.0 - topLip * 0.30;
          float ao = 1.0 - 0.75 * clamp(ox + oy + od - ox * oy, 0.0, 1.0);`);
edit(M,'c = mix(wc, top, lip * 0.9);',`vec2 stoneUV = vec2(along * 1.5 + (vnoise(vec2(along * 0.7, y)) - 0.5) * 0.35, y * 1.6);
          float bevel = cobble(stoneUV + vec2(0.055, 0.075)) - cobble(stoneUV - vec2(0.055, 0.075));
          wc *= 1.0 + clamp(bevel * 1.25, -0.25, 0.28);
          float seamAA = max(0.012, fwidth(y));
          float seam = (1.0 - smoothstep(0.025, 0.025 + seamAA, min(fy, 1.0 - fy))) * (1.0 - smoothstep(0.25, 0.6, seamAA));
          float vertical = cracks(vec2(along * 0.43, y * 0.11)).x;
          wc *= (1.0 - 0.48 * seam) * (1.0 - 0.30 * vertical);
          c = mix(wc, top * 0.58, lip * 0.55);`);
edit(W,'export const WATER = {', 'export const WATER = {\n  fallTeal: [0.27, 0.64, 0.71] as Rgb,\n  fallBad: [0.55, 0.15, 0.065] as Rgb,\n  fallBadStreak: [0.87, 0.32, 0.12] as Rgb,');
edit(W,'#define WATER_TEAL', '#define SOUL_FALL_TEAL ${glColor(WATER.fallTeal)}\n  #define SOUL_FALL_BAD_STREAK ${glColor(WATER.fallBadStreak)}\n  #define WATER_TEAL');

// Shared sheet treatment, including Standard. Geometry and flow are unchanged.
edit(M,'c = mix(c, foamColour, foam);','c = mix(c, foamColour, foam * 0.18);');
edit(M,'c = mix(body, streaks, whiteStreak * 0.3) * light;','c = mix(body, mix(SOUL_FALL_TEAL, SOUL_FALL_BAD_STREAK, bad), whiteStreak * 0.50) * light;');
edit(M,'alpha = mix(FALL_CLEAR, FALL_STREAK, streak);','alpha = mix(0.76, 0.94, streak);');
// All fall crowns/landings get tinted and less opaque, retaining the landing silhouettes.
edit(M,'c = foamColour;','c = mix(waterBlend(WATER_TEAL, BADWATER_BODY, cont), foamColour, 0.20);');
edit(M,'alpha = foam * FALL_FOAM;','alpha = foam * FALL_FOAM * 0.46;');
// Neutral exposure; keep enough sun for bright tops, reduce ambient on side faces instead.
edit(H,'hlShoulder(c * 1.22)','hlShoulder(c * 1.0)');
edit(H,'mix(0.65, 0.98, smoothstep(0.35, 0.75, vividness)) * (1.0 - 0.20 * warmNeutral)','mix(0.90, 1.0, smoothstep(0.35, 0.75, vividness))');
edit(H,'c *= 1.0 - 0.11 * moist * hlTone;','c *= 1.0;');
edit(H,'return max(0.58, terrain * canopy);','return max(0.40, terrain * canopy);');
// Replace the two named hook bodies, not the product files.
edit(H,/groundEnd: \/\* glsl \*\/ `[\s\S]*?`,\n    \/\/ the poisoned bed/,`groundEnd: /* glsl */ \`        if (hlPoison > 0.5 && bad > 0.0) {
          c = mix(hlCleanGround, vec3(0.28, 0.13, 0.08), max(veinD, veinW) * 0.90);
          glow = max(veinD, veinW) * mix(0.50, 0.90, lvl);
        }
\`,
    // the poisoned bed`);
edit(H,/wall: \/\* glsl \*\/ `[\s\S]*?`,\n    wallLines:/,`wall: /* glsl */ \`          if (hlStrata > 0.5) {
            vec3 stone = mix(vec3(0.35, 0.355, 0.26), vec3(0.51, 0.47, 0.34), vnoise(vec2(along * 0.32, y * 0.4)));
            wc = mix(vec3(0.105, 0.103, 0.076), stone * shade * (0.72 + k * 0.44 + (vnoise(vec2(along * 8.1, y * 9.3)) - 0.5) * 0.28), smoothstep(0.12, 0.38, k));
          }
\`,
    wallLines:`);
edit(H,'max(markers, hlStrata * 0.22)','markers');
// Prevent the geological boundary hook from painting over the flagstones; keep the cap code.
edit(H,'if (hlGeology > 0.5) c = stone * light;','if (hlGeology > 0.5) c *= 0.94;');
edit(H,'smoothstep(0.03, 0.22, d.y)','smoothstep(0.03, 0.22, abs(d.y))');
edit(H,'hcloud * 0.55','hcloud * 0.72');
edit(H,'vec3(0.49, 0.71, 0.89)','vec3(0.19, 0.36, 0.55)');
edit(H,'vec3(0.39, 0.65, 0.91)','vec3(0.30, 0.49, 0.76)');
edit(H,'max(abs(d.y), 0.12) * 1.1','max(abs(d.y), 0.12) * 3.8');
// Deeper navy; no global brightness change to UI or markers.
for(const [a,b] of [
 ['shallow: [46.5 / 255, 91.5 / 255, 108.5 / 255]','shallow: [0.13, 0.29, 0.36]'],
 ['body: [44.5 / 255, 88 / 255, 104 / 255]','body: [0.08, 0.20, 0.28]'],
 ['deep: [37 / 255, 73.5 / 255, 87 / 255]','deep: [0.045, 0.12, 0.19]'],
 ['bad: [94 / 255, 45 / 255, 43 / 255]','bad: [0.32, 0.075, 0.062]'],
 ['badGlint: [0.78, 0.67, 0.56]','badGlint: [0.86, 0.58, 0.55]'],
 ]) edit(W,a,b);
edit(H,'float deep = smoothstep(1.25, 4.25, depth);','float deep = smoothstep(1.0, 3.5, depth);');
edit(H,'vec3 colour = mix(body, streakColour, streak);',`vec3 colour = mix(body, streakColour, streak * 0.45);
    // Advected two-scale network from our existing Voronoi atlas; no reference textures.
    vec2 causticUV = p * 2.3 + vec2(vnoise(p * 0.63), vnoise(p * 0.63 + 8.1)) * 1.8;
    float caustic = cracks(causticUV).x;
    float netFar = cracks(p * 0.65 + 14.7).x;
    float network = mix(netFar * 0.80, caustic, near);
    vec3 networkColour = mix(vec3(0.36, 0.61, 0.66), vec3(0.76, 0.44, 0.42), contamination);
    colour = mix(colour, networkColour, network * 0.50);
    colour += vec3(0.26, 0.035, 0.008) * contamination * (1.0 - smoothstep(0.0, 0.32, shore));`);
edit(H,'hlFoam = clamp(hlFoam * (1.0 - hlBad * 0.55), 0.0, 1.0);','hlFoam = clamp(hlFoam * (1.0 - hlBad * 0.55), 0.0, 1.0) * 0.20;');
edit(H,'waterBlend(HW_SHALLOW * 1.06, badwaterBody(0.25), cont)','waterBlend(HW_SHALLOW * 1.06, vec3(0.55, 0.15, 0.065), cont)');
export function transform(file, source) {
  let s=source.replaceAll('\r\n','\n');
  for(const {before,after} of changes.get(file)||[]) {
    if(typeof before==='string' ? !s.includes(before) : !before.test(s)) throw Error('Proposal anchor missing in '+file+': '+before);
    s=typeof before==='string' ? s.replaceAll(before,after) : s.replace(before,after);
  }
  return s;
}
export function proposalPlugin() {return {name:'high-soul-proposal',enforce:'pre',transform(src,id){const f=id.replaceAll('\\','/').split('/src/')[1];if(f&&changes.has('src/'+f))return {code:transform('src/'+f,src),map:null};}};}
