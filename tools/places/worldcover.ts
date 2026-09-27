// Observed water for the real places (Kyler, 2026-09-27, D271: a place's water follows the real
// place): ESA WorldCover 10 m 2021 v200, class 80 (permanent water bodies), the source Pick a place's
// signature water already uses (D192, investigation/pickplace-water2). For each survey patch, the
// share of each tile's native 10 m pixels classed as permanent water, on the patch's own grid (its
// halo included), so the conversion (convert.ts) puts sources only where the real place has rivers
// and lakes, and dry places stay dry.
//
//   npx tsx tools/places/worldcover.ts            (every patch the places in selection.json use)
//   npx tsx tools/places/worldcover.ts <patch>... (those patches: n000-256-60)
//
// The tiles are Cloud Optimized GeoTIFFs on the Registry of Open Data on AWS (3° by 3°, 36000²
// pixels in 1024² deflate tiles); only the internal tiles a patch covers are read, by byte range.
// Each patch's result is kept in investigation/landscapes/.cache/worldcover/ (gitignored, D195):
// `<patch>.u8.gz` (the share of water, 0-255, row 0 the south edge, as the patches) and
// `<patch>.json` (what was read: each tile's ETag, each range's sha256). Credit (CC BY 4.0): "© ESA
// WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA
// WorldCover consortium" (src/core/places/attribution.ts, WATER_*).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync, inflateSync } from "node:zlib";
import { isMainThread } from "node:worker_threads";

export const WORLDCOVER = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/";
export const WATER_CACHE = "investigation/landscapes/.cache/worldcover";
/** WorldCover's class for permanent water bodies. */
export const WATER_CLASS = 80;
/** The survey's patches: a halo of 32 tiles round the map. */
const HALO = 32;
/** Metres a degree of latitude, as the survey samples (investigation/landscapes/sample.ts). */
const M_PER_DEG = 111195;

/** The WorldCover tile holding a point: named by its south-west corner, 3° a side. */
export function tileName(lat: number, lon: number): string {
  const y = Math.floor(lat / 3) * 3;
  const x = Math.floor(lon / 3) * 3;
  return `ESA_WorldCover_10m_2021_v200_${y < 0 ? "S" : "N"}${String(Math.abs(y)).padStart(2, "0")}${x < 0 ? "W" : "E"}${String(Math.abs(x)).padStart(3, "0")}_Map.tif`;
}

interface Cog {
  name: string;
  width: number;
  height: number;
  tile: number;
  across: number;
  offsets: number[];
  counts: number[];
  /** The top-left corner (longitude, latitude) and a pixel's size in degrees (latitudes fall down the rows). */
  ox: number;
  oy: number;
  rx: number;
  ry: number;
  etag: string;
}

export interface Read {
  name: string;
  range: string;
  bytes: number;
  sha256: string;
}

async function fetchRange(name: string, start: number, end: number, reads: Read[]): Promise<{ bytes: Buffer; etag: string } | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(WORLDCOVER + name, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(60000) });
      if (r.status === 404 || r.status === 403) return null;
      if (r.status !== 206) throw new Error(`${name}: HTTP ${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      reads.push({ name, range: `${start}-${end}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      return { bytes, etag: r.headers.get("etag") ?? "" };
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
    }
  }
}

const cogs = new Map<string, Promise<Cog | null>>();

/** A tile's layout, from its first IFD (the full-resolution image). Null where WorldCover has no
 *  tile (the open sea). */
function cog(name: string, reads: Read[]): Promise<Cog | null> {
  if (!cogs.has(name))
    cogs.set(
      name,
      (async () => {
        const got = await fetchRange(name, 0, 65535, reads);
        if (!got) return null;
        const b = got.bytes;
        if (b.toString("latin1", 0, 2) !== "II" || b.readUInt16LE(2) !== 42) throw new Error(`${name}: not a little-endian classic TIFF`);
        const ifd = b.readUInt32LE(4);
        const n = b.readUInt16LE(ifd);
        const tags = new Map<number, { type: number; count: number; at: number }>();
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12;
          tags.set(b.readUInt16LE(e), { type: b.readUInt16LE(e + 2), count: b.readUInt32LE(e + 4), at: e + 8 });
        }
        const size = (t: number) => ({ 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 })[t] ?? 0;
        const values = (tag: number): number[] => {
          const t = tags.get(tag);
          if (!t) throw new Error(`${name}: no tag ${tag}`);
          const bytes = size(t.type) * t.count;
          const at = bytes <= 4 ? t.at : b.readUInt32LE(t.at);
          if (at + bytes > b.length) throw new Error(`${name}: tag ${tag} lies past the header read`);
          const out: number[] = [];
          for (let i = 0; i < t.count; i++) {
            const p = at + i * size(t.type);
            out.push(t.type === 3 ? b.readUInt16LE(p) : t.type === 4 ? b.readUInt32LE(p) : t.type === 12 ? b.readDoubleLE(p) : b[p]);
          }
          return out;
        };
        const [width] = values(256);
        const [height] = values(257);
        const [bits] = values(258);
        const [compression] = values(259);
        const predictor = tags.has(317) ? values(317)[0] : 1;
        const [tile] = values(322);
        if (bits !== 8 || compression !== 8 || predictor !== 1 || values(323)[0] !== tile) throw new Error(`${name}: unexpected layout (bits ${bits}, compression ${compression}, predictor ${predictor})`);
        const [rx, ry] = values(33550);
        const tie = values(33922);
        return { name, width, height, tile, across: Math.ceil(width / tile), offsets: values(324), counts: values(325), ox: tie[3], oy: tie[4], rx, ry, etag: got.etag };
      })(),
    );
  return cogs.get(name)!;
}

/** One internal tile's class values (tile² bytes). */
async function block(c: Cog, tx: number, ty: number, reads: Read[]): Promise<Uint8Array> {
  const k = ty * c.across + tx;
  if (!c.counts[k]) return new Uint8Array(c.tile * c.tile);
  const got = await fetchRange(c.name, c.offsets[k], c.offsets[k] + c.counts[k] - 1, reads);
  if (!got) throw new Error(`${c.name}: tile ${k} missing`);
  const out = inflateSync(got.bytes);
  if (out.length !== c.tile * c.tile) throw new Error(`${c.name}: tile ${k} inflates to ${out.length} bytes`);
  return out;
}

/** The share of each tile's WorldCover pixels classed as permanent water, on a survey patch's grid
 *  (`W` tiles a side, centred on `lat`, `lon`, `metres` apart, row 0 the south edge: sample.ts's
 *  `patch`). A pixel belongs to the tile whose square holds its centre. Where WorldCover has no
 *  tile (the open sea) its pixels count as water. */
export async function observedWater(lat: number, lon: number, W: number, metres: number, reads: Read[] = []): Promise<{ fraction: Float32Array; pixels: Uint32Array; seaTiles: string[] }> {
  const dlat = metres / M_PER_DEG;
  const dlon = metres / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const mid = (W - 1) / 2;
  const south = lat + (-mid - 0.5) * dlat;
  const north = lat + (W - 1 - mid + 0.5) * dlat;
  const west = lon + (-mid - 0.5) * dlon;
  const east = lon + (W - 1 - mid + 0.5) * dlon;
  const wet = new Uint32Array(W * W);
  const all = new Uint32Array(W * W);
  const seaTiles: string[] = [];
  const names = new Set<string>();
  for (let la = Math.floor(south / 3) * 3; la < north; la += 3) for (let lo = Math.floor(west / 3) * 3; lo < east; lo += 3) names.add(tileName(la + 0.5, lo + 0.5));
  for (const name of names) {
    const c = await cog(name, reads);
    const m = /_([NS])(\d{2})([EW])(\d{3})_/.exec(name)!;
    const s0 = (m[1] === "S" ? -1 : 1) * Number(m[2]);
    const w0 = (m[3] === "W" ? -1 : 1) * Number(m[4]);
    if (!c) {
      // no tile: the open sea; every pixel of the square's part in it is water
      seaTiles.push(name);
      for (let y = 0; y < W; y++)
        for (let x = 0; x < W; x++) {
          const la = lat + (y - mid) * dlat;
          const lo = lon + (x - mid) * dlon;
          if (la >= s0 && la < s0 + 3 && lo >= w0 && lo < w0 + 3) {
            wet[y * W + x] += 100;
            all[y * W + x] += 100;
          }
        }
      continue;
    }
    const px0 = Math.max(0, Math.floor((west - c.ox) / c.rx));
    const px1 = Math.min(c.width - 1, Math.floor((east - c.ox) / c.rx));
    const py0 = Math.max(0, Math.floor((c.oy - north) / c.ry));
    const py1 = Math.min(c.height - 1, Math.floor((c.oy - south) / c.ry));
    if (px1 < px0 || py1 < py0) continue;
    const jobs: Promise<void>[] = [];
    for (let ty = Math.floor(py0 / c.tile); ty <= Math.floor(py1 / c.tile); ty++)
      for (let tx = Math.floor(px0 / c.tile); tx <= Math.floor(px1 / c.tile); tx++)
        jobs.push(
          block(c, tx, ty, reads).then((data) => {
            for (let r = 0; r < c.tile; r++) {
              const py = ty * c.tile + r;
              if (py < py0 || py > py1) continue;
              const y = Math.round((c.oy - (py + 0.5) * c.ry - lat) / dlat + mid);
              if (y < 0 || y >= W) continue;
              for (let q = 0; q < c.tile; q++) {
                const px = tx * c.tile + q;
                if (px < px0 || px > px1) continue;
                const v = data[r * c.tile + q];
                if (!v) continue;
                const x = Math.round((c.ox + (px + 0.5) * c.rx - lon) / dlon + mid);
                if (x < 0 || x >= W) continue;
                const i = y * W + x;
                all[i]++;
                if (v === WATER_CLASS) wet[i]++;
              }
            }
          }),
        );
    await Promise.all(jobs);
  }
  const fraction = new Float32Array(W * W);
  for (let i = 0; i < fraction.length; i++) fraction[i] = all[i] ? wet[i] / all[i] : 0;
  return { fraction, pixels: all, seaTiles };
}

/** A survey patch's observed water (`<location>-<size>-<metres>`), as `fetchPatch` kept it: the
 *  share of water on each tile of the patch, its halo included. */
export function readWater(patch: string): Float32Array {
  const path = `${WATER_CACHE}/${patch}.u8.gz`;
  if (!existsSync(path)) throw new Error(`${path} is missing: run npx tsx tools/places/worldcover.ts`);
  const b = gunzipSync(readFileSync(path));
  return Float32Array.from(b, (v) => v / 255);
}

/** Read and keep one patch's observed water. */
export async function fetchPatch(patch: string, lat: number, lon: number): Promise<void> {
  const m = /^(.+)-(\d+)-(\d+)$/.exec(patch);
  if (!m) throw new Error(`not a patch: ${patch}`);
  const size = Number(m[2]);
  const metres = Number(m[3]);
  const W = size + 2 * HALO;
  const reads: Read[] = [];
  const t0 = performance.now();
  const { fraction, pixels, seaTiles } = await observedWater(lat, lon, W, metres, reads);
  const u8 = Uint8Array.from(fraction, (f) => Math.round(f * 255));
  mkdirSync(WATER_CACHE, { recursive: true });
  writeFileSync(`${WATER_CACHE}/${patch}.u8.gz`, gzipSync(u8));
  let water = 0;
  let empty = 0;
  for (let i = 0; i < fraction.length; i++) {
    water += fraction[i];
    if (!pixels[i]) empty++;
  }
  const tiles = [...new Set(reads.map((r) => r.name))].map((name) => ({ name, etag: "" }));
  for (const t of tiles) t.etag = (cogs.get(t.name) && (await cogs.get(t.name))?.etag) || "";
  writeFileSync(
    `${WATER_CACHE}/${patch}.json`,
    JSON.stringify({
      patch,
      source: "ESA WorldCover 10 m 2021 v200, class 80 (permanent water bodies)",
      url: WORLDCOVER,
      accessed: new Date().toISOString(),
      lat,
      lon,
      size,
      metres,
      halo: HALO,
      waterTiles: Math.round(water * 10) / 10,
      emptyTiles: empty,
      seaTiles,
      tiles,
      reads,
      sha256: createHash("sha256").update(u8).digest("hex"),
    }),
  );
  console.log(`${patch}: ${Math.round(water)} tiles of water of ${W * W}, ${reads.length} reads, ${Math.round((performance.now() - t0) / 1000)} s${seaTiles.length ? `, open sea from ${seaTiles.join(", ")}` : ""}${empty ? `, ${empty} tiles with no pixels` : ""}`);
}

async function main(): Promise<void> {
  const locs = new Map((JSON.parse(readFileSync("investigation/landscapes/data/locations.json", "utf8")) as { id: string; lat: number; lon: number }[]).map((l) => [l.id, l]));
  let patches = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!patches.length) {
    const sel = JSON.parse(readFileSync("tools/places/selection.json", "utf8")) as { places: { row: string }[] };
    patches = [...new Set(sel.places.map((p) => p.row.replace(/-\w+-\d+$/, "")))];
  }
  const todo = patches.filter((p) => process.argv.includes("--again") || !existsSync(`${WATER_CACHE}/${p}.u8.gz`));
  console.log(`${patches.length} patches, ${todo.length} to read`);
  // a few patches at once: each reads its tiles in parallel
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < todo.length) {
        const p = todo[next++];
        const loc = locs.get(p.replace(/-\d+-\d+$/, ""));
        if (!loc) throw new Error(`no location for ${p}`);
        await fetchPatch(p, loc.lat, loc.lon);
      }
    }),
  );
}

if (isMainThread && process.argv[1]?.replace(/\\/g, "/").endsWith("tools/places/worldcover.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
