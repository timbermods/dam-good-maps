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
//   npm run places:convert -- --finish-only (only finish the kept conversions, places/finish.ts:
//                                            the edge lip, the start and the objects, D331; no
//                                            conversion runs; prints the table for the progress log)
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
import { DIFFICULTY_RULES } from "../src/core/spec/mapspec";
import { convertRow, coverOf, FLOW_CAP, MAX_COVER, PATCHES, type Converted, type PlaceMeta } from "./places/convert";
import { FINISH, finishPlace } from "./places/finish";
import { defaultThreads, runPool, serve } from "./places/pool";
import { FAMILIES, slug, title } from "./places/titles";

const SURVEY = "investigation/landscapes";
/** Bump when a conversion would come out differently, so the kept ones are redone. */
const VERSION = 11;
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
/** Every place's map size where the data and the land allow (Kyler, 2026-09-28, D306). */
const WIDE = 256;

interface Job {
  row: string;
  meta: PlaceMeta;
  /** The signature's size in tiles, when the row frames it wider (D306). */
  focus?: number;
  /** A conversion kept from before its water cover was recorded: measure it. */
  kept?: Converted;
  /** A conversion to finish (places/finish.ts). */
  finish?: Converted;
}

serve<Job, Converted>((job) => {
  try {
    if (job.finish) return finishPlace(job.finish, job.meta);
    if (job.kept) {
      const cover = coverOf(job.kept);
      return cover > MAX_COVER ? { ...job.kept, ok: false, cover, reason: `water covers ${Math.round(cover * 100)}% of the map (at most ${Math.round(MAX_COVER * 100)}%)` } : { ...job.kept, cover };
    }
    return convertRow(job.row, job.meta, undefined, job.focus);
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
  /** `startMoved`: the start from the shore-first ranking (D214); `notes` and `shortOf`: what the
   *  place falls short of (D245: information); `rivers`: the source groups kept (rivers and lakes)
   *  and `observed`: how its water matches the real place's (D271, convert.ts `observedMatch`). */
  places: { id: string; name: string; row: string; focus?: number; status: Chosen["status"]; was?: string; flow: number; startMoved?: true; notes?: string[]; shortOf?: string[]; sourcesDropped?: Converted["dropped"]; rivers: number; observed: NonNullable<Converted["observed"]>; tiltKept: number; beds: number; spring?: Converted["spring"]; advisories: string[] }[];
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
  const cachePath = (key: string) => join(CACHE, `${key.replace("@", "-f")}.json`);
  // the finished conversions (places/finish.ts), kept beside them, once per FINISH version
  const finishPath = (key: string) => join(CACHE, `finish-${FINISH}`, `${key.replace("@", "-f")}.json`);
  mkdirSync(join(CACHE, `finish-${FINISH}`), { recursive: true });
  const finishOnly = process.argv.includes("--finish-only");
  let ran = 0;
  const t0 = performance.now();
  /** A conversion's key: its row, and `@<focus>` when it frames its signature wider (D306). */
  async function convert(list: string[]): Promise<void> {
    const todo: Job[] = [];
    for (const key of new Set(list)) {
      if (results.has(key)) continue;
      const [row, focus] = key.split("@");
      const kept = existsSync(cachePath(key)) ? (JSON.parse(readFileSync(cachePath(key), "utf8")) as Converted) : null;
      if (kept && (!kept.ok || kept.cover !== undefined)) results.set(key, kept);
      else todo.push({ row, meta: meta(byRow.get(row)!), ...(focus ? { focus: Number(focus) } : {}), ...(kept ? { kept } : {}) });
    }
    if (todo.length && finishOnly) console.log(`not converted (--finish-only): ${todo.length}`);
    if (todo.length && !finishOnly)
    await runPool<Job, Converted>(new URL(import.meta.url), todo, threads, (r, job) => {
      const key = job.focus ? `${job.row}@${job.focus}` : job.row;
      results.set(key, r);
      writeFileSync(cachePath(key), JSON.stringify(r));
      ran++;
      console.log(`${r.ok ? "ok  " : "FAIL"} ${String(r.size).padStart(3)}² ${(r.ms / 1000).toFixed(1).padStart(5)} s  flow ${r.flow ?? "-"} tilt ${r.tiltKept} beds ${r.beds}${r.spring ? ` spring ${r.spring.strength} (${r.spring.why})` : ""} rivers ${r.rivers ?? "-"}/${r.beginnings ?? "-"}${r.observed ? ` observed ${r.observed.water} found ${r.observed.recall} on it ${r.observed.precision}` : ""}${r.moved ? " start moved" : ""}${r.notes?.length ? ` notes: ${r.notes.join("; ")}` : ""}  ${r.row}  ${surveyName(byRow.get(r.row)!)}${r.ok ? "" : `: ${r.reason}`}`);
    });
    // the finish (places/finish.ts, D331, item 27): every conversion that passed, once
    const fin: (Job & { key: string })[] = [];
    for (const key of new Set(list)) {
      const r = results.get(key);
      if (!r?.ok || r.finish?.v === FINISH) continue;
      if (existsSync(finishPath(key))) {
        results.set(key, JSON.parse(readFileSync(finishPath(key), "utf8")) as Converted);
        continue;
      }
      const [row, focus] = key.split("@");
      fin.push({ key, row, meta: meta(byRow.get(row)!), ...(focus ? { focus: Number(focus) } : {}), finish: r });
    }
    const t1 = performance.now();
    await runPool<Job, Converted>(new URL(import.meta.url), fin, threads, (r, job) => {
      const key = (job as Job & { key: string }).key;
      results.set(key, r);
      if (r.ok) writeFileSync(finishPath(key), JSON.stringify(r));
      const f = r.finish;
      console.log(`${r.ok ? "fin " : "FAIL"} ${key}  ${f ? `lip ${f.lip}${f.pooled ? ` (${f.pooled} pooled)` : ""}, start ${f.moved ? `moved ${f.moved}` : "stayed"}${f.qualifies ? "" : ` (none qualifies: ${f.unmet.join(", ")})`}${f.inFlow ? `, ${f.inFlow} springs reached` : ""}, mines ${f.reachableMines}/${f.mines}, badwater ${f.badwater}, bushes ${f.bushes}, farmland ${f.farmland}, level ${f.level}` : r.reason}  ${Math.round((performance.now() - t1) / 1000)} s`);
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
    // Real places at 256², the signature as the focal point (Kyler, 2026-09-28, D306): each place
    // is built at 256² at its own scale, its signature (the land it was chosen for, its own size)
    // in the middle; where the data or the land will not take it, at its own size
    const sizeOf = (row: string) => Number(row.split("-")[1]);
    const withSize = (row: string, size: number) => row.replace(/^(n\d{3})-\d+-/, `$1-${size}-`);
    const sigRow = (p: Selection["places"][number]) => withSize(p.row, p.focus ?? sizeOf(p.row));
    const wide = (p: Selection["places"][number]) => {
      const sig = sigRow(p);
      const w = withSize(sig, WIDE);
      return sizeOf(sig) < WIDE && byRow.has(w) && existsSync(`${PATCHES}/${patchOf(w)}.f32.gz`) ? `${w}@${sizeOf(sig)}` : null;
    };
    await convert(sel.places.map((p) => wide(p) ?? sigRow(p)));
    const narrow = sel.places.filter((p) => wide(p) && results.get(wide(p)!) && !results.get(wide(p)!)!.ok);
    await convert(narrow.map(sigRow));
    if (finishOnly) {
      // the table for the progress log: each finished place, what it was given
      const rows: string[] = ["| Place | Mine sites (reachable of placed) | Badwater | Berries near the start | Start | Lip tiles |", "|---|---|---|---|---|---|"];
      const tot = { places: 0, twoMines: 0, badwater: 0, berries: 0, moved: 0, qualify: 0, lip: 0, lipPlaces: 0 };
      for (const p of sel.places) {
        const key = wide(p) && results.get(wide(p)!)?.ok ? wide(p)! : sigRow(p);
        const f = results.get(key)?.finish;
        if (!f) continue;
        tot.places++;
        if (f.reachableMines >= 2) tot.twoMines++;
        if (f.badwater) tot.badwater++;
        if (f.bushes >= DIFFICULTY_RULES.normal.bushesWithin20) tot.berries++;
        if (f.moved) tot.moved++;
        if (f.qualifies) tot.qualify++;
        tot.lip += f.lip;
        if (f.lip) tot.lipPlaces++;
        rows.push(`| ${p.name} | ${f.reachableMines} of ${f.mines} | ${f.badwater || "none"} | ${f.bushes} | ${f.moved ? `moved ${f.moved}` : "stayed"}${f.qualifies ? "" : " (none qualifies)"} | ${f.lipWithheld ? `none (${f.lipWithheld} withheld for the absolutes)` : f.lip}${f.pooled ? ` (${f.pooled} pooled)` : ""} |`);
      }
      console.log(rows.join("\n"));
      console.log(`\n${tot.places} places: ${tot.twoMines} with 2 reachable mine sites, ${tot.badwater} with a badwater source, ${tot.berries} with berries for an Iron Teeth start (${DIFFICULTY_RULES.normal.bushesWithin20}+ bushes), ${tot.qualify} with a start meeting D331's preferences, ${tot.moved} starts moved, ${tot.lip} lip tiles on ${tot.lipPlaces} places.`);
      return;
    }
    // Real places are kept on their own land (Kyler, 2026-09-26, D245): a place is never dropped,
    // moved to another part of its region, or given another height mapping or scale for a
    // playability check; it converts, and says what it falls short of. Only the absolutes fail a
    // conversion (the checks that are not about playability, and the starting-logs floor), and
    // then the tool stops: the floor is met by planting (D229), never by moving land.
    const regions = new Set<string>();
    for (const p of sel.places) {
      // the title's row is the signature's; the map's, the wider one where it converts
      const r = byRow.get(sigRow(p))!;
      const key = wide(p) && results.get(wide(p)!)!.ok ? wide(p)! : sigRow(p);
      const built = byRow.get(key.split("@")[0])!;
      const res = results.get(key)!;
      if (!res.ok) throw new Error(`${p.name} (${key}) does not convert: ${res.reason}`);
      const second = regions.has(r.region);
      regions.add(r.region);
      // a first-round place keeps its title; an addition is named by its row (a region's second
      // map by its own part of the place, titles.ts; still so when Kyler dropped the region's
      // first, D271)
      const name = p.status === "added" ? titleOf(r, second || sel.dropped.some((d) => byRow.get(d.row)?.region === r.region)).name : p.name;
      chosen.push({ row: built, loc: locs.get(r.location)!, name, place: meta(r).place, surveyName: surveyName(r), sample: meta(r).sample, status: p.status, was: p.was, result: res });
    }
    dropped.push(...sel.dropped);
    const kept = sel.places.filter((p) => wide(p) && !results.get(wide(p)!)!.ok);
    if (kept.length) console.log(`at their own size (D306: 256² did not convert): ${kept.map((p) => `${p.name} (${results.get(wide(p)!)!.reason})`).join("; ")}`);
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
      ...(r.spring ? { spring: { at: r.spring.at, why: r.spring.why, row: r.spring.row } } : {}),
    };
    writeFileSync(join(OUT, `${data.id}.json.gz`), gzipSync(strToU8(JSON.stringify(data)), { level: 9, mtime: 0 }));
  }
  const selection: Selection = {
    note: "Real places, second round (tools/places-convert.ts): the places in the gallery's order, the survey row each is made from, and the first round's places that no row gives any more. Written by the tool; `npm run places:convert -- --reselect` chooses again.",
    places: chosen.map((c) => ({ id: slug(c.name), name: c.name, row: c.row.id, ...(c.result.focus ? { focus: c.result.focus } : {}), status: c.status, ...(c.was ? { was: c.was } : {}), flow: c.result.flow!, ...(c.result.notes?.length ? { notes: c.result.notes } : {}), ...(c.result.shortOf?.length ? { shortOf: c.result.shortOf } : {}), ...(c.result.moved ? { startMoved: true as const } : {}), ...(c.result.dropped && (c.result.dropped.inFlow || c.result.dropped.noOutflow || c.result.dropped.offWater || c.result.dropped.unheld) ? { sourcesDropped: c.result.dropped } : {}), rivers: c.result.rivers ?? 0, observed: c.result.observed!, tiltKept: c.result.tiltKept!, beds: c.result.beds!, ...(c.result.spring ? { spring: c.result.spring } : {}), advisories: c.result.advisories ?? [] })),
    dropped,
  };
  writeFileSync(SELECTION, JSON.stringify(selection, null, 1) + "\n");
  const fam = (f: string) => chosen.filter((c) => c.row.family === f).length;
  // the water floor (D300): every place has water a pump reaches from the start
  const thirsty = chosen.filter((c) => c.result.shortOf?.includes("start.water")).map((c) => c.name);
  if (thirsty.length) throw new Error(`the water floor (D300) is not met: ${thirsty.join(", ")}`);
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
