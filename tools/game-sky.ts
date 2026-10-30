// The game's sky (D497): Timberborn's camera draws a Skybox component whose material (`resources.assets` "Skybox",
// shader path 1816) takes its colour from a strip, "DayCycleSkybox_8k_Manual": a Texture2D, RGBAHalf, 16 × 8192, its
// texels in `resources.assets.resS`. The shader (its pixel program read with D3DDisassemble) samples the strip at
// u = `_DayProgress` (decompiled `Timberborn.SkySystem` `SkyboxPositioner`; `SkyboxPositioner.blueprint.json`: the day
// at 0.2) and v = the view's height, (asin(y) / (π/2) + 1) / 2, filtered. This reads the strip, read-only, and prints
// the day's column at `--entries` heights evenly from straight down to straight up (display values, as the game
// renders in Gamma colour space): the table `palette.ts` `GAME_SKY.day` keeps.
//
//   npx tsx tools/game-sky.ts [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"] [--day 0.2] [--entries 145]

import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const GAME = arg("game") ?? "C:/Program Files (x86)/Steam/steamapps/common/Timberborn";
const DAY = Number(arg("day") ?? 0.2);
const ENTRIES = Number(arg("entries") ?? 145);
const data = join(GAME, "Timberborn_Data");
const assets = readFileSync(join(data, "resources.assets"));
const version = readFileSync(join(data, "StreamingAssets", "Version.txt"), "utf8").trim();
const NAME = "DayCycleSkybox_8k_Manual";

// the Texture2D's name (an aligned string), then width, height, its bytes, ..., format (17: RGBAHalf), mips; then its
// stream: offset (u64), size (u32), the path "resources.assets.resS"
const at = assets.indexOf(Buffer.concat([Buffer.from([NAME.length, 0, 0, 0]), Buffer.from(NAME)]));
if (at < 0) throw new Error(`${NAME} not found`);
const base = at + 4 + NAME.length + ((4 - ((4 + NAME.length) % 4)) % 4);
const [W, H, bytes, , format] = [4, 8, 12, 16, 20].map((k) => assets.readInt32LE(base + k));
if (W !== 16 || H !== 8192 || format !== 17 || bytes !== W * H * 8) throw new Error(`${NAME}: ${W}×${H}, format ${format}, ${bytes} bytes: not the strip this reads`);
const path = assets.indexOf(Buffer.from("resources.assets.resS"), base);
const offset = Number(assets.readBigUInt64LE(path - 16));
const fd = openSync(join(data, "resources.assets.resS"), "r");
const texels = Buffer.alloc(bytes);
readSync(fd, texels, 0, bytes, offset);
closeSync(fd);

/** An IEEE half float. */
function half(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + m / 1024);
}
const texel = (x: number, y: number, c: number) => half(texels.readUInt16LE(((y * W + x) * 4 + c) * 2));
/** The strip filtered at (u, v), clamped to its edges, as the game's bilinear sample. */
function sample(u: number, v: number): number[] {
  const fx = Math.min(W - 1, Math.max(0, u * W - 0.5));
  const fy = Math.min(H - 1, Math.max(0, v * H - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  return [0, 1, 2].map((c) => (texel(x0, y0, c) * (1 - tx) + texel(x1, y0, c) * tx) * (1 - ty) + (texel(x0, y1, c) * (1 - tx) + texel(x1, y1, c) * tx) * ty);
}

console.log(`// Timberborn ${version}: ${NAME} at day progress ${DAY}, ${ENTRIES} heights from straight down to straight up`);
const rows = Array.from({ length: ENTRIES }, (_, k) => sample(DAY, k / (ENTRIES - 1)));
console.log(`  day: [${rows.map((r) => `[${r.map((v) => Math.round(v * 1000) / 1000).join(", ")}]`).join(", ")}] as readonly Rgb[],`);
