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
// Round 2: accepted palette, richer original procedural materials.
edit(P,'moistLow: [0.57, 0.68, 0.25]','moistLow: [0.47, 0.605, 0.24]');
edit(P,'moistHigh: [0.535, 0.655, 0.225]','moistHigh: [0.435, 0.575, 0.225]');
// Pattern coordinates alone are warped; terrain and soil data remain unchanged.
edit(M,'float n1 = vnoise(g * 1.3);', `vec2 macroUV = mat2(0.8, -0.6, 0.6, 0.8) * g * 0.037;
        vec2 patternWarp = vec2(vnoise(macroUV + 23.7), vnoise(macroUV * 1.73 + 91.2)) - 0.5;
        g += patternWarp * 3.2;
        float n1 = vnoise(g * 1.3);`);
edit(M,'vec2 bladeUV = g * 9.0;',`vec2 bladeUV = mat2(0.91, -0.415, 0.415, 0.91) * g * 7.0;
        bladeUV += vec2(vnoise(g * 2.7), vnoise(g * 2.1 + 41.0)) * 2.0;`);
edit(M,'float tex = 0.94 + 0.25 * tuft + painted * 0.30 * detail + 0.10 * blade * detail;',`float tex = 0.91 + 0.31 * tuft + painted * (0.18 + bladeHash * 0.24) * detail + 0.09 * blade * detail;`);
edit(M,'grass * vec3(1.1, 1.04, 0.78)','grass * vec3(1.035, 1.045, 0.97)');
edit(M,'(1.0 - 0.12 * blot)','(1.0 - 0.27 * blot)');
edit(M,'0.84 + 0.18 * b1 + 0.08 * (n1 - 0.5)','0.80 + 0.27 * b1 + 0.14 * (n1 - 0.5)');
// Narrow wavy soil boundaries cross equal-height neighbours only.
edit(M,'vec2 ws = smoothstep(0.5 - bandW, 0.5, w) * 0.5;',`vec2 edgeWave = vec2(vnoise(g * 6.7 + 17.0), vnoise(g * 5.3 + 47.0)) - 0.5;
          vec2 ws = smoothstep(vec2(0.5 - bandW), vec2(0.5 + bandW), w + edgeWave * sd * 0.105);`);
edit(M,'} else c = ground;',`} else {
            float rim = 1.0 - smoothstep(0.06, 0.24, abs(soil.x - 0.5));
            c = ground * (1.0 - rim * 0.22);
          }`);
// Rounded relief is stored in the atlas, with soft mortar and directional bevel lighting.
edit(M,'float mortar = smoothstep(0.05, 0.16, k.y - k.x);','float mortar = smoothstep(0.018, 0.29, k.y - k.x);');
edit(M,'float stone = mortar * (0.5 + 0.5 * k.z) * (0.9 + 0.2 * valueNoise(vUv * kp * 3.0, kp * 3.0));',`float stone = mortar * (0.74 + 0.26 * k.z) * (0.94 + 0.06 * valueNoise(vUv * kp * 3.0, kp * 3.0));`);
edit(H,'vec3(0.105, 0.103, 0.076), stone * shade * (0.72 + k * 0.44 + (vnoise(vec2(along * 8.1, y * 9.3)) - 0.5) * 0.28), smoothstep(0.12, 0.38, k)', 'vec3(0.18, 0.175, 0.132) * shade, stone * shade * (0.66 + k * 0.50 + (vnoise(vec2(along * 8.1, y * 9.3)) - 0.5) * 0.13), smoothstep(0.0, 0.72, k)');
edit(M,'clamp(bevel * 1.25, -0.25, 0.28)','clamp(bevel * 1.7, -0.32, 0.36)');
edit(M,'(1.0 - 0.48 * seam) * (1.0 - 0.30 * vertical)','(1.0 - 0.18 * seam) * (1.0 - 0.10 * vertical)');
// Keep the horizon blue and permit cloud coverage in grazing views.
edit(H,'vec3(0.78, 0.84, 0.91), horizon','vec3(0.29, 0.52, 0.79), horizon');
edit(H,'smoothstep(0.03, 0.22, abs(d.y))','(0.65 + 0.35 * smoothstep(0.0, 0.22, abs(d.y)))');
edit(H,'smoothstep(0.55, 0.79, hn)','smoothstep(0.49, 0.73, hn)');
edit(H,'max(abs(d.y), 0.12) * 3.8','(0.28 + abs(d.y)) * 3.8');
// Two-phase advection avoids a twelve-second reset; ribbons follow the baked current.
edit(H,/    \/\/ Advected two-scale network[\s\S]*?    colour \+= vec3\(0\.26, 0\.035, 0\.008\)/,`    vec2 direction = normalize(mix(vec2(0.8, 0.6), normalize(velocity + vec2(0.0001, 0.0002)), speed));
    vec2 across = vec2(-direction.y, direction.x);
    vec2 flowA = vec2(dot(p, across) * 2.8, dot(p, direction) * mix(2.1, 0.42, speed));
    vec2 flowB = vec2(dot(p2, across) * 2.8, dot(p2, direction) * mix(2.1, 0.42, speed));
    flowA += vec2(vnoise(p * 0.71), vnoise(p * 0.83 + 8.1)) * 2.2;
    flowB += vec2(vnoise(p2 * 0.71), vnoise(p2 * 0.83 + 8.1)) * 2.2;
    float network = mix(cracks(flowA).x, cracks(flowB).x, blend);
    float ribbons = mix(smoothstep(0.49, 0.72, vnoise(flowA * vec2(1.7, 0.7))), smoothstep(0.49, 0.72, vnoise(flowB * vec2(1.7, 0.7))), blend);
    float broad = mix(vnoise(p * 0.51), vnoise(p2 * 0.51), blend);
    float rough = texture2D(hlRough, g / hlFlowSize).r * hlRiver;
    float highlights = (network * 0.67 + ribbons * (0.20 + rough * 0.35)) * (0.62 + broad * 0.65);
    highlights *= mix(1.0, 0.68, deep);
    vec3 networkColour = mix(vec3(0.34, 0.61, 0.73), vec3(0.85, 0.43, 0.43), contamination);
    colour *= 0.80 + broad * 0.40;
    colour = mix(colour, networkColour, clamp(highlights, 0.0, 0.82));
    colour += vec3(0.26, 0.035, 0.008)`);
edit(H,'0.0, 1.0) * 0.20;','0.0, 1.0) * 0.30;');
edit(H,'mix(HW_FOAM, HW_BAD_FOAM, hlBad)','mix(vec3(0.35, 0.61, 0.69), vec3(0.71, 0.34, 0.30), hlBad)');
edit(M,'float whiteStreak = smoothstep(0.55, 0.9, streak);',`float whiteStreak = smoothstep(0.43, 0.82, streak);
            float thread = vnoise(vec2(along * 37.0 + sin(phi * 1.2) * 0.5, phi * 0.46 - t * 2.3));
            whiteStreak = clamp(whiteStreak * 0.68 + smoothstep(0.48, 0.76, thread) * 0.55, 0.0, 1.0);`);
edit(M,'whiteStreak * 0.50','whiteStreak * 0.78');

edit(H,'float texture =','float waterTexture =');
edit(H,', texture)',', waterTexture)');

// Final visual tuning from the paired and dedicated renders.
edit(W,'grazing: [51 / 255, 79 / 255, 91 / 255]','grazing: [0.07, 0.14, 0.23]');
edit(H,'body = mix(body, HW_GRAZING, grazing);','body = mix(body, HW_GRAZING * mix(1.0, 0.72, deep), grazing * 0.65);');
edit(H,'network * 0.67 + ribbons * (0.20 + rough * 0.35)','network * (0.18 + broad * 0.72) + ribbons * (0.16 + rough * 0.43)');
edit(H,'(0.62 + broad * 0.65)','(0.35 + broad * 0.80)');
edit(H,'hcloud * 0.72','hcloud * 0.46');
edit(H,'(0.28 + abs(d.y)) * 3.8','(0.28 + abs(d.y)) * 8.0');
edit(P,'moistLow: [0.47, 0.605, 0.24]','moistLow: [0.445, 0.575, 0.28]');
edit(P,'moistHigh: [0.435, 0.575, 0.225]','moistHigh: [0.415, 0.55, 0.265]');
edit(M,'painted * (0.18 + bladeHash * 0.24)','painted * (0.08 + bladeHash * 0.16)');
edit(M,'(1.0 - 0.27 * blot)','(1.0 - 0.19 * blot)');
edit(H,'vec3(0.28, 0.13, 0.08), max(veinD, veinW) * 0.90','vec3(0.30, 0.075, 0.028), max(veinD, veinW) * 0.90');
edit(H,'mix(0.50, 0.90, lvl)','mix(0.24, 0.48, lvl)');
edit(H,'vec3(0.18, 0.175, 0.132) * shade','vec3(0.235, 0.23, 0.18) * shade');
edit(M,'clamp(bevel * 1.7, -0.32, 0.36)','clamp(bevel * 1.35, -0.20, 0.27)');

edit(H,'float network = mix(cracks(flowA).x, cracks(flowB).x, blend);',`float network = mix(cracks(flowA).x * smoothstep(0.28, 0.66, vnoise(p * 4.2 + 31.0)), cracks(flowB).x * smoothstep(0.28, 0.66, vnoise(p2 * 4.2 + 31.0)), blend);`);
export function transform(file, source) {
  let s=source.replaceAll('\r\n','\n');
  for(const {before,after} of changes.get(file)||[]) {
    if(typeof before==='string' ? !s.includes(before) : !before.test(s)) throw Error('Proposal anchor missing in '+file+': '+before);
    s=typeof before==='string' ? s.replaceAll(before,after) : s.replace(before,after);
  }
  return s;
}
export function proposalPlugin() {return {name:'high-soul-proposal',enforce:'pre',transform(src,id){const f=id.replaceAll('\\','/').split('/src/')[1];if(f&&changes.has('src/'+f))return {code:transform('src/'+f,src),map:null};}};}
