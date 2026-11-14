// The Real places' observed water (D271: "water follows the real place"): for every place in the landscape survey's
// library, the tiles whose ground ESA WorldCover 2021 classes as permanent water (class 80) over half their area, or
// that lie over the open sea, where WorldCover has no file. tools/real-places.ts reads it to cut a basin only where the
// real water lies and to count a floor-0 sheet over real water against real dry land (planning's ruling on #236).
//
//   npx tsx tools/places-real-water.ts [--only <library id>,...] [--cache .scratch/worldcover]
//
// Writes investigation/landscapes/library/real-water.json (the survey's data, read at run time like its fixtures).
// A tile's ground is sampled every 10 m (WorldCover's pixel) across it, placed as the survey placed the heights
// (investigation/landscapes/sample.ts: the place's centre, metres a tile, y to the north).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { encodeTiles } from "./lib/placeData";
import { classAt, WATER_CLASS, WORLDCOVER_NOTICE } from "./lib/worldCover";

const LIBRARY = "investigation/landscapes/library";
const OUT = join(LIBRARY, "real-water.json");
/** A tile is real water when this share of its samples is. */
const SHARE = 0.5;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
const cache = arg("cache") ?? ".scratch/worldcover";
const only = arg("only")?.split(",") ?? null;

interface Item {
  id: string;
  family: string;
  size: number;
  metres: number;
  lat: number;
  lon: number;
}

export interface RealWater {
  source: string;
  notice: string;
  /** By library id: the map's side and its real-water tiles, ascending, as gaps (tools/lib/placeData.ts `encodeTiles`). */
  places: Record<string, { W: number; tiles: number[] }>;
}

const items = (JSON.parse(readFileSync(join(LIBRARY, "index.json"), "utf8")) as { items: Item[] }).items.filter((it) => it.family !== "random" && (!only || only.includes(it.id)));
const out: RealWater = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { source: "ESA WorldCover 2021 v200, class 80 (permanent water), 10 m", notice: WORLDCOVER_NOTICE, places: {} };
for (const it of items) {
  const W = it.size;
  const m = it.metres;
  const k = Math.max(1, Math.round(m / 10));
  const cos = Math.cos((it.lat * Math.PI) / 180);
  const tiles: number[] = [];
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      let wet = 0;
      for (let sy = 0; sy < k; sy++)
        for (let sx = 0; sx < k; sx++) {
          const dy = (y - (W - 1) / 2 + ((sy + 0.5) / k - 0.5)) * m;
          const dx = (x - (W - 1) / 2 + ((sx + 0.5) / k - 0.5)) * m;
          const c = classAt(it.lat + dy / 111195, it.lon + dx / (111195 * cos), cache);
          if (c === WATER_CLASS || c === -1) wet++;
        }
      if (wet >= SHARE * k * k) tiles.push(y * W + x);
    }
  out.places[it.id] = { W, tiles: encodeTiles(tiles) };
  console.log(`${it.id}: ${tiles.length} real-water tiles of ${W * W}`);
}
out.places = Object.fromEntries(Object.entries(out.places).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(out) + "\n");
