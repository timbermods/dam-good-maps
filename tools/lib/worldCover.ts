// ESA WorldCover 2021 v200 (10 m land cover, CC BY 4.0; D192, D271): the observed permanent water (class 80) under a
// real place's tiles. Each 3°×3° file is a cloud-optimised GeoTIFF on the Registry of Open Data on AWS, tiled 1024²,
// DEFLATE, 8 bits a pixel, north row first; only the internal tiles a place covers are fetched, by byte range (curl,
// through the machine's proxy). Tools only: the product never fetches it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzlibSync } from "fflate";

const BUCKET = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map";
/** WorldCover's class for permanent water bodies. */
export const WATER_CLASS = 80;
const SIDE = 36000;
const TILE = 1024;
const ACROSS = Math.ceil(SIDE / TILE);

export { WATER_NOTICE as WORLDCOVER_NOTICE } from "../../src/core/places/attribution";

function fileName(lat: number, lon: number): { name: string; lat0: number; lon0: number } {
  const lat0 = Math.floor(lat / 3) * 3;
  const lon0 = Math.floor(lon / 3) * 3;
  const ns = `${lat0 < 0 ? "S" : "N"}${String(Math.abs(lat0)).padStart(2, "0")}`;
  const ew = `${lon0 < 0 ? "W" : "E"}${String(Math.abs(lon0)).padStart(3, "0")}`;
  return { name: `ESA_WorldCover_10m_2021_v200_${ns}${ew}_Map.tif`, lat0, lon0 };
}

function range(url: string, from: number, to: number): Uint8Array {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = spawnSync("curl", ["-sS", "--fail", "--max-time", "120", "-r", `${from}-${to}`, url], { maxBuffer: 1 << 28 });
    if (r.status === 0 && r.stdout.length === to - from + 1) return new Uint8Array(r.stdout);
  }
  throw new Error(`WorldCover: could not read ${url} bytes ${from}-${to}`);
}

interface Cog {
  url: string;
  offsets: Float64Array;
  counts: Float64Array;
  tiles: Map<number, Uint8Array | null>;
}

const cogs = new Map<string, Cog | null>();

function cog(name: string, cache: string): Cog | null {
  if (cogs.has(name)) return cogs.get(name)!;
  const url = `${BUCKET}/${name}`;
  const head = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-r", "0-0", url]);
  if (String(head.stdout) !== "206") {
    // (no file: the sea, where WorldCover has no tile)
    cogs.set(name, null);
    return null;
  }
  const hp = join(cache, `${name}.head`);
  const b = existsSync(hp) ? new Uint8Array(readFileSync(hp)) : range(url, 0, 65535);
  if (!existsSync(hp)) writeFileSync(hp, b);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ifd = v.getUint32(4, true);
  const n = v.getUint16(ifd, true);
  let offAt = 0;
  let cntAt = 0;
  let count = 0;
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + 12 * k;
    const tag = v.getUint16(e, true);
    if (tag === 324) (offAt = v.getUint32(e + 8, true)), (count = v.getUint32(e + 4, true));
    if (tag === 325) cntAt = v.getUint32(e + 8, true);
    if (tag === 259 && v.getUint16(e + 8, true) !== 8) throw new Error(`${name}: not DEFLATE`);
    if (tag === 322 && v.getUint16(e + 8, true) !== TILE) throw new Error(`${name}: tiles not ${TILE}`);
  }
  if (count !== ACROSS * ACROSS || offAt + 4 * count > b.length || cntAt + 4 * count > b.length) throw new Error(`${name}: unexpected layout`);
  const offsets = new Float64Array(count);
  const counts = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    offsets[k] = v.getUint32(offAt + 4 * k, true);
    counts[k] = v.getUint32(cntAt + 4 * k, true);
  }
  const c = { url, offsets, counts, tiles: new Map() };
  cogs.set(name, c);
  return c;
}

function tileOf(c: Cog, k: number, cache: string, name: string): Uint8Array | null {
  if (c.tiles.has(k)) return c.tiles.get(k)!;
  let t: Uint8Array | null = null;
  if (c.counts[k] > 0) {
    const p = join(cache, `${name}.${k}`);
    const raw = existsSync(p) ? new Uint8Array(readFileSync(p)) : range(c.url, c.offsets[k], c.offsets[k] + c.counts[k] - 1);
    if (!existsSync(p)) writeFileSync(p, raw);
    t = unzlibSync(raw);
  }
  c.tiles.set(k, t);
  return t;
}

/** The WorldCover class at (lat, lon), or -1 where there is no data (the open sea). */
export function classAt(lat: number, lon: number, cache: string): number {
  mkdirSync(cache, { recursive: true });
  const f = fileName(lat, lon);
  const c = cog(f.name, cache);
  if (!c) return -1;
  const px = Math.min(SIDE - 1, Math.floor((lon - f.lon0) * (SIDE / 3)));
  const py = Math.min(SIDE - 1, Math.floor((f.lat0 + 3 - lat) * (SIDE / 3)));
  const k = Math.floor(py / TILE) * ACROSS + Math.floor(px / TILE);
  const t = tileOf(c, k, cache, f.name);
  return t ? t[(py % TILE) * TILE + (px % TILE)] : 0;
}
