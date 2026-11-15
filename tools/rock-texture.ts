// Our cliffs' rock texture (materials.ts `ROCK`, the pattern texture's layer 1), read back from a real browser (its page
// half: tools/rock-texture-page.ts) so its statistics can be set against the game's (tools/game-cliff-texture.py
// --ours). Draws it with `drawPatterns`, as the view does, and writes its top mip and the mip at 16 texels a tile as
// raw RGBA bytes (layer 1: R the albedo's lightness halved, G its hue, B and A its stones' normal).
//
//   npx tsx tools/rock-texture.ts [--out .scratch/rock] [--port 5339]
//   python tools/game-cliff-texture.py --ours .scratch/rock

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, arg("out") ?? ".scratch/rock");
const PORT = Number(arg("port") ?? 5339);

/** In the page: the rock layer at one mip, base64. */
const READ = `(mip) => import("/tools/rock-texture-page.ts").then((m) => m.readRock(mip))`;

async function main(): Promise<void> {
  const server = await createServer({ root: ROOT, configFile: resolve(ROOT, "vite.config.ts"), base: "/", cacheDir: resolve(ROOT, `.scratch/rock-texture-${PORT}-vite`), server: { port: PORT, strictPort: true }, logLevel: "error" });
  await server.listen();
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);
    mkdirSync(dirname(OUT), { recursive: true });
    // the top (1024², 256 texels a tile) and mip 4 (64², 16 a tile, as the game's Cliff_N at its mip 4)
    for (const mip of [0, 4]) {
      const b64 = (await page.evaluate(`(${READ})(${mip})`)) as string;
      writeFileSync(`${OUT}-${mip}.bin`, Buffer.from(b64, "base64"));
    }
    console.log(`${OUT}-0.bin and ${OUT}-4.bin`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
