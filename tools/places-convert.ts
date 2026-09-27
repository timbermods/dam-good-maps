// Real places, second round (Kyler, 2026-09-25 and 26; PLAN §20 D151, D152, D155, D164, D171, D174,
// D214, D224):
// every real place converted again from the landscape survey's elevation patches under today's
// rules, and the gallery grown to about 150. It writes each place's data
// (public/real-places/data/<id>.json.gz: terrain, sources, start, words) and the choice
// (tools/places/selection.json); `npm run places` then builds every map from its data and writes
// the gallery's index.
//
//   npm run places:convert                  (the places in selection.json, converted again; one
//                                            that no longer converts is replaced or dropped, below)
//   npm run places:convert -- --reselect    (choose again: the first round's places, then additions)
//   npm run places:convert -- --target 150  (how many places a reselection aims at)
//   npm run places:convert -- --threads 8
//
// It needs the survey's patches, which stay out of git: from investigation/landscapes/, run
// `npm ci --ignore-scripts --cache ./npm-cache` and `npm run sample` (about 1.1 GB of Terrain
// Tiles and patches, 10 minutes; every tile is checked against the survey's recorded sha256; the
// run rewrites data/acquisition.json and data/tile-manifest.jsonl.gz with the new access times:
// `git checkout` them). Each conversion is
// kept in investigation/landscapes/local/real-places-2/ (gitignored, D195), so a second run redoes
// only what changed; delete the folder to redo everything.
//
// The choice, as the first round's (investigation/landscapes/curate.ts): conversions that pass,
// distinct from each other, spread across the landform families.
// - The first round's 85 places come first, each from its own patch and mapping. One that no
//   longer passes tries its patch's other mappings, then the region's other patches (its title
//   stays); one that none of those gives is dropped, with the reason.
// - Additions go in rounds: in each, every family (fewest places first) takes its best passing
//   conversion, preferring a region no place comes from yet, then a size (128², 256², 96², 128²
//   by round), then the survey's own score (shape kept, normalised mapping, few flat-topped
//   tiles). A region gives at most two maps, and its second must be other land: at most a quarter
//   of the smaller map may lie inside the other's footprint. Its title names its own part of the
//   place: a real feature in its square or a position (titles.ts SECOND, D214), else the part the
//   survey sampled ("Colca Canyon North"). The survey's random-land controls and the Las Medulas
//   region (a Roman mine, D136) stay out.
// - Converted again (no --reselect), a place that no longer passes (D214 capped the flow; D224
//   asks for the starting-logs floor near the start) tries
//   its region's other rows as those rules allow, on other land than the region's other map: a
//   first-round place its first-round fallbacks (its title kept), an addition the region's other
//   rows, best first. One that none of them gives is dropped, with the reason.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { gzipSync, strToU8 } from "fflate";
import { isMainThread } from "node:worker_threads";
import { LOG_FLOOR, PLACE_FORMAT, type PlaceData } from "../src/core/places/place";
import { convertRow, coverOf, FLOW_CAP, MAX_COVER, PATCHES, type Converted, type PlaceMeta } from "./places/convert";
import { defaultThreads, runPool, serve } from "./places/pool";
import { FAMILIES, slug, title } from "./places/titles";

const SURVEY = "investigation/landscapes";
/** Bump when a conversion would come out differently, so the kept ones are redone. */
const VERSION = 3;
const CACHE = `${SURVEY}/local/real-places-2/v${VERSION}`;
const SELECTION = "tools/places/selection.json";
const OUT = "public/real-places/data";
/** Conversions a family tries at once, when it looks for its next place. */
const BATCH = 3;
/** Rows a first-round place tries before it is dropped. */
const FALLBACKS = 16;
/** Maps of one region, at most: the gallery shows many places, not many views of a few. */
const PER_REGION = 2;
const SIZES = [128, 256, 96, 128];

interface Job {
  row: string;
  meta: PlaceMeta;
  /** A conversion kept from before its water cover was recorded: measure it. */
  kept?: Converted;
}

serve<Job, Converted>((job) => {
  try {
    if (job.kept) {
      const cover = coverOf(job.kept);
      return cover > MAX_COVER ? { ...job.kept, ok: false, cover, reason: `water covers ${Math.round(cover * 100)}% of the map (at most ${Math.round(MAX_COVER * 100)}%)` } : { ...job.kept, cover };
    }
    return convertRow(job.row, job.meta);
  } catch (e) {
    return { row: job.row, ok: false, reason: `error: ${String(e instanceof Error ? e.message : e)}`, size: 0, ms: 0 };
  }
});

interface Row {
  id: string;
  location: string;
  region: string;
  family: string;
  cohort: string;
  size: number;
  metres: number;
  cap: number;
  mode: string;
  mapping: { shapeCorrelation: number; saturatedShare: number; readabilityProxy: boolean; reliefMetres: number };
  checks: { ok: boolean }[];
}

interface Loc {
  id: string;
  region: string;
  name: string;
  family: string;
  cohort: string;
  lat: number;
  lon: number;
  anchor?: { lat: number; lon: number };
}

interface Chosen {
  row: Row;
  loc: Loc;
  name: string;
  place: string;
  surveyName: string;
  sample?: string;
  /** "kept" (the first round's, from its own row), "replaced" (the first round's, from another
   *  row: `was`), or "added". */
  status: "kept" | "replaced" | "added";
  was?: string;
  result: Converted;
}

interface Selection {
  note: string;
  /** `rivers`: the most source groups kept, when fewer than the land gives (D214); `startMoved`:
   *  the start from the shore-first ranking (D214). */
  places: { id: string; name: string; row: string; status: Chosen["status"]; was?: string; flow: number; rivers?: number; startMoved?: true; sourcesDropped?: Converted["dropped"]; advisories: string[] }[];
  /** Places no row gives any more: the first round's (no status: Majuli), and those D214 or D224
   *  took (their status as they were). */
  dropped: { name: string; row: string; status?: Chosen["status"]; reason: string; tried: string[] }[];
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const score = (r: Row) => r.mapping.shapeCorrelation * 100 + (r.mode === "normalised" ? 20 : 0) - r.mapping.saturatedShare * 10 - r.checks.filter((c) => !c.ok).length * 2;
const patchOf = (row: string) => row.replace(/-\w+-\d+$/, "");

/** A map's footprint on the ground, in metres east and north of `ref`. */
function footprint(loc: Loc, size: number, metres: number, ref: { lat: number; lon: number }): [number, number, number, number] {
  const x = (loc.lon - ref.lon) * 111195 * Math.cos((ref.lat * Math.PI) / 180);
  const y = (loc.lat - ref.lat) * 111195;
  const half = (size * metres) / 2;
  return [x - half, y - half, x + half, y + half];
}

/** How much of the smaller map lies inside the other's footprint. */
function overlap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (r: typeof a) => (r[2] - r[0]) * (r[3] - r[1]);
  return (w * h) / Math.min(area(a), area(b));
}

async function main(): Promise<void> {
  if (!existsSync(PATCHES)) throw new Error(`${PATCHES} is missing: download the survey's patches (see this file's header)`);
  const threads = Number(arg("threads") ?? defaultThreads());
  const rows = gunzipSync(readFileSync(join(SURVEY, "data/converted.jsonl.gz")))
    .toString()
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row);
  const byRow = new Map(rows.map((r) => [r.id, r]));
  const locs = new Map((JSON.parse(readFileSync(join(SURVEY, "data/locations.json"), "utf8")) as Loc[]).map((l) => [l.id, l]));
  const excluded = new Set(Object.entries(JSON.parse(readFileSync(join(SURVEY, "data/quality-flags.json"), "utf8")) as Record<string, { excludeFromLibrary?: boolean }>).filter(([, f]) => f.excludeFromLibrary).map(([r]) => r));
  const eligible = rows.filter((r) => r.cohort === "named" && r.cap === 16 && r.mapping.readabilityProxy && r.mapping.reliefMetres >= 5 && !excluded.has(r.region) && existsSync(`${PATCHES}/${patchOf(r.id)}.f32.gz`));
  mkdirSync(CACHE, { recursive: true });

  const surveyName = (r: Row) => `${locs.get(r.location)!.name}, ${r.metres} m per tile`;
  const meta = (r: Row): PlaceMeta => {
    const loc = locs.get(r.location)!;
    const t = titleOf(r, false);
    const fam = FAMILIES[r.family];
    return { survey: r.id, surveyName: surveyName(r), ...(t.sample ? { sample: t.sample } : {}), id: slug(t.name), name: t.name, place: t.place, family: r.family, familyName: fam.name, plays: fam.plays, metres: r.metres, lat: loc.lat, lon: loc.lon };
  };

  // every conversion, from the kept ones or run now
  const results = new Map<string, Converted>();
  const cachePath = (row: string) => join(CACHE, `${row}.json`);
  let ran = 0;
  const t0 = performance.now();
  async function convert(list: string[]): Promise<void> {
    const todo: Job[] = [];
    for (const row of new Set(list)) {
      if (results.has(row)) continue;
      const kept = existsSync(cachePath(row)) ? (JSON.parse(readFileSync(cachePath(row), "utf8")) as Converted) : null;
      if (kept && (!kept.ok || kept.cover !== undefined)) results.set(row, kept);
      else todo.push({ row, meta: meta(byRow.get(row)!), ...(kept ? { kept } : {}) });
    }
    if (!todo.length) return;
    await runPool<Job, Converted>(new URL(import.meta.url), todo, threads, (r) => {
      results.set(r.row, r);
      writeFileSync(cachePath(r.row), JSON.stringify(r));
      ran++;
      console.log(`${r.ok ? "ok  " : "FAIL"} ${String(r.size).padStart(3)}² ${(r.ms / 1000).toFixed(1).padStart(5)} s  flow ${r.flow ?? "-"}${r.groups !== undefined && r.groups < (r.beginnings ?? 0) ? ` rivers ${r.groups}/${r.beginnings}` : ""}${r.moved ? " start moved" : ""}  ${r.row}  ${surveyName(byRow.get(r.row)!)}${r.ok ? "" : `: ${r.reason}`}`);
    });
  }

  const chosen: Chosen[] = [];
  const dropped: Selection["dropped"] = [];
  const pick = (r: Row, status: Chosen["status"], opts: { name?: string; place?: string; was?: string } = {}) => {
    const m = meta(r);
    chosen.push({ row: r, loc: locs.get(r.location)!, name: opts.name ?? m.name, place: opts.place ?? m.place, surveyName: m.surveyName, sample: m.sample, status, was: opts.was, result: results.get(r.id)! });
  };

  // the first round's places: each from its own row, else its patch's other mappings, else the
  // region's other patches
  const options = (id: string) => {
    const own = byRow.get(id)!;
    const sameRegion = eligible.filter((r) => r.region === own.region && r.id !== id);
    const samePatch = sameRegion.filter((r) => patchOf(r.id) === patchOf(id)).sort((a, b) => score(b) - score(a));
    const others = sameRegion.filter((r) => patchOf(r.id) !== patchOf(id)).sort((a, b) => (b.size === own.size ? 10 : 0) + score(b) - (a.size === own.size ? 10 : 0) - score(a) || a.id.localeCompare(b.id));
    return [own, ...samePatch, ...others].slice(0, FALLBACKS);
  };
  /** A region's two maps show other land: at most a quarter of the smaller inside the other. */
  const apart = (r: Row, other: Row) => {
    const loc = locs.get(r.location)!;
    const ref = loc.anchor ?? { lat: loc.lat, lon: loc.lon };
    return overlap(footprint(loc, r.size, r.metres, ref), footprint(locs.get(other.location)!, other.size, other.metres, ref)) <= 0.25;
  };
  /** A place's title from its row: a region's second map is named by its own part of the place. */
  const titleOf = (r: Row, second: boolean) => title(surveyName(r), second, patchOf(r.id));

  const reselect = process.argv.includes("--reselect") || !existsSync(SELECTION);
  if (!reselect) {
    // the places as chosen before, converted again
    const sel = JSON.parse(readFileSync(SELECTION, "utf8")) as Selection;
    await convert(sel.places.map((p) => p.row));
    // Rivers, not floods (D214): a place whose row no longer converts, its water held to the
    // size's cap and its start moved to the water, tries its region's other rows as the choice's
    // rules allow (a first-round place its first-round fallbacks, title kept; an addition the
    // region's other rows, best first), each on other land than the region's other map; a place
    // none of them gives is dropped, with the reason.
    const inUse = new Set(sel.places.map((p) => p.row));
    const failing = sel.places.filter((p) => !results.get(p.row)!.ok);
    const others = (p: Selection["places"][number]) => sel.places.filter((q) => q !== p && byRow.get(q.row)!.region === byRow.get(p.row)!.region).map((q) => byRow.get(q.row)!);
    const tries = new Map(
      failing.map((p) => {
        const own = byRow.get(p.row)!;
        const pool =
          p.status === "added"
            ? eligible.filter((r) => r.region === own.region).sort((a, b) => (b.size === own.size ? 10 : 0) + score(b) - (a.size === own.size ? 10 : 0) - score(a) || a.id.localeCompare(b.id))
            : options(p.was ?? p.row);
        return [p.id, pool.filter((r) => !inUse.has(r.id) && others(p).every((o) => apart(r, o))).slice(0, FALLBACKS)] as const;
      }),
    );
    for (let k = 0; k < FALLBACKS; k++) {
      const wanted = failing.filter((p) => !tries.get(p.id)!.slice(0, k).some((r) => results.get(r.id)?.ok)).map((p) => tries.get(p.id)![k]).filter(Boolean);
      if (!wanted.length) break;
      await convert(wanted.map((r) => r.id));
    }
    const regions = new Set<string>();
    for (const [k, p] of sel.places.entries()) {
      const own = byRow.get(p.row)!;
      const second = regions.has(own.region);
      const res = results.get(p.row)!;
      // a replacement is other land than the region's maps as they end up: those chosen before it,
      // and those after it that keep their row
      let r: Row | undefined = res.ok ? own : undefined;
      if (!r) {
        const mates = [
          ...chosen.filter((c) => c.row.region === own.region).map((c) => c.row),
          ...sel.places.slice(k + 1).filter((q) => byRow.get(q.row)!.region === own.region && results.get(q.row)!.ok).map((q) => byRow.get(q.row)!),
        ];
        for (const o of tries.get(p.id)!) {
          if (inUse.has(o.id) || !mates.every((m) => apart(o, m))) continue;
          if (!results.has(o.id)) await convert([o.id]);
          if (results.get(o.id)!.ok) {
            r = o;
            break;
          }
        }
      }
      if (!r) {
        const rule = /start\.log_floor/.test(res.reason ?? "") ? `the starting-logs floor (D224): at least ${LOG_FLOOR} logs within 20 tiles' walk of the start` : `rivers, not floods (D214): at most ${FLOW_CAP[own.size]}× the water for ${own.size}²`;
        dropped.push({ name: p.name, row: p.row, status: p.status, reason: `${rule}; no row of the region passes (its own: ${res.reason})`, tried: [p.row, ...tries.get(p.id)!.map((o) => o.id)] });
        continue;
      }
      regions.add(r.region);
      inUse.add(r.id);
      const status = r === own ? p.status : p.status === "added" ? "added" : "replaced";
      const was = r === own ? p.was : p.status === "added" ? undefined : (p.was ?? p.row);
      // a first-round place keeps its title; an addition is named by its row
      const name = p.status === "added" ? titleOf(r, second).name : p.name;
      chosen.push({ row: r, loc: locs.get(r.location)!, name, place: meta(r).place, surveyName: surveyName(r), sample: meta(r).sample, status, was, result: results.get(r.id)! });
    }
    dropped.push(...sel.dropped);
  } else {
    // ---- the first round's places (`options`)
    const library = (JSON.parse(readFileSync(join(SURVEY, "library/index.json"), "utf8")) as { items: { id: string; family: string }[] }).items.filter((i) => i.family !== "random");
    const tries = new Map(library.map((i) => [i.id, options(i.id)]));
    for (let k = 0; k < FALLBACKS; k++) {
      const wanted = library.filter((i) => !tries.get(i.id)!.slice(0, k).some((r) => results.get(r.id)?.ok)).map((i) => tries.get(i.id)![k]).filter(Boolean);
      if (!wanted.length) break;
      await convert(wanted.map((r) => r.id));
    }
    for (const i of library) {
      const own = byRow.get(i.id)!;
      const t = titleOf(own, false);
      const ok = tries.get(i.id)!.find((r) => results.get(r.id)?.ok);
      if (ok) pick(ok, ok.id === i.id ? "kept" : "replaced", { name: t.name, place: t.place, ...(ok.id === i.id ? {} : { was: i.id }) });
      else dropped.push({ name: t.name, row: i.id, reason: results.get(i.id)!.reason ?? "", tried: tries.get(i.id)!.map((r) => r.id) });
    }
    console.log(`first round: ${chosen.filter((c) => c.status === "kept").length} kept, ${chosen.filter((c) => c.status === "replaced").length} from another row, ${dropped.length} dropped`);

    // ---- additions, in rounds across the families
    const target = Number(arg("target") ?? 150);
    const families = Object.keys(FAMILIES);
    const failed = new Set<string>();
    const regionsUsed = () => new Set(chosen.map((c) => c.row.region));
    const distinct = (r: Row) => {
      const loc = locs.get(r.location)!;
      const ref = loc.anchor ?? { lat: loc.lat, lon: loc.lon };
      const f = footprint(loc, r.size, r.metres, ref);
      const same = chosen.filter((c) => c.row.region === r.region);
      return same.length < PER_REGION && same.every((c) => overlap(f, footprint(c.loc, c.row.size, c.row.metres, ref)) <= 0.25);
    };
    for (let round = 0; chosen.length < target; round++) {
      const desired = SIZES[round % SIZES.length];
      const count = (f: string) => chosen.filter((c) => c.row.family === f).length;
      const order = [...families].sort((a, b) => count(a) - count(b) || a.localeCompare(b));
      const optionsOf = (f: string) => {
        const used = regionsUsed();
        return eligible
          .filter((r) => r.family === f && !failed.has(r.id) && !chosen.some((c) => c.row.id === r.id) && distinct(r))
          .sort((a, b) => (used.has(a.region) ? 1 : 0) - (used.has(b.region) ? 1 : 0) || (b.size === desired ? 10 : 0) + score(b) - (a.size === desired ? 10 : 0) - score(a) || a.id.localeCompare(b.id));
      };
      let added = 0;
      const pending = new Set(order);
      while (pending.size && chosen.length < target) {
        // each family still looking tries its next few, all at once
        await convert([...pending].flatMap((f) => optionsOf(f).slice(0, BATCH).map((r) => r.id)));
        for (const f of order) {
          if (!pending.has(f) || chosen.length >= target) continue;
          const opts = optionsOf(f).slice(0, BATCH);
          if (!opts.length) {
            pending.delete(f);
            continue;
          }
          const ok = opts.find((r) => results.get(r.id)?.ok);
          for (const r of opts) if (!results.get(r.id)?.ok && r !== ok) failed.add(r.id);
          if (ok && distinct(ok)) {
            const again = regionsUsed().has(ok.region);
            const t = titleOf(ok, again);
            pick(ok, "added", { name: t.name, place: t.place });
            added++;
            pending.delete(f);
          } else if (ok) failed.add(ok.id);
        }
      }
      console.log(`round ${round + 1} (${desired}² first): ${added} added, ${chosen.length} places`);
      if (!added) break;
    }
  }

  // ---- titles are unique, and each place's data
  const ids = new Set<string>();
  for (const c of chosen) {
    const id = slug(c.name);
    if (ids.has(id)) throw new Error(`two places are called ${c.name}`);
    ids.add(id);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const c of chosen) {
    const r = c.result;
    const fam = FAMILIES[c.row.family];
    const data: PlaceData = {
      format: PLACE_FORMAT,
      survey: c.row.id,
      surveyName: c.surveyName,
      ...(c.sample ? { sample: c.sample } : {}),
      id: slug(c.name),
      name: c.name,
      place: c.place,
      family: c.row.family,
      familyName: fam.name,
      plays: fam.plays,
      metres: c.row.metres,
      lat: c.loc.lat,
      lon: c.loc.lon,
      W: r.size,
      H: r.size,
      heights: r.heights!,
      sources: r.sources!,
      start: r.start!,
    };
    writeFileSync(join(OUT, `${data.id}.json.gz`), gzipSync(strToU8(JSON.stringify(data)), { level: 9, mtime: 0 }));
  }
  const selection: Selection = {
    note: "Real places, second round (tools/places-convert.ts): the places in the gallery's order, the survey row each is made from, and the first round's places that no row gives any more. Written by the tool; `npm run places:convert -- --reselect` chooses again.",
    places: chosen.map((c) => ({ id: slug(c.name), name: c.name, row: c.row.id, status: c.status, ...(c.was ? { was: c.was } : {}), flow: c.result.flow!, ...(c.result.groups !== undefined && c.result.groups < (c.result.beginnings ?? 0) ? { rivers: c.result.groups } : {}), ...(c.result.moved ? { startMoved: true as const } : {}), ...(c.result.dropped && (c.result.dropped.inFlow || c.result.dropped.noOutflow) ? { sourcesDropped: c.result.dropped } : {}), advisories: c.result.advisories ?? [] })),
    dropped,
  };
  writeFileSync(SELECTION, JSON.stringify(selection, null, 1) + "\n");
  const fam = (f: string) => chosen.filter((c) => c.row.family === f).length;
  console.log(
    `${chosen.length} places (${chosen.filter((c) => c.status === "kept").length} kept, ${chosen.filter((c) => c.status === "replaced").length} replaced, ${chosen.filter((c) => c.status === "added").length} added; ${dropped.length} dropped) in ${Math.round((performance.now() - t0) / 1000)} s, ${ran} conversions run. ` +
      `By family: ${Object.keys(FAMILIES).map((f) => `${f} ${fam(f)}`).join(", ")}. Sizes: ${[96, 128, 256].map((s) => `${s}² ${chosen.filter((c) => c.row.size === s).length}`).join(", ")}.`,
  );
}

if (isMainThread)
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
