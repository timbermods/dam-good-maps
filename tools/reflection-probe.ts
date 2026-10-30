// The game's reflection probe (D497): Timberborn's terrain and water shaders add the environment reflection URP takes
// from `unity_SpecCube0`, the scene's probe, scaled by `RenderSettings.m_ReflectionIntensity` (0.65 in the game scene,
// `level2`). The probe is a Cubemap in the game's `sharedassets1.assets`, "TimberbornEnvironmentRelfectionProbe" (sic):
// 128² a face, 8 mips (each mip the probe convolved for a rougher surface), BC6H, its texels in
// `sharedassets1.assets.resS`. This reads it, read-only, decodes it on the GPU (real Chrome, WebGL 2's
// EXT_texture_compression_bptc) and prints each face's mean at each mip, and the colours `palette.ts` `GAME_ENV` keeps:
// the roughest mip (6, 2² a face, what URP samples at perceptual roughness 1) straight up, toward the horizon (the four
// side faces' mean) and straight down. `--json <path>` writes every face and mip's texels too (display values, RGB).
//
//   npx tsx tools/reflection-probe.ts [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"] [--json out.json]

import { closeSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const GAME = arg("game") ?? "C:/Program Files (x86)/Steam/steamapps/common/Timberborn";
const data = join(GAME, "Timberborn_Data");
const assets = readFileSync(join(data, "sharedassets1.assets"));
const version = readFileSync(join(data, "StreamingAssets", "Version.txt"), "utf8").trim();
const NAME = "TimberbornEnvironmentRelfectionProbe";

// the Cubemap's name (an aligned string), then width, height, one face's bytes, ..., format, mips; then its stream:
// offset (u64), size (u32) and the path "sharedassets1.assets.resS"
const at = assets.indexOf(Buffer.concat([Buffer.from([NAME.length, 0, 0, 0]), Buffer.from(NAME)]));
if (at < 0) throw new Error(`${NAME} not found`);
const base = at + 4 + NAME.length + ((4 - ((4 + NAME.length) % 4)) % 4);
const [size, height, faceBytes, , format, mips] = [4, 8, 12, 16, 20, 24].map((k) => assets.readInt32LE(base + k));
if (size !== 128 || height !== 128 || format !== 24 || mips !== 8) throw new Error(`${NAME}: ${size}×${height}, format ${format}, ${mips} mips: not the probe this reads`);
const path = assets.indexOf(Buffer.from("sharedassets1.assets.resS"), base);
const offset = Number(assets.readBigUInt64LE(path - 16));
const bytes = assets.readUInt32LE(path - 8);
if (bytes !== faceBytes * 6) throw new Error(`${NAME}: ${bytes} bytes streamed, not six faces of ${faceBytes}`);
const fd = openSync(join(data, "sharedassets1.assets.resS"), "r");
const texels = Buffer.alloc(bytes);
readSync(fd, texels, 0, bytes, offset);
closeSync(fd);

const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--enable-gpu", "--ignore-gpu-blocklist"] });
let faces: number[][][];
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (f) => f");
  await page.goto("about:blank");
  faces = (await page.evaluate(
    ({ b64, size, mips, faceBytes }) => {
      const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const gl = document.createElement("canvas").getContext("webgl2")!;
      const bptc = gl.getExtension("EXT_texture_compression_bptc");
      if (!bptc || !gl.getExtension("EXT_color_buffer_float")) throw new Error("no BC6H or float targets on this GPU");
      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const program = gl.createProgram()!;
      gl.attachShader(program, shader(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }"));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float; uniform sampler2D t; out vec4 o; void main() { o = texelFetch(t, ivec2(gl_FragCoord.xy), 0); }"));
      gl.linkProgram(program);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const out: number[][][] = [];
      for (let f = 0; f < 6; f++) {
        const face: number[][] = [];
        let at = f * faceBytes;
        for (let m = 0; m < mips; m++) {
          // (each mip a whole number of 4 × 4 blocks: the ones under 4 texels across take one block)
          const s = Math.max(1, size >> m);
          const padded = Math.max(4, Math.ceil(s / 4) * 4);
          const n = (padded / 4) ** 2 * 16;
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.compressedTexImage2D(gl.TEXTURE_2D, 0, bptc.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT, padded, padded, 0, bin.subarray(at, at + n));
          at += n;
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          const target = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, target);
          gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, padded, padded);
          gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.viewport(0, 0, padded, padded);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const px = new Float32Array(padded * padded * 4);
          gl.readPixels(0, 0, padded, padded, gl.RGBA, gl.FLOAT, px);
          const rgb: number[] = [];
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) rgb.push(px[(y * padded + x) * 4], px[(y * padded + x) * 4 + 1], px[(y * padded + x) * 4 + 2]);
          face.push(rgb);
        }
        out.push(face);
      }
      if (gl.getError()) throw new Error(`WebGL error ${gl.getError()}`);
      return out;
    },
    { b64: texels.toString("base64"), size, mips, faceBytes },
  )) as number[][][];
} finally {
  await browser.close();
}

const mean = (rgb: number[]) => [0, 1, 2].map((k) => rgb.filter((_, i) => i % 3 === k).reduce((s, v) => s + v, 0) / (rgb.length / 3));
const r3 = (c: number[]) => `[${c.map((v) => Math.round(v * 1000) / 1000).join(", ")}]`;
const FACES = ["+x", "-x", "+y", "-y", "+z", "-z"];
console.log(`// Timberborn ${version}: ${NAME}, each face's mean by mip (display values)`);
for (let f = 0; f < 6; f++) console.log(`//   ${FACES[f]}: ${faces[f].map((m) => r3(mean(m))).join(" ")}`);
const ROUGH = 6;
const side = [0, 1, 4, 5].map((f) => mean(faces[f][ROUGH]));
console.log(`  up: ${r3(mean(faces[2][ROUGH]))} as Rgb,`);
console.log(`  side: ${r3([0, 1, 2].map((k) => side.reduce((s, c) => s + c[k], 0) / 4))} as Rgb,`);
console.log(`  down: ${r3(mean(faces[3][ROUGH]))} as Rgb,`);
const json = arg("json");
if (json) writeFileSync(json, JSON.stringify({ version, name: NAME, faces: FACES, size, mips, texels: faces }));
