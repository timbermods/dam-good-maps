// The game's altitude colour ramps (D497): Timberborn's terrain shader multiplies the ground's colour by a 32 × 1 ramp
// read at the ground's height over `AltitudeCeiling` (22 levels; `Configurations/TerrainMaterialMap.blueprint.json`
// in Blueprints.zip, decompiled `Timberborn.TerrainSystemRendering` `TerrainMaterialMap`: `_AltitudeMultiplierTex`,
// `_DesertAltitudeMultiplierTex`, `_AltitudeCeiling`). The ramps are textures in the game's `resources.assets`, their
// texels in `resources.assets.resS`: each a Texture2D, RGB24, 32 × 1, 6 mips, 189 bytes streamed. This reads them,
// read-only, and prints the first mip as the arrays `src/render3d/palette.ts` `ALTITUDE_RAMP` keeps.
//
//   npx tsx tools/altitude-ramp.ts [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"]

import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";

const i = process.argv.indexOf("--game");
const GAME = i >= 0 ? process.argv[i + 1] : "C:/Program Files (x86)/Steam/steamapps/common/Timberborn";
const data = join(GAME, "Timberborn_Data");
const assets = readFileSync(join(data, "resources.assets"));
const version = readFileSync(join(data, "..", "Timberborn_Data", "StreamingAssets", "Version.txt"), "utf8").trim();

function ramp(name: string): number[][] {
  // the Texture2D's name (an aligned string), then its fields up to its stream data: offset (u64), size (u32), and the
  // path "resources.assets.resS" (length-prefixed)
  const at = assets.indexOf(Buffer.concat([Buffer.from([name.length, 0, 0, 0]), Buffer.from(name)]));
  if (at < 0) throw new Error(`${name} not found`);
  const path = assets.indexOf(Buffer.from("resources.assets.resS"), at);
  const offset = Number(assets.readBigUInt64LE(path - 16));
  const size = assets.readUInt32LE(path - 8);
  // (the header's numbers after the name: width 32, height 1, 189 bytes, format 3 = RGB24, 6 mips)
  const base = at + 4 + name.length + ((4 - ((4 + name.length) % 4)) % 4);
  const [width, height, total, , format] = [4, 8, 12, 16, 20].map((k) => assets.readInt32LE(base + k));
  if (width !== 32 || height !== 1 || format !== 3 || total !== size) throw new Error(`${name}: ${width}×${height}, format ${format}, ${total} bytes: not the ramp this reads`);
  const fd = openSync(join(data, "resources.assets.resS"), "r");
  const texels = Buffer.alloc(width * 3);
  readSync(fd, texels, 0, texels.length, offset);
  closeSync(fd);
  return Array.from({ length: width }, (_, k) => [texels[k * 3], texels[k * 3 + 1], texels[k * 3 + 2]]);
}

console.log(`// Timberborn ${version}`);
for (const [key, name] of [["grass", "AltitudeMultiplierGrass_Manual"], ["desert", "AltitudeMultiplierDesert_Manual"]])
  console.log(`  ${key}: [${ramp(name).map((t) => `[${t.join(", ")}]`).join(", ")}],`);
