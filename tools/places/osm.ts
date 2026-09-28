// Rivers WorldCover misses, for the real places (Kyler, 2026-09-27, D271: a place's water follows
// the real place; OpenStreetMap's rivers are the second source D271 names). ESA WorldCover
// (worldcover.ts) sees a river only where it is wide open water at 10 m: a river under about 20 m,
// or deep in a gorge's shade, is missed. OpenStreetMap's permanent rivers (`waterway=river`, not
// marked intermittent or seasonal) fill that in: each is drawn onto the survey patch's grid as a
// line of tiles, which the conversion (convert.ts) reads as observed water beside WorldCover's.
// Streams, canals, drains and dry washes are left out, so dry places stay dry.
//
//   npx tsx tools/places/osm.ts            (every patch the places in selection.json use)
//   npx tsx tools/places/osm.ts <patch>... (those patches: n000-256-60)
//
// One Overpass API query a patch (the map and its halo), one at a time. Each patch's answer is kept
// in investigation/landscapes/.cache/osm/<patch>.json (gitignored, D195): the rivers' names and
// points, and when they were read. Credit (ODbL): "© OpenStreetMap contributors"
// (src/core/places/attribution.ts, RIVERS_*).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isMainThread } from "node:worker_threads";

export const OSM_CACHE = "investigation/landscapes/.cache/osm";
/** Overpass API instances: the main one, and a public mirror when it is busy. */
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const HALO = 32;
const M_PER_DEG = 111195;

/** A river as OpenStreetMap draws it: its name, and its points (latitude, longitude). */
export interface River {
  id: number;
  name: string;
  points: [number, number][];
}

/** The patch's box, [south, west, north, east], its halo included (sample.ts's grid). */
function box(lat: number, lon: number, size: number, metres: number): [number, number, number, number] {
  const half = ((size + 2 * HALO) * metres) / 2;
  const dlat = half / M_PER_DEG;
  const dlon = half / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return [lat - dlat, lon - dlon, lat + dlat, lon + dlon];
}

let answered = 0;

async function query(q: string): Promise<{ elements: { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] }> {
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    // the endpoint that last answered first
    const url = ENDPOINTS[(answered + attempt) % ENDPOINTS.length];
    try {
      const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), headers: { "User-Agent": "dam-good-maps-real-places/1.0 (https://github.com/timbermods/dam-good-maps)" }, signal: AbortSignal.timeout(60000) });
      if (r.ok) {
        answered = ENDPOINTS.indexOf(url);
        return (await r.json()) as never;
      }
      last = new Error(`${url}: HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1)));
  }
  throw last;
}

/** Read and keep one patch's permanent rivers. */
export async function fetchRivers(patch: string, lat: number, lon: number): Promise<River[]> {
  const m = /^(.+)-(\d+)-(\d+)$/.exec(patch);
  if (!m) throw new Error(`not a patch: ${patch}`);
  const [s, w, n, e] = box(lat, lon, Number(m[2]), Number(m[3]));
  const b = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  const answer = await query(`[out:json][timeout:90];way["waterway"="river"](${b});out tags geom;`);
  const rivers: River[] = [];
  for (const el of answer.elements) {
    const t = el.tags ?? {};
    if (el.type !== "way" || !el.geometry || t.intermittent === "yes" || t.seasonal === "yes" || t.ephemeral === "yes") continue;
    rivers.push({ id: el.id, name: t["name:en"] ?? t.name ?? "", points: el.geometry.map((p) => [p.lat, p.lon]) });
  }
  mkdirSync(OSM_CACHE, { recursive: true });
  writeFileSync(`${OSM_CACHE}/${patch}.json`, JSON.stringify({ patch, source: "OpenStreetMap, waterway=river (not intermittent or seasonal), via the Overpass API", accessed: new Date().toISOString(), box: [s, w, n, e], rivers }));
  return rivers;
}

/** A patch's permanent rivers, drawn onto its grid (`W` tiles a side with its halo, row 0 the
 *  south edge): 1 on each tile a river's line passes through, else 0. */
export function riverTiles(patch: string, lat: number, lon: number): Float32Array {
  const m = /^(.+)-(\d+)-(\d+)$/.exec(patch);
  if (!m) throw new Error(`not a patch: ${patch}`);
  const path = `${OSM_CACHE}/${patch}.json`;
  if (!existsSync(path)) throw new Error(`${path} is missing: run npx tsx tools/places/osm.ts`);
  const { rivers } = JSON.parse(readFileSync(path, "utf8")) as { rivers: River[] };
  const size = Number(m[2]);
  const metres = Number(m[3]);
  const W = size + 2 * HALO;
  const mid = (W - 1) / 2;
  const dlat = metres / M_PER_DEG;
  const dlon = metres / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const out = new Float32Array(W * W);
  const at = (la: number, lo: number): [number, number] => [(lo - lon) / dlon + mid, (la - lat) / dlat + mid];
  for (const r of rivers)
    for (let k = 1; k < r.points.length; k++) {
      const [x0, y0] = at(...r.points[k - 1]);
      const [x1, y1] = at(...r.points[k]);
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / steps);
        const y = Math.round(y0 + ((y1 - y0) * s) / steps);
        if (x >= 0 && y >= 0 && x < W && y < W) out[y * W + x] = 1;
      }
    }
  return out;
}

async function main(): Promise<void> {
  const locs = new Map((JSON.parse(readFileSync("investigation/landscapes/data/locations.json", "utf8")) as { id: string; lat: number; lon: number }[]).map((l) => [l.id, l]));
  let patches = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!patches.length) {
    const sel = JSON.parse(readFileSync("tools/places/selection.json", "utf8")) as { places: { row: string }[] };
    patches = [...new Set(sel.places.map((p) => p.row.replace(/-\w+-\d+$/, "")))];
  }
  const todo = patches.filter((p) => process.argv.includes("--again") || !existsSync(`${OSM_CACHE}/${p}.json`));
  // a second run from the other end shares the work (the server gives each caller two slots)
  if (process.argv.includes("--reverse")) todo.reverse();
  console.log(`${patches.length} patches, ${todo.length} to read`);
  // one at a time: the Overpass API is shared
  let failed = 0;
  for (const p of todo) {
    if (!process.argv.includes("--again") && existsSync(`${OSM_CACHE}/${p}.json`)) continue;
    const loc = locs.get(p.replace(/-\d+-\d+$/, ""));
    if (!loc) throw new Error(`no location for ${p}`);
    try {
      const rivers = await fetchRivers(p, loc.lat, loc.lon);
      console.log(`${p}: ${rivers.length} rivers${rivers.length ? ` (${[...new Set(rivers.map((r) => r.name).filter(Boolean))].slice(0, 4).join(", ")})` : ""}`);
    } catch (e) {
      // the shared server was busy: the next run reads it
      failed++;
      console.log(`${p}: not read (${e instanceof Error ? e.message : String(e)})`);
    }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  if (failed) throw new Error(`${failed} patches not read: run again`);
}

if (isMainThread && process.argv[1]?.replace(/\\/g, "/").endsWith("tools/places/osm.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
