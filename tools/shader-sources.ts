// The Standard and light looks' shader sources, hashed (the High look, D284): the High look's hooks
// leave these shaders exactly as they were, so their hashes match a checkout without the hooks.
//
//   npx tsx tools/shader-sources.ts            (print the hashes)
//   npx tsx tools/shader-sources.ts --dump dir (also write each source to dir)
//
// Run it in this checkout and in a copy of dev's sources (git archive origin/dev src ...): the same
// hashes prove the Standard look's shaders are unchanged.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DataTexture } from "three";
import { fallMaterial, objectMaterial, sceneUniforms, skyMaterial, terrainMaterial, waterMaterial } from "../src/render3d/materials";

const t = () => new DataTexture(new Uint8Array(4), 1, 1);
const u = sceneUniforms(1, 1, t(), t(), t(), t());
const dump = process.argv.includes("--dump") ? process.argv[process.argv.indexOf("--dump") + 1] : null;
if (dump) mkdirSync(dump, { recursive: true });
const out: Record<string, string> = {};
for (const lite of [false, true]) {
  const mats = { terrain: terrainMaterial(u, 0, 1, lite), water: waterMaterial(u, lite), fall: fallMaterial(u, lite), object: objectMaterial(u, lite), ...(lite ? {} : { sky: skyMaterial() }) };
  for (const [name, m] of Object.entries(mats)) {
    const key = `${name}${lite ? ".lite" : ""}`;
    const src = `${m.vertexShader}\n----\n${m.fragmentShader}\n----\n${JSON.stringify(m.defines ?? {})}`;
    out[key] = createHash("sha256").update(src).digest("hex").slice(0, 16);
    if (dump) writeFileSync(join(dump, `${key}.glsl`), src);
  }
}
console.log(JSON.stringify(out, null, 2));
