// Real places (ROADMAP "Real places", PLAN §20 D136): turn the landscape survey's library
// (investigation/landscapes/library/) into the gallery's own data, under public/real-places/.
//
//   npm run places                         (writes public/real-places/)
//   npm run places -- --check              (writes nothing; fails when the committed files differ)
//   npm run places -- --only glencoe       (builds and checks the places named, writes nothing)
//   npm run places -- --only a,b --write   (writes only the places named: their files and index entries)
//   npm run places -- --resume <dir>       (keeps each place's outcome in <dir> as it ends; run again with the same
//                                          <dir> after a stop to do only the places left)
//   npm run places -- --water --out <dir>  (each place's water measure too, written to <dir>; `--rules port` builds
//                                          them under the port's water rules, as before D311's conversion)
//   npm run places -- --ruins              (lays only the ruins again, on the committed places: their land, water,
//                                          springs, start and plants as they are; writes as a full run would)
//   npm run places -- --shards 1           (one place after another on this process: the places run on one
//                                          process a core by default, the same log, files and verdicts)
//   npm run places -- --check --shard 2/5  (checks only shard 2 of 5's places, tools/lib/placeShards.ts, and the whole
//                                          set's index and files as committed: the Nightly's `places (i/n)` jobs; every
//                                          place is in one shard, so the shards together are the full --check)
//   npm run places -- --times              (a line under each place of where its time went: each step, the settles made)
//
// For every named place in the library (the three random-land controls are survey controls, not
// places, and stay out) it writes:
// - data/<id>.json.gz: the place's heights, water sources, start and planted objects, with its
//   name, landform family, scale and a plain line on how it plays (src/core/places/place.ts);
// - cards/<id>.jpg: the card's picture, our own top-down render (src/core/render/shade.ts) of the
//   map with its settled water, north up;
// - index.json: every place for the gallery page, with the sha256 of its .timber and the faults
//   its own map has (`faults`, from the generate profile's checks). A place whose start fails the floors
//   (its plants on dry soil cannot move without costing the start its fast wood: no moist ground within
//   its walk), one whose start has no water within its walk once every mend is tried (#1218), or one named in
//   WITHHELD_UNTIL until a fault of its land is mended, ships no data, card or index entry; every run prints it by
//   name with its reason and counts it withheld.
// Each .timber is built with src/core/places (build, settle, validate, write) and must pass the
// export profile and every check of the generate profile but the known faults (the conversion's, which
// every place has, and each place's own, recorded in `faults`); the tool stops on any other that fails.
// Objects only, never the land (D245, D331): a start moves to the best spot its land offers, a start
// that lost its water gets a spring, a start short of berries gets bushes, and plants on soil that
// kills them move to moist ground close by or go (#523, tools/lib/placePlants.ts), the start's wood and
// berries first. A source that stands in another's flow merges into the upstream source that feeds it, where the
// ruling's limits allow (tools/lib/placeSources.ts: sources only at heads, D171). Everything it writes is the same bytes on every run.
//
// The product never imports from investigation/ (tests/unit/boundaries.test.ts); this tool reads the
// library's data files at run time, as tools may.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync, strToU8 } from "fflate";
import encodeJpeg from "../src/core/format/vendor/jpeg-encoder.js";
import { entityJson } from "../src/core/format/entities";
import { stringify } from "../src/core/format/json";
import {
  buildPlace,
  decodeHeights,
  setPlaceRules,
  decodeTiles,
  placeEntities,
  placeFileName,
  validatePlace,
  PLACE_FAULT_CHECKS,
  CONVERSION_FAULT_CHECKS,
  PLACE_FORMAT,
  type PlaceData,
  type PlaceIndex,
  type PlaceIndexEntry,
} from "../src/core/places/place";
import { encodeHeights, encodeTiles } from "./lib/placeData";
import { BODY, FILM_DEPTH, FILM_THIN_SHARE, FILM_TILES, WET, bodies, compareWater, films, settleFile, startFails } from "./lib/placeWater";
import { cutBasins, cutBed, filmBasin, floor0Sheet, realFilms, realMask } from "./lib/placeBasins";
import { decodeTiles as decodeGaps } from "../src/core/places/place";
import { keepNearest, settlePlants, startWood, startWoodSpecies } from "./lib/placePlants";
import { flaggedSources, mendSources } from "./lib/placeSources";
import { FEED_MIN, realMeasure, realParts, searchFeeds, type FeedStep } from "./lib/placeFeeds";
import { unneededBeds } from "./lib/placeBeds";
import { claimOrder as placeClaimOrder, parseShard, shardMoves, shardPlaces, type Shard } from "./lib/placeShards";
import { DEAD_TREES_KEEP_LOGS, LOG_FLOOR_WALK, LOGS_PER_TREE_SPECIES } from "../src/core/data/logFloor";
import { startWalkField } from "../src/core/resources/baseline";
import { writeTimber } from "../src/core/format/timber";
import { SettleCache } from "../src/core/features/build";
import { mapFileName } from "../src/core/format/fileName";
import { relaxEdges } from "../src/core/land/levels";
import { EDITOR_LEVEL } from "../src/core/spec/mapspec";
import { edgeLip } from "../src/core/water/edgeLip";
import { aboveStart, placeSprings, startPool } from "../src/core/places/spring";
import { placeRuins } from "../src/core/places/ruins";
import { placeStartSpots, startTiles } from "../src/core/places/start";
import { thumbnailRgba } from "../src/core/render/shade";
import { validateMap } from "../src/core/validate/checks";
import type { CheckResult } from "../src/core/validate/report";

const LIBRARY = "investigation/landscapes/library";
/** The processes the places run on at once (`--shards n` sets it; one a core by default; 1 runs them here, in turn). */
const SHARDS = Math.max(1, Number(process.argv.includes("--shards") ? process.argv[process.argv.indexOf("--shards") + 1] : availableParallelism()));
/** Where the run writes (`--out dir` writes a trial elsewhere; `--check` compares with it). */
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "public/real-places";
/** The card picture's side in pixels. */
const CARD = 240;
const CARD_QUALITY = 60;
/** A source this close to the map's edge (tiles from the border) gets the edge lip: the survey moved its
 *  inflows at most three steps in from the edge. */
const EDGE_SOURCE_REACH = 3;
/** How far along the edge the lip beside such a source reaches (tiles): enough to turn its water
 *  inward, where a longer lip (water/edgeLip.ts's 16, for one river's mouth) joins the lips of the
 *  survey's several inflows along one edge into a wall. */
const EDGE_LIP_REACH = 6;
/** The longer walk to a shore a start's spot may have when no nearer spot gives it water (tiles; the
 *  check allows Normal's 20 from the start's middle). */
const LONG_SHORE_WALK = 22;
/** The walk to a shore every spot is tried within when no nearer spot gives the start water (tiles). */
const WIDE_SHORE_WALK = 40;
/** The start's land: item 47's farmland and the start's floors (D515: its bench, walkable land, fast wood and
 *  forester's plot), information for a real place (D331): a place whose start falls short warns, never drops (D245). */
const START_LAND = ["start.farmland", "start.level_land", "start.reach", "start.forester", "start.wood_fast"];
/** The springs tried by a start that lost its water: [the walk the spring stands within plus 4, the
 *  places tried], nearer ones first. */
const SPRING_TRIES: [number, number][] = [
  [20, 6],
  [26, 12],
];
/** How far a plant on soil that kills it may move to ground where it lives (tiles, either way): the
 *  forest shifts to the moist ground beside where it stood, not across the map. */
const PLANT_REACH = 4;
/** The walk from the start the trees that give back the start's lost logs stand within (the `start.wood` fix's:
 *  2 inside the 20 tiles the check counts). Their logs per tree are the species' own (`LOGS_PER_TREE_SPECIES`). */
const WOOD_WALK = 18;
/** The walk the farmland check counts the start's moist ground within (tiles: `start.farmland` and `start.forester`). */
const FARM_WALK = 20;
/** The start's land floors (D515) no object makes: its bench, its walkable land, and the moist ground for its
 *  first farms and a forester. A moved start is ranked on these before its wood and berries, which objects give. */
const LAND_FLOORS = ["start.level_land", "start.reach", "start.farmland", "start.forester"];
/** The start's wood checks, which fast trees planted by it can meet: its logs, the starting-logs floor and the
 *  fast species' share (D85, D224, D515). */
const WOOD_CHECKS = ["start.wood", "start.wood_floor", "start.wood_fast"];
/** Places withheld by name until a fault of their land is mended, with the reason every run prints. Dinaric
 *  karst Plitvice's start meets every floor since the start's move ranks by the land floors, but its conversion puts
 *  a source in another's flow (`water.source_in_flow`); it left `PLACES_SOURCES_IN_FLOW` (tests/contract/placesCommon.ts,
 *  whose note says Real places 2 places sources only at heads) when #1094 withheld it, and that list never grows:
 *  planning's ruling on #1096. Twelve Apostles has no pumpable water within 20 tiles of its start and its build has
 *  faults no known list takes (`water.settles`, a source in another's flow). A place whose start the run leaves with
 *  no water within its walk at all is withheld without a name here (no place ships that way: D(new-films), planning's
 *  rulings on #1201), printed with what was tried; #1218 gave the others it named a pool or leaves that to the run. */
const WITHHELD_UNTIL: Record<string, string> = {
  "dinaric-karst-plitvice": "withheld until water.source_in_flow is mended (sources at heads only)",
  "twelve-apostles": "withheld until its start has pumpable water within 20 tiles (#1218: no spot by its real water, the sea, has a pool but one that costs start.level_land and start.forester; the sea's bed floods the start; no spring by the start or by six spots near it stands as a pool) and its water settles (water.settles) with no source in another's flow, which its build has",
};
/** The start's springs by the start built in turn, after the best, for one that costs no water over real water
 *  (planning's ruling of 2026-11-16 on Cliffs of Moher): each is a springs' search of its own. */
const COSTLESS_TRIES = 6;
/** How many logs under `start.wood`'s limit a place's start may be and still be topped up to it (a twentieth of Normal's 200). */
const WOOD_NEAR_MISS = 10;

/** Each family's name on the page and how it plays: the survey's "play value" for the family
 *  (investigation/landscapes/FAMILIES.md), in plain words. A family label names the region the
 *  survey sampled, so the line says what the landform tends to give. */
const FAMILIES: Record<string, { name: string; plays: string }> = {
  archipelago: { name: "Archipelago", plays: "Islands split the land into many routes; plan how you cross." },
  badlands: { name: "Badlands", plays: "Gullies cut many small narrows and walls; flat land for farms is scarce." },
  braided: { name: "Braided river", plays: "Channels split around gravel islands, so you have several places to dam." },
  caldera: { name: "Caldera", plays: "A volcanic bowl; a dam on its outlet can hold a large lake." },
  canyon: { name: "Canyon", plays: "Narrow places to dam and high ground to claim; flat land is scarce." },
  coast: { name: "Coast", plays: "Cliffs and small basins along the shore." },
  cone: { name: "Volcano", plays: "Land falls away from a peak on every side, so you build upward." },
  confluence: { name: "River junction", plays: "Rivers meet, so dam sites and routes out compete." },
  delta: { name: "Delta", plays: "Many small channels and islands; storage is shallow and flooding is a risk." },
  escarpment: { name: "Escarpment", plays: "A steep face splits high and low ground, with a few ways through." },
  falls: { name: "Waterfall", plays: "Drops in the river give height and power; storage depends on the pools above them." },
  fan: { name: "Alluvial fan", plays: "Dry land fans out from a valley mouth; irrigation decides where you grow." },
  fjord: { name: "Fjord", plays: "Steep shores and wide water to store." },
  glacial: { name: "Glacial valley", plays: "Wide valley floors under high ground, with side valleys hanging above." },
  gorge: { name: "Gorge", plays: "Short dams and falls; room beside the water is tight." },
  karst: { name: "Karst", plays: "Steep hills around separate basins; routes between them take planning." },
  lakes: { name: "Lakes", plays: "Chains of lakes store water; their outlets decide how far each can grow." },
  meander: { name: "Winding river", plays: "A winding river; cut-off bends can keep water through a drought." },
  mesa: { name: "Mesa", plays: "Flat-topped heights that are hard to reach; the gaps between them make dam sites." },
  plateau: { name: "Plateau", plays: "Broad high ground to build on; deep water may be hard to reach." },
};

/** Survey names a player could misread, by library id. "Badwater" is a place name in Death Valley,
 *  and a hazard in Timberborn: this map has none. */
const RENAME: Record<string, string> = {
  "n101-128-120-normalised-16": "Death Valley",
};

interface LibraryItem {
  id: string;
  name: string;
  family: string;
  size: number;
  metres: number;
  fixture: string;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

type Fixture = {
  W: number;
  H: number;
  heights: number[];
  referenceHeights: number[];
  waterSources: { x: number; y: number; strength: number }[];
  start: { x: number; y: number; z: number; orientation: string } | null;
  entities: Record<string, unknown>[];
  metres: number;
};

/** The place's one name (D522, Kyler: "Mount Fuji", not "Near Mount Fuji"): the survey's name without its "Near", its
 *  scale and its sample's direction. Its id is `slug(name)`. */
function placeName(item: LibraryItem): string {
  const survey = item.name.replace(/, \d+ m per tile$/, "").replace(/ \((north|south|east|west|northeast|northwest|southeast|southwest) sample\)$/, "").trim();
  if (!/^Near /.test(survey)) throw new Error(`${item.id}: unexpected survey name ${survey}`);
  return RENAME[item.id] ?? survey.replace(/^Near /, "");
}

/** A library fixture as place data. Every object is checked against what the place's builders
 *  write, so the map is the survey's, object for object. */
function toPlace(item: LibraryItem, fx: Fixture): PlaceData {
  const W = fx.W;
  const H = fx.H;
  if (W !== H || W !== item.size) throw new Error(`${item.id}: size ${W}×${H}, index says ${item.size}`);
  if (!fx.start) throw new Error(`${item.id}: no start`);
  const sealed = Uint8Array.from(fx.heights);
  // No edge walls (D151): the survey raised a ring round the map to seal it (its `modifications`
  // count the cells), which the game's edge turns into a wall holding water back. The land is the
  // survey's own unsealed crop (`referenceHeights`, the same 16 levels), and the edge then runs on
  // past the border as the generator's does (`relaxEdges`, land/levels.ts: a thin band standing over
  // the land inside goes, land that rises toward the edge keeps rising, so a real cliff at the border
  // stays as geography); the interior is untouched.
  const heights = Uint8Array.from(fx.referenceHeights);
  for (let i = 0; i < heights.length; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (heights[i] !== sealed[i] && x > 0 && y > 0 && x < W - 1 && y < H - 1) throw new Error(`${item.id}: the survey changed the interior at ${x},${y}`);
  }
  relaxEdges(heights, W, H);
  // a source the survey put just inside the edge (its inflows) would pour straight off the map: the
  // edge beside it gets the generator's lip (item 27, water/edgeLip.ts), never a wall along the edge
  const heads = new Uint8Array(W * H);
  for (const s of fx.waterSources) heads[s.y * W + s.x] = 1;
  for (const s of fx.waterSources) {
    // (and never above the height cap: a lip two levels over a source at 15 or 16 would make the map
    // tall, which Timberborn's map editor can't raise land to; such a source keeps its edge as it is)
    if (Math.min(s.x, s.y, W - 1 - s.x, H - 1 - s.y) > EDGE_SOURCE_REACH || heights[s.y * W + s.x] + 2 > EDITOR_LEVEL) continue;
    edgeLip(heights, W, H, { row: [s.y * W + s.x], surface: heights[s.y * W + s.x] + 1, keep: heads, reach: EDGE_LIP_REACH });
  }
  if (heights.some((v) => v > EDITOR_LEVEL)) throw new Error(`${item.id}: land above level ${EDITOR_LEVEL}`);
  const name = placeName(item);
  const fam = FAMILIES[item.family];
  if (!fam) throw new Error(`${item.id}: no family text for ${item.family}`);
  const kinds: Record<"bushes" | "pines" | "birches" | "oaks" | "deadPines" | "ruins", number[]> = { bushes: [], pines: [], birches: [], oaks: [], deadPines: [], ruins: [] };
  let starts = 0;
  let sources = 0;
  for (const e of fx.entities) {
    const comps = e.Components as Record<string, Record<string, unknown>>;
    const c = comps.BlockObject.Coordinates as { X: number; Y: number; Z: number };
    const i = c.Y * W + c.X;
    if (c.Z !== sealed[i]) throw new Error(`${item.id}: ${String(e.Template)} at ${c.X},${c.Y} stands at ${c.Z}, ground ${sealed[i]}`);
    switch (e.Template) {
      case "WaterSource":
        sources++;
        break;
      case "StartingLocation":
        starts++;
        if (c.X !== fx.start.x || c.Y !== fx.start.y) throw new Error(`${item.id}: start entity and start differ`);
        break;
      case "BlueberryBush":
        kinds.bushes.push(i);
        break;
      case "Pine":
        (comps.LivingNaturalResource ? kinds.deadPines : kinds.pines).push(i);
        break;
      case "Birch":
        kinds.birches.push(i);
        break;
      case "Oak":
        kinds.oaks.push(i);
        break;
      case "RuinColumnH2":
        kinds.ruins.push(i);
        break;
      default:
        throw new Error(`${item.id}: unexpected object ${String(e.Template)}`);
    }
  }
  if (starts !== 1) throw new Error(`${item.id}: ${starts} starts`);
  if (sources !== fx.waterSources.length) throw new Error(`${item.id}: ${sources} source objects, ${fx.waterSources.length} sources`);
  const place: PlaceData = {
    format: PLACE_FORMAT,
    id: slug(name),
    name,
    family: item.family,
    familyName: fam.name,
    plays: fam.plays,
    metres: item.metres,
    W,
    H,
    heights: encodeHeights(heights),
    sources: fx.waterSources.map((s) => [s.x, s.y, s.strength]),
    start: [fx.start.x, fx.start.y],
    bushes: encodeTiles(kinds.bushes),
    pines: encodeTiles(kinds.pines),
    birches: encodeTiles(kinds.birches),
    oaks: encodeTiles(kinds.oaks),
    deadPines: encodeTiles(kinds.deadPines),
    deadBirches: encodeTiles([]),
    deadOaks: encodeTiles([]),
    ruins: encodeTiles(kinds.ruins),
  };
  // the builders write exactly the survey's objects (ids aside)
  // (an object on a tile the edge has run on past stands on the new ground)
  const plain = (o: unknown) => JSON.parse(JSON.stringify(o));
  const onNewGround = (o: Record<string, unknown>) => {
    const e = plain(o) as { Components: { BlockObject: { Coordinates: { X: number; Y: number; Z: number } } } };
    const c = e.Components.BlockObject.Coordinates;
    c.Z = heights[c.Y * W + c.X];
    return e as Record<string, unknown>;
  };
  const key = (e: Record<string, unknown>) => {
    const { Id: _id, ...rest } = e;
    return JSON.stringify(rest);
  };
  const ours = new Set(placeEntities(place, decodeHeights(place.heights)).map((s) => key(JSON.parse(stringify(entityJson(s))))));
  for (const e of fx.entities) {
    if (!ours.has(key(onNewGround(e)))) throw new Error(`${item.id}: ${String(e.Template)} ${JSON.stringify(e.Components)} is not what the place writes`);
  }
  if (ours.size !== fx.entities.length) throw new Error(`${item.id}: ${ours.size} objects written, ${fx.entities.length} in the survey`);
  return place;
}

/** The card's picture: the shaded map with its water, north up, CARD pixels square (the file's
 *  thumbnail at the card's size). */
function cardJpeg(heights: Uint8Array, W: number, H: number, water: ArrayLike<number>): Uint8Array {
  return encodeJpeg({ data: thumbnailRgba(heights, W, H, water, CARD, CARD), width: CARD, height: CARD }, CARD_QUALITY).data;
}

/** The place with its start at corner `at`: the trees, bushes and ruins under it and at its door
 *  make room for it (src/core/places/start.ts `startTiles`). */
function withStart(place: PlaceData, at: [number, number]): PlaceData {
  const under = new Set(startTiles(place.W, at));
  const off = (gaps: number[]) => encodeTiles(decodeTiles(gaps).filter((i) => !under.has(i)));
  return { ...place, start: at, bushes: off(place.bushes), pines: off(place.pines), birches: off(place.birches), oaks: off(place.oaks), deadPines: off(place.deadPines), deadBirches: off(place.deadBirches), deadOaks: off(place.deadOaks), ruins: off(place.ruins) };
}

const counts = (c: CheckResult) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate;

/** `--times`: a line under each place of where its run's time went: each step of `runPlace` in turn, and over the
 *  whole place the builds it checked (`buildChecked`), the settles they made (the rest came from `settles`) and the
 *  time in their builds and in their checks. Information only: the files are the same. */
const timesOn = process.argv.includes("--times");
/** The settle cache, counting the settles it did not hold (each one made). */
class CountedSettles extends SettleCache {
  made = 0;
  override get(m: Parameters<SettleCache["get"]>[0]) {
    const w = super.get(m);
    if (!w) this.made++;
    return w;
  }
}
const spent = { steps: [] as [string, number][], at: 0, builds: 0, build: 0, check: 0 };
/** Ends the step of the place's run named `name` (`--times`). */
function lap(name: string): void {
  const now = performance.now();
  spent.steps.push([name, now - spent.at]);
  spent.at = now;
}
function timesLine(): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const steps = spent.steps.filter(([, ms]) => ms >= 50).map(([k, ms]) => `${k} ${s(ms)}`);
  return `   times: ${steps.join(", ")}; ${spent.builds} builds checked, ${settles.made} settles made, ${s(spent.build)} building, ${s(spent.check)} checking`;
}

/** Not a check: what `buildChecked` adds to a place's failures under the pool rule when `start.water` itself fails, the
 *  start with no water within its walk at all, where `start.water` alone also means water that is not a pool (#1218). */
const NO_WATER = "start.no_water";
/** The pool rule (#1218): while set, `start.water` fails for a start whose water within its walk is not a pool
 *  (`startPool`), so every step that looks for the start's water looks for a pool, and the start's pool on real water
 *  and the start moved with its spring are tried. A place is built without it first, as before; only one whose start
 *  then has no pool is built again with it (`runPlace`), so a place whose start has a pool keeps its build. */
let poolRule = false;
/** A place built and checked: the export profile (`v`, what the editor's export asks) and every
 *  check of the generate profile (`strict`), with the failures of each that count. */
/** The settles of the place being run (`runPlace`): its candidates (a start moved, plants moved or planted, a spring
 *  added) are each built and checked, and those whose objects alone differ leave the water as it was, so its settle is
 *  made once, not once a candidate (Katherine Gorge: 44 builds of 7.6 s each). */
let settles = new CountedSettles();
function buildChecked(place: PlaceData) {
  const t = performance.now();
  const built = buildPlace(place, settles);
  const t1 = performance.now();
  const v = validatePlace(built);
  const strict = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
  spent.builds++;
  spent.build += t1 - t;
  spent.check += performance.now() - t1;
  const strictFails = strict.report.checks.filter(counts).map((c) => c.id);
  // under the pool rule `start.water` fails for a start whose water is not a pool the first pump draws from within its
  // walk (`startPool`), and `NO_WATER` stands besides where the check itself fails (no water within the walk at all, not
  // even a thin sheet), so no step takes a thin sheet from a start without a pool
  if (!poolRule) return { built, v, strict, blocking: v.report.checks.filter(counts), strictFails };
  if (!strictFails.includes("start.water")) {
    if (!startPool(place, built.heights, built.settle.depth, built.settle.contamination, { thin: FILM_DEPTH, thinShare: FILM_THIN_SHARE })) strictFails.push("start.water");
  } else strictFails.push(NO_WATER);
  return { built, v, strict, blocking: v.report.checks.filter(counts), strictFails };
}

type Checked = ReturnType<typeof buildChecked>;
const checkValue = (s: Checked["strict"], id: string) => Number(s.report.checks.find((c) => c.id === id)?.value ?? 0);
const checkLimit = (s: Checked["strict"], id: string) => Number(s.report.checks.find((c) => c.id === id)?.limit ?? 0);

/** Fast trees (pines, or birches where the place leans to them: `start.wood_fast` counts only those, D515) on the
 *  free moist ground nearest the start by `walk`, within WOOD_WALK, in rounds, each built and checked, until the
 *  start has `bar`'s logs within 20 tiles' walk (`start.wood`) and 40 (`start.wood_floor`) and, while `fast` says
 *  so, the fast share. Objects only (D331). */
function growFastWood(p: PlaceData, r: Checked, walk: ArrayLike<number>, bar: { wood: number; floor: number }, fast: (r: Checked) => boolean) {
  const g = { moisture: r.strict.analysis!.moisture, contamination: r.strict.analysis!.soilContamination, depth: r.built.settle.depth };
  const near = r.strict.analysis!.startDistance;
  const short = (c: Checked) => Math.max(bar.wood - checkValue(c.strict, "start.wood"), bar.floor - checkValue(c.strict, "start.wood_floor"));
  const species = startWoodSpecies(p);
  const logs = LOGS_PER_TREE_SPECIES[species];
  let planted = 0;
  for (let round = 0; round < 6 && (short(r) > 0 || fast(r)); round++) {
    const share = checkLimit(r.strict, "start.wood_fast");
    const fastNeed = Math.ceil(((share - checkValue(r.strict, "start.wood_fast")) * Math.max(bar.wood, checkValue(r.strict, "start.wood"))) / (1 - share));
    const o = startWood(p, g, near, walk, species, Math.ceil(Math.max(short(r), fastNeed, 1) / logs), WOOD_WALK);
    if (!o.planted) break;
    p = o.place;
    planted += o.planted;
    r = buildChecked(p);
  }
  return { place: p, r, planted, kind: species === "Birch" ? "birches" : "pines" };
}

// ------------------------------------------------------------------------------------------ run

const check = process.argv.includes("--check");
/** `--ruins`: lay only the places' ruins again, on the committed places (`runPlace`). */
const relayRuins = process.argv.includes("--ruins");
/** `--water`: each place's line of tools/lib/placeWater.ts's measure (its water as built against its water model
 *  settled again by the game's rules, as the first edit settles it), a withheld place's too. Information only. */
const waterMeasure = process.argv.includes("--water");
/** The water rules the places are built under: the game's (D311); `--rules port` builds them as before the conversion,
 *  for a comparison. */
const rules = arg("rules") === "port" ? "port" : "game";
setPlaceRules(rules);
function waterLine(b: ReturnType<typeof buildPlace>, place: PlaceData): string {
  const s = settleFile(b.file);
  const { W, H } = b.model;
  const c = compareWater(b.settle.depth, s.water.depth, W, H);
  const before = startFails(b.file, b.model, b.settle);
  const after = startFails(b.file, s.model, s.water);
  // under the game's rules (`--rules game`): the bodies the port's build of the same place showed and this one does not,
  // and the sheets on floor 0 (water 0.1 deep or less where the edge's spill threshold holds it, D303)
  const port = rules === "game" ? compareWater(buildPlace(place, undefined, "port").settle.depth, b.settle.depth, W, H) : null;
  let floor0 = 0;
  for (let i = 0; i < W * H; i++) if (b.model.floor[i] === 0 && b.settle.depth[i] > WET && b.settle.depth[i] <= 0.105) floor0++;
  const json = { id: place.id, size: W, start: place.start, wet: c.wetOpened, resettled: c.wetSettled, lost: c.lost, startFails: before, startFailsResettled: after, floor0, port: port && { wet: port.wetOpened, bodies: port.bodies, lost: port.lost } };
  return `   water: wet ${c.wetOpened} → ${c.wetSettled} (${(c.change * 100).toFixed(1)} %), ${c.lost.length} of ${c.bodies} bodies of ${BODY}+ lost${c.lost.length ? ` (${c.lost.map((l) => `${l.size}→${l.wet}`).join(", ")})` : ""}, start ${before.join(",") || "-"} → ${after.join(",") || "-"}` + (port ? `; port ${port.wetOpened} wet, ${port.lost.length} of its ${port.bodies} bodies gone; floor-0 sheet ${floor0}` : "") + `\n   water-json ${JSON.stringify(json)}`;
}
/** The places' observed water (D271; tools/places-real-water.ts): by library id, the tiles over real water. */
const REAL_WATER = JSON.parse(readFileSync(join(LIBRARY, "real-water.json"), "utf8")) as { places: Record<string, { W: number; tiles: number[] }> };
function realOf(libraryId: string, W: number, H: number): Uint8Array {
  const r = REAL_WATER.places[libraryId];
  if (!r || r.W !== W) throw new Error(`${libraryId}: no observed water in ${join(LIBRARY, "real-water.json")} (run tools/places-real-water.ts)`);
  return realMask(W, H, decodeGaps(r.tiles));
}

/** The place with its basins cut where the real water lies, and a bed through each film above floor 0 that no real
 *  water lies under (tools/lib/placeBasins.ts), and its log note. */
function basinsFor(libraryId: string, place: PlaceData): { place: PlaceData; note: string; beds: number[][] } {
  const beds: number[][] = [];
  const real = realOf(libraryId, place.W, place.H);
  const port = buildPlace(place, undefined, "port").settle.depth;
  let game = buildPlace(place, undefined, "game");
  const r = cutBasins(decodeHeights(place.heights), place.W, place.H, port, game.settle.depth, game.model.floor, real, FILM_BEFORE);
  const notes: string[] = [];
  for (const b of r.basins) notes.push(`${b.kind} ${b.size} at ${b.at.join(",")} over ${b.real} real-water tiles ${b.cut ? `cut ${b.cut} tiles` : b.kind === "lost" ? "goes" : "not cut"}`);
  let heights = r.heights;
  if (r.basins.some((b) => b.cut)) {
    place = { ...place, heights: encodeHeights(heights) };
    game = buildPlace(place, undefined, "game");
  }
  // a body of real water the game's water covers only as a film gets the same basin (planning, #236: Yamanaka)
  const rf = realFilms(heights, place.W, place.H, game.settle.depth, real);
  for (const b of rf.basins) notes.push(`real water ${b.size} at ${b.at.join(",")} under a film ${b.cut ? `cut ${b.cut} tiles` : "not cut (floor 0 or no flat inside its rim)"}`);
  if (rf.basins.some((b) => b.cut)) {
    heights = rf.heights;
    place = { ...place, heights: encodeHeights(heights) };
    game = buildPlace(place, undefined, "game");
  }
  // a film above floor 0 the real water does not lie under gets a bed to where its water leaves it (D521); a bed that
  // would put a source in another's flow (`water.source_in_flow`, whose list never grows) goes out onto dry ground
  // instead, and where none is left the film stays (the check refuses it)
  const inFlow = (p: PlaceData) => flaggedSources(p).flagged.length;
  const flowed = inFlow(place);
  // (a bed after which the water no longer settles is not cut: `water.settles`, whose list never grows)
  const settled = game.settle.settled;
  for (let round = 0; round < BED_ROUNDS; round++) {
    const left = films(game.settle.depth, game.model.floor, place.W, place.H, FILM_BEFORE).filter((f) => f.floor0 * 2 <= f.tiles.length);
    if (!left.length) break;
    let any = false;
    for (const f of left) {
      const seed = hashString(`${seedKey(place)}:${round}`);
      let tried = Uint8Array.from(heights);
      let bed = cutBed(tried, place.W, place.H, f.tiles, game.settle.depth, place.sources, seed);
      if (bed.length && inFlow({ ...place, heights: encodeHeights(tried) }) > flowed) {
        tried = Uint8Array.from(heights);
        bed = cutBed(tried, place.W, place.H, f.tiles, game.settle.depth, place.sources, seed, true);
        if (bed.length && inFlow({ ...place, heights: encodeHeights(tried) }) > flowed) bed = [];
      }
      let unsettled = false;
      if (bed.length && settled && !buildPlace({ ...place, heights: encodeHeights(tried) }, undefined, "game").settle.settled) {
        bed = [];
        unsettled = true;
      }
      notes.push(`film ${f.tiles.length} at ${f.at.join(",")} ${bed.length ? `bed of ${bed.length} tiles` : unsettled ? "has no bed the water settles with" : "has no bed that keeps the sources at their heads"}`);
      if (bed.length) {
        heights.set(tried);
        beds.push(bed);
        any = true;
      }
    }
    if (!any) break;
    place = { ...place, heights: encodeHeights(heights) };
    game = buildPlace(place, undefined, "game");
  }
  return { place, note: notes.length ? `  water mends: ${notes.join("; ")}` : "", beds };
}

/** The films the land is mended for before the springs' search: thin on every tile, as before D(new-films). The films the
 *  check's share finds besides (`FILM_THIN_SHARE`) are left to the springs' search, and those it leaves get their mend
 *  after it (`filmsAfter`), so a film the springs take away costs the land nothing. */
const FILM_BEFORE = 1;

/** The places that keep today's build (dev's: the committed place, its ruins laid again as `--ruins` lays them, which
 *  gives today's files), by planning's rulings of 2026-11-16 on D(new-films): a place whose film above floor 0 (the
 *  check's, `FILM_THIN_SHARE`) the springs' search leaves and no mend after it (`filmsAfter`) reaches; one whose search
 *  ends with less water over real water than today's; and one whose search puts more water over real dry land than
 *  today's that its start does not need. Every run prints each by name with its reason, and the check passes the film
 *  today's build has; any other place with a film fails. The list never grows past the places these rulings named. */
const TODAY_KEPT: Record<string, string> = {
  "waimakariri-river": "film 363 at 217,230: its bed costs start.farmland and start.forester",
  "na-pali-coast": "film 519 at 46,1: its bed gives water.outflow and costs real water; film 2199 at 2,62 over the real sea: its basin gives water.outflow and a source in another's flow",
  gullfoss: "film 435 at 112,25: its bed costs start.food and real water",
  "taklimakan-kunlun-fan": "film 1506 at 239,75: its bed costs start.farmland and start.forester; films 420 and 439: their beds leave the water unsettled",
  "milford-sound": "film 359 at 191,121: its bed grows the water over real dry land",
  "mount-fuji": "film 138 at 28,22: its bed leaves the water unsettled and costs start.food",
  "victoria-falls": "film 1353 at 35,86: its basin gives water.outflow and costs real water",
  "ilulissat-icefjord": "film 119 at 19,28: its basin costs real water",
  "yosemite-valley": "film 104 at 62,1: its bed costs the real water",
  paricutin: "its springs' search ends with less water over real water than today's (5 → 1)",
  "western-ghats-mahabaleshwar": "its one spring by the start puts 550 more tiles over real dry land; the start had water 15.5 tiles' walk away today",
  altiplano: "its one spring by the start (2,54) puts 299 more tiles over real dry land than today's (697 → 996) with the start's water where it was (8.2 tiles' walk); without it the turns leave the start 19.8 tiles from water",
  "roaring-river-fan": "its search puts 138 more tiles over real dry land than today's (602 → 740) and takes the start's water from 1.4 to 10.2 tiles' walk; the start's spring that held it nearer (70,57) leaves it at 4",
};

/** The films above floor 0 the searched springs leave (D(new-films): thin on 90 % of their tiles) mended as `basinsFor`
 *  mends a film: a basin where real water lies under it, else a bed to where its water leaves its flat; each kept only
 *  where the water still settles, nothing the place passed then fails and no source lands in another's flow. */
function filmsAfter(libraryId: string, place: PlaceData, had: Checked): { place: PlaceData; r: Checked; note: string } {
  const real = realOf(libraryId, place.W, place.H);
  const flow = flaggedSources(place).flagged.length;
  const { W, H } = place;
  let cur = place;
  let r = had;
  let m = realMeasure(had.built.settle.depth, real);
  const notes: string[] = [];
  for (let round = 0; round < BED_ROUNDS; round++) {
    const left = films(r.built.settle.depth, r.built.model.floor, W, H).filter((f) => f.floor0 * 2 <= f.tiles.length);
    if (!left.length) break;
    let any = false;
    for (const f of left) {
      const h = decodeHeights(cur.heights);
      const fb = filmBasin(h, W, H, f.tiles, real);
      let tried = fb.heights;
      let what = `basin of ${fb.basin.cut} tiles`;
      if (!fb.basin.cut) {
        tried = Uint8Array.from(h);
        const bed = cutBed(tried, W, H, f.tiles, r.built.settle.depth, cur.sources, hashString(`${seedKey(cur)}:after:${round}`));
        what = `bed of ${bed.length} tiles`;
        if (!bed.length) {
          notes.push(`film ${f.tiles.length} at ${f.at.join(",")} has no bed`);
          continue;
        }
      }
      const cand = { ...cur, heights: encodeHeights(tried) };
      const c = buildChecked(cand);
      const worse = c.strictFails.filter((id) => !r.strictFails.includes(id));
      // (and the water over real water held, the water over real dry land not grown: D(new-films)'s conditions)
      const mm = realMeasure(c.built.settle.depth, real);
      const measure = [...(mm.real < m.real ? [`real water ${m.real} → ${mm.real}`] : []), ...(mm.dry > m.dry ? [`real dry land ${m.dry} → ${mm.dry}`] : [])];
      if ((r.built.settle.settled && !c.built.settle.settled) || worse.length || measure.length || flaggedSources(cand).flagged.length > flow) {
        notes.push(`film ${f.tiles.length} at ${f.at.join(",")}: its ${what} refused (${[...worse, ...measure, ...(c.built.settle.settled ? [] : ["the water would not settle"]), ...(flaggedSources(cand).flagged.length > flow ? ["a source in another's flow"] : [])].join(", ")})`);
        continue;
      }
      cur = cand;
      r = c;
      m = mm;
      any = true;
      notes.push(`film ${f.tiles.length} at ${f.at.join(",")} ${what}`);
    }
    if (!any) break;
  }
  return { place: cur, r, note: notes.length ? `  films after the springs: ${notes.join("; ")}` : "" };
}

/** The rounds of beds a place gets: a bed can carry its water on to a flat below, where the next round's bed runs on. */
const BED_ROUNDS = 8;

/** What a place's beds and springs are seeded from: the id it had before D522 took "Near" out of its name
 *  ("near-glencoe"), so the rename moves no land or water. */
const seedKey = (p: PlaceData) => `near-${p.id}`;

const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The place with its springs searched (tools/lib/placeFeeds.ts), and its log note. */
function feedsFor(libraryId: string, place: PlaceData): { place: PlaceData; note: string } {
  const real = realOf(libraryId, place.W, place.H);
  const base = buildChecked(place);
  const baseFlow = flaggedSources(place).flagged.length;
  const filmTiles = (b: ReturnType<typeof buildPlace>, p: PlaceData) =>
    films(b.settle.depth, b.model.floor, p.W, p.H)
      .filter((f) => f.floor0 * 2 <= f.tiles.length)
      .reduce((n, f) => n + f.tiles.length, 0);
  const baseFilm = filmTiles(base.built, place);
  const keep = (p: PlaceData) => {
    const r = buildChecked(p);
    // (the start's water first: a start that loses its water is not a mend, D(new-films))
    const worse = r.strictFails.filter((id) => !base.strictFails.includes(id)).sort((x, y) => Number(y === "start.water") - Number(x === "start.water"));
    const filmed = filmTiles(r.built, p) > baseFilm;
    const flow = flaggedSources(p).flagged.length;
    // (a start that had water in reach, even past the check's walk, and has none is not a mend either)
    const lost = waterIn(base.strict) !== null && waterIn(r.strict) === null ? ["the start's water lost"] : [];
    const why = [...lost, ...worse, ...(flow > baseFlow ? [`sources in a flow ${baseFlow} → ${flow}`] : []), ...(filmed ? ["film above floor 0"] : [])];
    return why.length ? why.join(", ") : null;
  };
  const settle = (p: PlaceData) => buildPlace(p, settles).settle.depth;
  // D245's water floor for a place with no real water: the springs by its start a lone spring may be (src/core/places/spring.ts),
  // placed on the place's land with no water
  // (the one spring is the start's, planning's ruling of 2026-11-16: the start then has water within its walk, a spring
  // above the start first, `aboveStart`)
  const dryLand = buildPlace({ ...place, sources: [] }, settles);
  const springs = () => {
    const dry = { ...place, sources: [] as [number, number, number][] };
    const at = (above: boolean) => SPRING_TRIES.flatMap(([rule, tries]) => placeSprings(dry, dryLand.heights, dryLand.settle.depth, { rule, tries, key: seedKey(place), above }));
    const seen = new Set<string>();
    return [...at(true), ...at(false)].filter((g) => {
      const k = JSON.stringify(g);
      return !seen.has(k) && !!seen.add(k);
    });
  };
  // (served: water within the start's walk, and no farther than before the search where it had some within it: no
  // start worse served, planning's ruling of 2026-11-16)
  const baseWalk = base.strictFails.includes("start.water") ? null : waterIn(base.strict);
  const served = (p: PlaceData) => {
    const c = buildChecked(p);
    const w = waterIn(c.strict);
    return !c.strictFails.includes("start.water") && (baseWalk === null || (w !== null && w <= baseWalk)) && poolOf(p) !== null;
  };
  // (the start's spring nearest the start first: the walk to its pool)
  const rank = (p: PlaceData) => poolOf(p)?.walk ?? Infinity;
  const above = (s: readonly [number, number, number][]) => s.every(([x, y]) => aboveStart(place, dryLand.heights, y * place.W + x));
  let r = searchFeeds(place, real, settle, keep, { springs, served, above, rank });
  // no place ends with more water over real dry land (planning): one whose search did is searched again with no step
  // raising it
  const again = r.after.dry > r.before.dry ? ` (searched again: real dry land ${r.before.dry} → ${r.after.dry} the first time)` : "";
  if (again) r = searchFeeds(place, real, settle, keep, { dryNotUp: true, springs, served, above, rank });
  // the floor-0 sheet is information (planning), but a search whose sheet over real dry land grew while the water over
  // real dry land did not fall keeps the springs the place had
  const sheetDry = (p: PlaceData) => {
    const b = buildPlace(p, settles);
    return floor0Sheet(b.settle.depth, b.model.floor, p.W, p.H, real, FILM_DEPTH, FILM_TILES).dry;
  };
  if (r.steps.length && r.after.dry >= r.before.dry) {
    const was = sheetDry(place);
    const now = sheetDry(r.place);
    if (now > was) return { place, note: `  springs kept: the search's sheet over real dry land ${was} → ${now} with no fall over real dry land (${r.before.dry} → ${r.after.dry})` };
  }
  const at = (s: [number, number, number] | null) => (s ? `${s[0]},${s[1]}:${s[2].toFixed(2)}` : "gone");
  const list = (ss: readonly [number, number, number][]) => ss.map((s) => at(s)).join(" ");
  const step = (s: FeedStep) => (s.kind === "turn" ? `${at(s.from)} → ${at(s.to)}` : s.kind === "one spring" ? `one spring (D245's water floor): ${list(s.now!)} for all ${s.was!.length}` : `together gone: ${list(s.was!.filter((x) => !s.now!.some((y) => y[0] === x[0] && y[1] === x[1])))}`);
  // the refusals that only a source in another's flow stood in the way of: the best of each move, by the measure
  const flowOnly = r.refused.filter((x) => x.source >= 0 && x.why.split(", ").every((w) => w === "water.source_in_flow" || w.startsWith("sources in a flow")));
  const fmt = (ss: readonly [number, number, number][]) => `${ss.length} (${ss.map((s) => s[2].toFixed(2)).join(" ")})`;
  // the measure's parts (D(new-films)): the water over real dry land as the floor-0 sheet and everything else
  const parts = (p: PlaceData) => {
    const b = buildPlace(p, settles);
    return realParts(b.settle.depth, b.model.floor, p.W, p.H, real);
  };
  const p0 = parts(place);
  const p1 = r.steps.length ? parts(r.place) : p0;
  // every place whose springs change shows its start's numbers before and after, its water in reach first
  const startLine = r.steps.length ? `; start ${startNumbers(base.strict)} → ${startNumbers(buildChecked(r.place).strict)}` : "";
  const note =
    `  springs searched: real water ${r.before.real} → ${r.after.real}, real dry land ${r.before.dry} → ${r.after.dry} (floor-0 sheet ${p0.sheet} → ${p1.sheet}, the rest ${p0.rest} → ${p1.rest}); sources ${fmt(place.sources)} → ${fmt(r.place.sources)}` +
    (r.steps.length ? ` [${r.steps.map(step).join("; ")}]` : "") +
    startLine +
    again +
    (flowOnly.length ? `; better by the measure but for a source in another's flow: ${flowOnly.map((x) => `${at(x.from)} → ${at(x.to)} (real water ${x.real}, real dry land ${x.dry}; ${x.why})`).join("; ")}` : "");
  return { place: r.place, note };
}

// No place ships with no pumpable water within 20 tiles of its start (D(new-films), planning's ruling of 2026-11-16): a
// start still without it gets the start's spring, whatever its sealed land had: a spring by it (above it first) whose
// water stands as a pool the start walks to and pumps from with the first pump (`startPool`), no film above floor 0
// and nothing else it passed then failing; the fewest failures win, then the nearest pool
function startSpringFor(at: PlaceData, r0: Checked) {
  const had = new Set(r0.strictFails);
  const filmed = (b: ReturnType<typeof buildPlace>) => films(b.settle.depth, b.model.floor, at.W, at.H).filter((f) => f.floor0 * 2 <= f.tiles.length).reduce((n, f) => n + f.tiles.length, 0);
  const film0 = filmed(r0.built);
  let best: { add: [number, number, number][]; r: Checked; score: number; walk: number } | null = null;
  const ok: { add: [number, number, number][]; score: number; walk: number }[] = [];
  const seen = new Set<string>();
  for (const above of [true, false])
    for (const [rule, tries] of SPRING_TRIES)
      for (const add of placeSprings(at, r0.built.heights, r0.built.settle.depth, { rule, tries, key: seedKey(at), above })) {
        const k = JSON.stringify(add);
        if (seen.has(k)) continue;
        seen.add(k);
        const cand = { ...at, sources: [...at.sources, ...add] };
        const r = buildChecked(cand);
        if (r.strictFails.includes("start.water") || r.strictFails.some((id) => !had.has(id) && !FREE.has(id)) || filmed(r.built) > film0) continue;
        const pool = poolOf(cand);
        if (!pool) continue;
        const sc = startScore(r.strictFails);
        ok.push({ add, score: sc, walk: pool.walk });
        if (best && (sc > best.score || (sc === best.score && pool.walk >= best.walk))) continue;
        best = { add, r, score: sc, walk: pool.walk };
      }
  // (every site that passes, the best first: the fewest failures, then the nearest pool, then the order tried)
  const all = ok.map((c, k) => ({ ...c, k })).sort((a, b) => a.score - b.score || a.walk - b.walk || a.k - b.k);
  const note = `  the start's spring for its water: ${best ? `${best.add.map((s) => `${s[0]},${s[1]}`).join(" ")}, a pool ${Math.round(best.walk * 10) / 10} tiles' walk away` : `none of ${seen.size} places gives a pool the start pumps from`}`;
  return { best, note, all };
}

/** The dry spots by the start tried for a start's spring of their own (`springSpotFor`), those whose land fits first. */
const SPRING_SPOTS = 6;

/**
 * A start whose water is a sheet no spring by it lifts into a pool (its spring's water joins the sheet), moved with its
 * spring (#1218): the dry spots nearest it whose land can give the start's land floors (`placeStartSpots`, no shore
 * asked), each built and checked, where it fails nothing the start passed but its water, then given the start's spring
 * there (`startSpringFor`); the first spot whose spring stands as a pool wins. Objects only.
 */
function springSpotFor(place: PlaceData, r0: Checked): { best: PlaceData | null; note: string } {
  const had = new Set(r0.strictFails);
  const land = { moisture: r0.strict.analysis!.moisture, reach: checkLimit(r0.strict, "start.reach"), moist: checkLimit(r0.strict, "start.farmland") + checkLimit(r0.strict, "start.forester"), within: FARM_WALK };
  const spots = placeStartSpots(place, r0.built.heights, r0.built.settle.depth, r0.built.settle.contamination, { shore: false, limit: SPRING_SPOTS, land });
  const tried: string[] = [];
  for (const at of spots) {
    // the start moved, its wood grown by it where it falls short (objects only)
    let cand = withStart(place, at);
    let r = buildChecked(cand);
    if (r.strictFails.some((id) => WOOD_CHECKS.includes(id) && !had.has(id))) {
      const walkField = startWalkField(r.built.heights, cand.W, cand.H, placeEntities(cand, r.built.heights), { x: at[0] + 1, y: at[1] + 1 });
      const g = growFastWood(cand, r, walkField, { wood: checkLimit(r.strict, "start.wood"), floor: checkLimit(r.strict, "start.wood_floor") }, (c) => c.strictFails.includes("start.wood_fast"));
      cand = g.place;
      r = g.r;
    }
    // (no water there is what its spring mends: `NO_WATER`; its berries are planted after)
    const worse = r.strictFails.filter((id) => !had.has(id) && id !== "start.food" && id !== NO_WATER);
    if (worse.length) {
      tried.push(`${at.join(",")}: ${worse.join(",")}`);
      continue;
    }
    // its spring, then its berries on the water the spring leaves
    const ss = startSpringFor(cand, r);
    if (!ss.best) {
      tried.push(`${at.join(",")}: no spring by it stands as a pool`);
      continue;
    }
    let done = { ...cand, sources: [...cand.sources, ...ss.best.add] };
    let rd = ss.best.r;
    if (rd.strictFails.includes("start.food") && !had.has("start.food")) {
      const b = startBerries(done, rd);
      done = b.place;
      rd = b.r;
    }
    const left = rd.strictFails.filter((id) => !had.has(id));
    if (left.length) {
      tried.push(`${at.join(",")}: ${left.join(",")} with its spring`);
      continue;
    }
    return { best: done, note: `  the start moved to ${at.join(",")} with its spring at ${ss.best.add.map((s) => `${s[0]},${s[1]}`).join(" ")}, a pool ${Math.round(ss.best.walk * 10) / 10} tiles' walk away` };
  }
  return { best: null, note: `  the start moved with its spring: none of ${spots.length} spots (${tried.join("; ")})` };
}

/** The bushes the `start.food` check's own fix plants by the start (objects only), kept where the start then has more
 *  living berries and nothing else fails that did not. */
function startBerries(place: PlaceData, r: Checked): { place: PlaceData; r: Checked } {
  const food = r.strict.report.checks.find((c) => c.id === "start.food");
  const tiles = (food?.fix ?? []).flatMap((f) => (f.op === "placeEntity" && f.params.template === "BlueberryBush" ? [f.params.y * place.W + f.params.x] : []));
  if (!tiles.length) return { place, r };
  const withBushes = { ...place, bushes: encodeTiles([...new Set([...decodeTiles(place.bushes), ...tiles])].sort((a, b) => a - b)) };
  const c = buildChecked(withBushes);
  const after = c.strict.report.checks.find((x) => x.id === "start.food");
  return after && Number(after.value ?? 0) > Number(food?.value ?? 0) && !c.strictFails.some((id) => !r.strictFails.includes(id)) ? { place: withBushes, r: c } : { place, r };
}

/** The checks a start's move, spring or pool may newly fail: the start's wood, berries and land are information for a real
 *  place (D331), and its water is what they look for. */
const FREE = new Set(["start.wood", "start.food", "start.water", NO_WATER, ...START_LAND]);
/** A start's failures ranked, the fewest worst first: water, then the land floors, then the starting-logs floor, then the
 *  berries, then the wood (a spot or spring that costs the start its berries ranks below one that keeps them). */
const startScore = (fails: string[]) =>
  (fails.includes(NO_WATER) ? 64 : 0) + (fails.includes("start.water") ? 32 : 0) + (fails.some((id) => LAND_FLOORS.includes(id)) ? 16 : 0) + (fails.includes("start.wood_floor") ? 4 : 0) + (fails.includes("start.food") ? 2 : 0) + (fails.includes("start.wood") ? 1 : 0);

/** A squared straight distance (exact for tiles; compared, never rooted). */
const dist2 = (dx: number, dy: number) => dx * dx + dy * dy;
/** How far from the start's middle (tiles, straight) a body of real water is looked at for the start's pool (#1218). */
const REAL_POOL_REACH = 64;
/** The bodies of real water tried for the start's pool, the nearest first. */
const REAL_POOL_BODIES = 3;
/** The strengths a source at a body of real water's head is tried at: the official maps' weakest first (D171's range). */
const REAL_HEAD_STRENGTHS = [FEED_MIN, 1];
/** The spots by a body of real water tried for the start, the nearest the body first. */
const REAL_POOL_SPOTS = 24;

/**
 * The start's pool on real water (#1218, D(new-films): real water first): the bodies of real water (the observed-water
 * mask, 30 tiles or more, `BODY`) within `REAL_POOL_REACH` of the start, the nearest first, each tried
 * as it is, with its bed cut one level down where the survey's land still stands (`cutLevel`'s rule: real-water tiles
 * inside the flat's own rim, never twice), and with a source at its head where no source stands in it (the tile nearest
 * its middle, at `REAL_HEAD_STRENGTHS`; sources only at heads, D171). On each, the start where it is and then the spots
 * within 20 tiles' walk of a shore nearest the body (`placeStartSpots`), each built and checked, its wood and berries
 * grown where they fall short (objects only). Kept where the start's pool (`startPool`) lies in that body, nothing the
 * start passed then fails (its wood, berries and land floors included), the water still settles, no film above floor 0 grows, no source lands in
 * another's flow and the water over real water is held. The first body and way that gives one wins, its best spot by
 * the fewest failures, then the nearest pool. `surveyed`: the place's land before any bed or basin was cut.
 */
function realPoolFor(libraryId: string, place: PlaceData, surveyed: Uint8Array, r0: Checked): { best: { place: PlaceData; r: Checked } | null; note: string } {
  const { W, H } = place;
  const real = realOf(libraryId, W, H);
  const had = new Set(r0.strictFails);
  const sx = place.start[0] + 1;
  const sy = place.start[1] + 1;
  const near = bodies(Float64Array.from(real), W, H)
    .map((tiles) => {
      let d = Infinity;
      for (const i of tiles) d = Math.min(d, dist2((i % W) - sx, Math.floor(i / W) - sy));
      return { tiles, d };
    })
    .filter((b) => b.d <= REAL_POOL_REACH * REAL_POOL_REACH)
    .sort((a, b) => a.d - b.d || a.tiles[0] - b.tiles[0])
    .slice(0, REAL_POOL_BODIES);
  if (!near.length) return { best: null, note: `  the start's pool on real water: no body of real water within ${REAL_POOL_REACH} tiles` };
  const filmed = (b: ReturnType<typeof buildPlace>) => films(b.settle.depth, b.model.floor, W, H).filter((f) => f.floor0 * 2 <= f.tiles.length).reduce((n, f) => n + f.tiles.length, 0);
  const film0 = filmed(r0.built);
  const m0 = realMeasure(r0.built.settle.depth, real);
  const flow0 = flaggedSources(place).flagged.length;
  const landMet = LAND_FLOORS.filter((id) => !had.has(id));
  const occupied = new Uint8Array(W * H);
  for (const [x, y] of place.sources) occupied[y * W + x] = 1;
  for (const gaps of [place.bushes, place.pines, place.birches, place.oaks, place.deadPines, place.deadBirches, place.deadOaks, place.ruins]) for (const i of decodeTiles(gaps)) occupied[i] = 1;
  for (const i of startTiles(W, place.start)) occupied[i] = 1;
  const h0 = decodeHeights(place.heights);
  const tried: string[] = [];
  for (const body of near) {
    const inBody = new Uint8Array(W * H);
    for (const i of body.tiles) inBody[i] = 1;
    const at = `${body.tiles[0] % W},${Math.floor(body.tiles[0] / W)}`;
    // the ways: as it is, its bed cut, a source at its head (on the cut bed where there is one)
    const ways: { what: string; place: PlaceData }[] = [{ what: "as it is", place }];
    const cut = Uint8Array.from(h0);
    let n = 0;
    for (const i of body.tiles) {
      const L = h0[i];
      const x = i % W;
      const y = (i - x) / W;
      if (L === 0 || h0[i] !== surveyed[i] || x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
      if (h0[i - 1] >= L && h0[i + 1] >= L && h0[i - W] >= L && h0[i + W] >= L) {
        cut[i] = L - 1;
        n++;
      }
    }
    const bed = n ? { what: `its bed cut (${n} tiles)`, place: { ...place, heights: encodeHeights(cut) } } : null;
    if (bed) ways.push(bed);
    if (!place.sources.some(([x, y]) => inBody[y * W + x])) {
      let cx = 0;
      let cy = 0;
      for (const i of body.tiles) {
        cx += i % W;
        cy += Math.floor(i / W);
      }
      cx /= body.tiles.length;
      cy /= body.tiles.length;
      let head = -1;
      let hd = Infinity;
      for (const i of body.tiles) {
        if (occupied[i]) continue;
        const d = dist2((i % W) - cx, Math.floor(i / W) - cy);
        if (d < hd) (hd = d), (head = i);
      }
      if (head >= 0) {
        const hx = head % W;
        const hy = (head - hx) / W;
        const base = bed ?? ways[0];
        for (const s of REAL_HEAD_STRENGTHS) ways.push({ what: `${bed ? `${bed.what}, ` : ""}a source at its head ${hx},${hy} (${s})`, place: { ...base.place, sources: [...base.place.sources, [hx, hy, s]] } });
      }
    }
    for (const way of ways) {
      let c = way.place === place ? r0 : buildChecked(way.place);
      // (plants the new water leaves on soil that kills them move to moist ground close by or go, as everywhere: #523)
      if (way.place !== place && c.strictFails.includes("plants.survive") && !had.has("plants.survive") && c.strict.analysis) {
        const a = c.strict.analysis;
        way.place = settlePlants(way.place, { moisture: a.moisture, contamination: a.soilContamination, depth: c.built.settle.depth }, a.startDistance, PLANT_REACH).place;
        c = buildChecked(way.place);
      }
      if (way.place !== place) {
        const mm = realMeasure(c.built.settle.depth, real);
        const why = [
          ...(r0.built.settle.settled && !c.built.settle.settled ? ["the water would not settle"] : []),
          ...(filmed(c.built) > film0 ? ["a film above floor 0"] : []),
          ...(mm.real < m0.real ? [`real water ${m0.real} → ${mm.real}`] : []),
          ...(flaggedSources(way.place).flagged.length > flow0 ? ["a source in another's flow"] : []),
          ...c.strictFails.filter((id) => !had.has(id) && !FREE.has(id)),
        ];
        if (why.length) {
          tried.push(`${body.tiles.length} at ${at} ${way.what}: ${why.join(", ")}`);
          continue;
        }
      }
      // the start where it is, then the spots by the body
      const land = { moisture: c.strict.analysis!.moisture, reach: checkLimit(c.strict, "start.reach"), moist: checkLimit(c.strict, "start.farmland") + checkLimit(c.strict, "start.forester"), within: FARM_WALK };
      const toBody = (s: [number, number]) => {
        let d = Infinity;
        for (const i of body.tiles) d = Math.min(d, dist2((i % W) - s[0] - 1, Math.floor(i / W) - s[1] - 1));
        return d;
      };
      const spots = [
        place.start,
        ...placeStartSpots(way.place, c.built.heights, c.built.settle.depth, c.built.settle.contamination, { limit: Infinity, walk: 20, land })
          .map((s) => ({ s, d: toBody(s) }))
          .sort((a, b) => a.d - b.d || a.s[1] - b.s[1] || a.s[0] - b.s[0])
          .slice(0, REAL_POOL_SPOTS)
          .map((x) => x.s),
      ];
      let best: { place: PlaceData; r: Checked; score: number; walk: number; at: [number, number] } | null = null;
      for (const s of spots) {
        let cand = s === place.start ? way.place : withStart(way.place, s);
        let r = s === place.start ? c : buildChecked(cand);
        if (r.strictFails.includes("start.water")) continue;
        if (r.strictFails.some((id) => WOOD_CHECKS.includes(id) && !had.has(id))) {
          const walkField = startWalkField(r.built.heights, W, H, placeEntities(cand, r.built.heights), { x: s[0] + 1, y: s[1] + 1 });
          const g = growFastWood(cand, r, walkField, { wood: checkLimit(r.strict, "start.wood"), floor: checkLimit(r.strict, "start.wood_floor") }, (k) => k.strictFails.includes("start.wood_fast"));
          cand = g.place;
          r = g.r;
        }
        // (its berries planted where the move costs the start its food: no start number gets worse)
        if (r.strictFails.includes("start.food") && !had.has("start.food")) ({ place: cand, r } = startBerries(cand, r));
        const pool = poolOf(cand);
        if (!pool || !inBody[pool.tile] || r.strictFails.some((id) => !had.has(id) || landMet.includes(id))) continue;
        const sc = startScore(r.strictFails);
        if (best && (sc > best.score || (sc === best.score && pool.walk >= best.walk))) continue;
        best = { place: cand, r, score: sc, walk: pool.walk, at: s };
      }
      if (best) {
        const moved = best.at === place.start ? "the start where it is" : `the start at ${best.at.join(",")}`;
        return { best, note: `  the start's pool on real water: ${body.tiles.length} tiles at ${at} ${way.what}, ${moved}, a pool ${Math.round(best.walk * 10) / 10} tiles' walk away` };
      }
      tried.push(`${body.tiles.length} at ${at} ${way.what}: no spot by it pumps from it (${spots.length - 1} spots)`);
    }
  }
  return { best: null, note: `  the start's pool on real water: none (${tried.join("; ")})` };
}

/** The pool the start's first settlers pump from (`startPool`: walkable, pumpable with the first pump, not a thin
 *  sheet), on the place as built; null when there is none within the start's walk. */
function poolOf(p: PlaceData) {
  const b = buildPlace(p, settles);
  return startPool(p, b.heights, b.settle.depth, b.settle.contamination, { thin: FILM_DEPTH, thinShare: FILM_THIN_SHARE });
}

/** Whether the start has no pumpable water within its walk at all (`start.water` itself fails: not even a thin sheet). */
function noWaterAtAll(s: Checked["strict"]): boolean {
  return !s.report.checks.find((c) => c.id === "start.water")?.ok;
}

/** The walk to the start's water (`start.water`'s value), or null when it has none in reach. */
function waterIn(s: Checked["strict"]): number | null {
  const v = s.report.checks.find((c) => c.id === "start.water")?.value;
  return typeof v === "number" ? v : null;
}

/** The start's numbers (D(new-films)): its water in reach first (the walk to it, of the check's limit), then its logs,
 *  its starting-logs floor, its berries and its moist ground for farms. */
function startNumbers(s: Checked["strict"]): string {
  const c = (id: string) => s.report.checks.find((x) => x.id === id);
  const v = (id: string) => {
    const x = c(id);
    const val = x?.value;
    return val === undefined || val === null ? "-" : typeof val === "number" ? String(Math.round(val * 10) / 10) : String(val);
  };
  return `water ${v("start.water")}/${c("start.water")?.limit ?? "-"}, wood ${v("start.wood")}, floor ${v("start.wood_floor")}, food ${v("start.food")}, farmland ${v("start.farmland")}`;
}

/** The water checks every offered place passes, and its floor-0 sheet: one log line. */
function waterVerdict(libraryId: string, b: ReturnType<typeof buildPlace>, id: string): { line: string; failed: boolean; measure: Measure } {
  const { W, H } = b.model;
  const again = settleFile(b.file);
  const c = compareWater(b.settle.depth, again.water.depth, W, H);
  const unequal = Math.abs(c.change) > 0.01 || c.lost.length > 0;
  const fs = films(b.settle.depth, b.model.floor, W, H);
  const above = fs.filter((f) => f.floor0 * 2 <= f.tiles.length);
  const real = realOf(libraryId, W, H);
  const sheet = floor0Sheet(b.settle.depth, b.model.floor, W, H, real, FILM_DEPTH, FILM_TILES);
  const measure = realParts(b.settle.depth, b.model.floor, W, H, real);
  // (a place kept on today's build, `TODAY_KEPT`, keeps the film today's build has, printed with the reason)
  const left = TODAY_KEPT[id];
  const filmAt = above.map((f) => `${f.tiles.length} tiles at ${f.at.join(",")}`).join("; ");
  const line =
    `   water: opened ${c.wetOpened} wet, settled again ${c.wetSettled}${c.lost.length ? `, ${c.lost.length} bodies of ${BODY}+ lost` : ""}${unequal ? " (FAILS: opened is not settled)" : ""}` +
    (above.length ? (left ? `; film above floor 0 today's build has (${filmAt}), kept: ${left}` : `; FAILS: film above floor 0 (${filmAt})`) : "") +
    `; floor-0 sheet ${sheet.tiles} tiles (${sheet.real} over real water, ${sheet.dry} over real dry land)` +
    `; over real water ${measure.real}, over real dry land ${measure.dry} (floor-0 sheet ${measure.sheet}, the rest ${measure.rest})`;
  return { line, failed: unequal || (above.length > 0 && !left), measure };
}

const only = arg("only")?.split(",") ?? null;
const library = JSON.parse(readFileSync(join(LIBRARY, "index.json"), "utf8")) as { items: LibraryItem[] };
const items = library.items.filter((it) => it.family !== "random");
const skipped = library.items.filter((it) => it.family === "random");
/** `--check --shard i/n` (the Nightly's `places (i/n)` jobs): this run builds and checks only shard i's places
 *  (tools/lib/placeShards.ts), and the whole set's index and files are checked from what is committed (`checkShard`). */
const shard = arg("shard") ? parseShard(arg("shard")!) : null;
if (shard && (!check || only || relayRuins || process.argv.includes("--write"))) throw new Error("--shard i/n goes with --check alone (not --only, --ruins or --write)");
const mine = shard ? new Set(shardPlaces(items.map((it) => it.size), shard, shardMoves(items.map((it) => it.id), shard.n))) : null;

const files = new Map<string, Uint8Array>();
const entries: PlaceIndexEntry[] = [];
let failures = 0;
/** Places whose start fails the floors, or named in WITHHELD_UNTIL: not offered (no map, card or index entry), printed by every run. */
const withheld: string[] = [];
const t0 = performance.now();
/** What one place's run gives: its lines of the log, in order; the place withheld (its name), or its files and its
 *  index entry; whether it failed a check. Each place stands alone, so the places run on several processes at once
 *  (`--claim`) and are put back in the library's order. */
interface Outcome {
  id: string;
  lines: string[];
  withheld: string[];
  entries: PlaceIndexEntry[];
  files: [string, Uint8Array][];
  failed: boolean;
  /** D271's measure of its water as it opens (D(new-films): the water over real dry land in its two parts). */
  measure?: Measure;
  /** Whether its start's water within its walk is a pool (`startPool`); false too for a place withheld for no water. */
  pool?: boolean;
  /** The generate profile's checks its build fails (an offered place's). */
  fails?: string[];
}
/** The water over real water and over real dry land, the latter as the floor-0 sheet and the rest (`realParts`). */
type Measure = ReturnType<typeof realParts>;

/** One place, built, mended and checked (null: not among `--only`'s): built as before, and where its start then has no
 *  pool (#1218) built again under the pool rule (`poolRule`), that build kept where its start has a pool, nothing fails
 *  that the first passed, it gains no fault and holds the water over real water. */
function runPlace(item: LibraryItem): Outcome | null {
  poolRule = false;
  const a = runPlaceOnce(item);
  if (!a || a.pool !== false || a.failed || relayRuins) return a;
  poolRule = true;
  const b = runPlaceOnce(item);
  poolRule = false;
  if (!b) return a;
  const offered = !!a.entries.length;
  const gained = offered && b.entries.length ? b.entries[0].faults.filter((f) => f !== "start.water" && !a.entries[0].faults.includes(f)) : [];
  // (nor a start's land or wood check the first build passed: the pool rule's moves may cost them on the way)
  const lost = offered ? (b.fails ?? []).filter((id) => (START_LAND.includes(id) || WOOD_CHECKS.includes(id)) && !(a.fails ?? []).includes(id)) : [];
  const why = [
    ...(b.pool ? [] : ["its start has no pool either"]),
    ...(b.failed ? ["it fails a check"] : []),
    ...(gained.length ? [`it gains ${gained.join(", ")}`] : []),
    ...(lost.length ? [`its start fails ${lost.join(", ")}`] : []),
    ...(offered && a.measure && b.measure && b.measure.real < a.measure.real ? [`real water ${a.measure.real} → ${b.measure.real}`] : []),
  ];
  if (!why.length) return { ...b, lines: [...b.lines, `   the pool rule's build kept (#1218): built as before, ${offered ? `its start's water is not a pool${a.measure ? ` (real water ${a.measure.real}, real dry land ${a.measure.dry})` : ""}` : "it is withheld for no water"}`] };
  // (what the pool rule's build tried, from its own line: its mends' notes, or why it was withheld)
  const tried = b.lines[0]?.match(/(?:  the start's pool on real water|  the start's spring for its water|  the start moved with its spring|: its start has no pumpable water).*$/)?.[0].replace(/^: /, "  ") ?? "";
  return { ...a, lines: [...a.lines, `   the pool rule's build not kept (#1218): ${why.join(", ")};${tried}`] };
}

function runPlaceOnce(item: LibraryItem): Outcome | null {
  const fx = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(join(LIBRARY, item.fixture)))))) as Fixture;
  const out: Outcome = { id: "", lines: [], withheld: [], entries: [], files: [], failed: false };
  settles = new CountedSettles();
  Object.assign(spent, { steps: [], at: performance.now(), builds: 0, build: 0, check: 0 });
  const say = (line: string) => void out.lines.push(line);
  const { withheld, entries } = out;
  const files = { set: (k: string, b: Uint8Array) => void out.files.push([k, b]) };
  let place = toPlace(item, fx);
  // (the survey's land, before any basin or bed is cut: a bed is cut once, never twice)
  const surveyedHeights = decodeHeights(place.heights);
  // (the columns the survey stood: a place's ruins are laid again to this count, whatever ruins it holds by then)
  const surveyedRuins = decodeTiles(place.ruins).length;
  if (only && !only.includes(place.id)) return null;
  out.id = place.id;
  if (WITHHELD_UNTIL[place.id]) {
    withheld.push(place.name);
    say(`WITHHELD ${place.W}² ${place.name}: ${WITHHELD_UNTIL[place.id]}`);
    if (waterMeasure) {
      const m = mendSources(place).place;
      say(waterLine(buildPlace(m), m));
    }
    return out;
  }
  const t = performance.now();
  // `--ruins`: everything before the ruins is the committed place's (its land, water, springs, start and plants, which
  // the ruins never change), and only its ruin fields are laid again: minutes, where the springs' search takes hours.
  // A full run gives the same files (`--check`)
  // A place whose film no ruled mend reaches and whose ruled build is worse than today's keeps today's build
  // A place that keeps today's build (`TODAY_KEPT`): the committed place, as `--ruins` takes it
  const today = !!TODAY_KEPT[place.id];
  if (relayRuins || today) {
    const kept = join(today ? "public/real-places" : OUT, `data/${place.id}.json.gz`);
    if (!existsSync(kept)) throw new Error(`${today ? "TODAY_KEPT" : "--ruins"}: ${kept} is missing (a new place needs the full run)`);
    let committed = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(kept))))) as PlaceData;
    let note = today ? `  today's build kept: ${TODAY_KEPT[place.id]}` : "  (--ruins: the committed place)";
    // a place kept on today's build whose start has no pool gets one (#1218) as any place does: on real water by it first
    // (`realPoolFor`), else the start's spring (`startSpringFor`); what it writes is the committed place from then on, which
    // has its pool, so the next run keeps it as it is
    if (today && poolRule) {
      const r = buildChecked(committed);
      if (r.strictFails.includes("start.water")) {
        const rp = realPoolFor(item.id, committed, surveyedHeights, r);
        note += rp.note;
        if (rp.best) committed = rp.best.place;
        else {
          const ss = startSpringFor(committed, r);
          note += ss.note;
          if (ss.best) committed = { ...committed, sources: [...committed.sources, ...ss.best.add] };
          else {
            const sp = springSpotFor(committed, r);
            note += sp.note;
            if (sp.best) committed = sp.best;
          }
        }
      }
    }
    if (today && noWaterAtAll(buildChecked(committed).strict)) {
      out.pool = false;
      withheld.push(place.name);
      say(`WITHHELD ${place.W}² ${place.name}: its start has no pumpable water within 20 tiles;${note}`);
      return out;
    }
    return finishPlace(item, committed, surveyedRuins, t, note, out);
  }
  // Sources only at heads (D171, tools/lib/placeSources.ts): a source in another's flow merges into the upstream source
  // where that file's rules allow it; the rest stay, and the place keeps the fault until none is left. (The sealed-land
  // comparison for the start's water below is the survey's own, so it keeps the unmended sources.)
  // The survey's ruin squares hold no tiles while the start, springs and plants are placed (D(new-films), planning's
  // ruling of 2026-11-15): the ruins are laid again last, along the land (`layRuins`), so the trees and bushes may stand
  // where an old square stood
  place = { ...place, ruins: encodeTiles([]) };
  const surveyed = place;
  // Basins where the real water lies (D521, tools/lib/placeBasins.ts): a body the port's rules showed and the game's
  // lose is cut one level inside its own flat's rim where the observed water lies, so the place's rivers fill it; where
  // none lies it goes. Before the sources' mend, so a source the new lake takes in merges as any other.
  const basin = basinsFor(item.id, place);
  place = basin.place;
  lap("basins");
  const mend = mendSources(place);
  place = mend.place;
  lap("sources");
  const mendNote = mend.merges.length || mend.left.length ? `  sources: ${mend.merges.length} merged${mend.left.length ? `, ${mend.left.length} left in a flow (${mend.left.map((l) => `${l.at.join(",")} ${l.why}`).join("; ")})` : ""}` : "";
  let { built, v, strict, blocking, strictFails } = buildChecked(place);
  // A start the opened rivers flood, or that reaches no water a source feeds, moves (D245: the best
  // spot its own land offers; moving it toward water is fine): the spots that stay dry and have a shore
  // near (a flooded start where the place has none: dry ones), those whose land can give the start's
  // land floors first (D515: its walkable land and the moist ground for the first farms and a forester,
  // which no object makes), each nearest it first, each built and checked, then spots with a longer
  // walk to their shore; the best wins, water first (D245's water floor), then the land floors, then
  // the wood and berries by it, then the nearest. A spot whose water and land meet the floors but whose
  // wood falls below what the start met gets fast trees by it (`growFastWood`, objects only) up to the
  // wood checks' limits. Never one that falls below the starting-logs floor it met (D224) or fails
  // anything else it passed but the wood, the berries and the start land (information, D331).
  const opened = surveyed;
  let moved: [number, number] | null = null;
  let movedWood = "";
  const dry = strictFails.includes("start.dry");
  const free = FREE;
  // (water first, then the land floors, then the starting-logs floor, then the berries, then the wood:
  // a spot or spring that costs the start its berries ranks below one that keeps them)
  const score = startScore;
  for (const walk of [undefined, LONG_SHORE_WALK]) {
    if (!strictFails.includes("start.dry") && !strictFails.includes("start.water")) break;
    const had = new Set(strictFails);
    const land = { moisture: strict.analysis!.moisture, reach: checkLimit(strict, "start.reach"), moist: checkLimit(strict, "start.farmland") + checkLimit(strict, "start.forester"), within: FARM_WALK };
    const spots = placeStartSpots(place, built.heights, built.settle.depth, built.settle.contamination, { walk, land });
    if (dry && !walk) spots.push(...placeStartSpots(place, built.heights, built.settle.depth, built.settle.contamination, { shore: false, limit: 4, land }));
    let best: { at: [number, number]; place: PlaceData; r: Checked; score: number; grown: string } | null = null;
    const bar = had.has("start.dry") ? Infinity : score(strictFails);
    for (const at of spots) {
      let cand = withStart(place, at);
      let r = buildChecked(cand);
      let grown = "";
      const sound = !r.strictFails.includes("start.water") && !r.strictFails.some((id) => LAND_FLOORS.includes(id));
      if (sound && r.strictFails.some((id) => WOOD_CHECKS.includes(id) && !had.has(id)) && !(best && score(r.strictFails.filter((id) => !WOOD_CHECKS.includes(id))) >= best.score)) {
        const walkField = startWalkField(r.built.heights, cand.W, cand.H, placeEntities(cand, r.built.heights), { x: at[0] + 1, y: at[1] + 1 });
        const g = growFastWood(cand, r, walkField, { wood: checkLimit(r.strict, "start.wood"), floor: checkLimit(r.strict, "start.wood_floor") }, (c) => c.strictFails.includes("start.wood_fast"));
        if (g.planted) {
          cand = g.place;
          r = g.r;
          grown = `, ${g.planted} ${g.kind} planted by it`;
        }
      }
      if (r.strictFails.some((id) => !had.has(id) && !free.has(id))) continue;
      if (!had.has("start.dry") && r.strictFails.includes("start.water")) continue;
      const sc = score(r.strictFails);
      if (sc >= bar || (best && sc >= best.score)) continue;
      best = { at, place: cand, r, score: sc, grown };
      if (sc === 0) break;
    }
    if (best) {
      moved ??= place.start;
      movedWood = best.grown;
      place = best.place;
      ({ built, v, strict, blocking, strictFails } = best.r);
    }
  }
  // A place whose start had water a pump reaches on the survey's sealed land and has none now gets a
  // spring by its start where no spot gives it water (D245's water floor, src/core/places/spring.ts):
  // opening the edges never leaves a place without the water it had. The best spring the checks
  // pass wins: one that costs nothing ends the search; otherwise the wider tier is tried too.
  lap("start");
  let spring: [number, number, number][] | null = null;
  if (strictFails.includes("start.water") && !buildChecked({ ...opened, heights: encodeHeights(fx.heights) }).strictFails.includes("start.water")) {
    const had = new Set(strictFails);
    let best: { add: [number, number, number][]; r: ReturnType<typeof buildChecked>; score: number } | null = null;
    for (const [rule, tries] of SPRING_TRIES) {
      for (const add of placeSprings(place, built.heights, built.settle.depth, { rule, tries, key: seedKey(place) })) {
        const r = buildChecked({ ...place, sources: [...place.sources, ...add] });
        if (r.strictFails.includes("start.water") || r.strictFails.some((id) => !had.has(id) && !free.has(id))) continue;
        const sc = score(r.strictFails);
        if (best && sc >= best.score) continue;
        best = { add, r, score: sc };
        if (!r.strictFails.some((id) => !had.has(id))) break;
      }
      if (best && !best.r.strictFails.some((id) => !had.has(id))) break;
    }
    if (best) {
      spring = best.add;
      place = { ...place, sources: [...place.sources, ...best.add] };
      ({ built, v, strict, blocking, strictFails } = best.r);
    }
  }
  // A start that still reaches no water tries every spot its land offers (planning's ruling on #236): each spot with a
  // shore within `WIDE_SHORE_WALK`, a few tiles apart, that passes `start.water` with the room floor (`start.level_land`)
  // on the settled water, its wood grown where it falls short (objects only), and nothing else it passed then failing;
  // the best wins. Where none does, `start.water` stands: the place keeps D445's note.
  lap("spring");
  let everySpot = "";
  if (strictFails.includes("start.water")) {
    const had = new Set(strictFails);
    let best: { at: [number, number]; place: PlaceData; r: Checked; score: number } | null = null;
    const all = placeStartSpots(place, built.heights, built.settle.depth, built.settle.contamination, { limit: Infinity, walk: WIDE_SHORE_WALK });
    let watered = 0;
    for (const at of all) {
      let cand = withStart(place, at);
      let r = buildChecked(cand);
      if (r.strictFails.includes("start.water") || r.strictFails.includes("start.level_land")) continue;
      watered++;
      if (r.strictFails.some((id) => WOOD_CHECKS.includes(id) && !had.has(id))) {
        const walkField = startWalkField(r.built.heights, cand.W, cand.H, placeEntities(cand, r.built.heights), { x: at[0] + 1, y: at[1] + 1 });
        const g = growFastWood(cand, r, walkField, { wood: checkLimit(r.strict, "start.wood"), floor: checkLimit(r.strict, "start.wood_floor") }, (c) => c.strictFails.includes("start.wood_fast"));
        cand = g.place;
        r = g.r;
      }
      if (r.strictFails.some((id) => !had.has(id) && !free.has(id))) continue;
      const sc = score(r.strictFails);
      if (best && sc >= best.score) continue;
      best = { at, place: cand, r, score: sc };
    }
    if (best) {
      moved ??= place.start;
      place = best.place;
      ({ built, v, strict, blocking, strictFails } = best.r);
    }
    everySpot = `  every spot tried for water (${all.length}): ${watered} pass start.water with the room floor${best ? "" : watered ? ", none without failing more" : ""}`;
  }
  // The real water by the start as its pool (#1218: real water first): where the start still has no pool, the bodies of
  // real water nearest it, each as it is, with its bed cut and with a source at its head, and the start moved beside it
  // (`realPoolFor`)
  let realPool = "";
  if (poolRule && strictFails.includes("start.water")) {
    const rp = realPoolFor(item.id, place, surveyedHeights, { built, v, strict, blocking, strictFails });
    realPool = rp.note;
    if (rp.best) {
      if (rp.best.place.start[0] !== place.start[0] || rp.best.place.start[1] !== place.start[1]) moved ??= place.start;
      place = rp.best.place;
      ({ built, v, strict, blocking, strictFails } = rp.best.r);
    }
  }
  const pre = strictFails.includes("start.water") ? startSpringFor(place, { built, v, strict, blocking, strictFails }) : null;
  // The springs searched under the game's rules (D521, tools/lib/placeFeeds.ts): by D271's measure, the settled water
  // over the real water as high as it goes and over real dry land as low as it goes, by where each spring stands and how
  // strong it is; kept only where no check the place passed then fails and no film above floor 0 stands. After the start
  // has found its water (a move, a spring by it, every spot), so a spring the start drinks from is never the one taken
  // away; before the berries and plants, which settle on the water the springs leave
  lap("every spot");
  let feeds = feedsFor(item.id, place);
  // A start given the start's spring is built both ways, the spring before the search and after it (where the start
  // still has none once the springs are searched), and keeps the better: the start's pool first, then the water over
  // real water, then D271's measure (a spring before the search can hold a source the search would move off the real
  // water: Cliffs of Moher, Iguazu Falls)
  if (pre?.best) {
    const real = realOf(item.id, place.W, place.H);
    const judge = (p: PlaceData) => {
      const c = buildChecked(p);
      const m = realMeasure(c.built.settle.depth, real);
      return { served: !c.strictFails.includes("start.water") && poolOf(p) !== null, real: m.real, score: m.score };
    };
    let after = { place: feeds.place, note: feeds.note, add: null as [number, number, number][] | null };
    const ra = buildChecked(feeds.place);
    if (ra.strictFails.includes("start.water")) {
      const post = startSpringFor(feeds.place, ra);
      after = post.best ? { place: { ...feeds.place, sources: [...feeds.place.sources, ...post.best.add] }, note: feeds.note + post.note, add: post.best.add } : { ...after, note: feeds.note + post.note };
    }
    let add = pre.best.add;
    let before = feedsFor(item.id, { ...place, sources: [...place.sources, ...add] });
    const ja = judge(after.place);
    let jb = judge(before.place);
    // (planning's ruling of 2026-11-16: a start with water it can pump outranks real water, but a spring by the start
    // that costs no real water is looked for first: where the best one costs some, the next sites are built in turn and
    // the first that serves the start and holds the real water of the search without it wins)
    const bar = realMeasure(buildChecked(feeds.place).built.settle.depth, real).real;
    let costNote = "";
    // (only where the search first leaves the start without its pool: where it gives one, that costs no real water)
    if (jb.served && jb.real < bar && !ja.served) {
      costNote = ` (costs real water ${bar} → ${jb.real}`;
      let found = false;
      for (const c of pre.all.slice(1, 1 + COSTLESS_TRIES)) {
        const f = feedsFor(item.id, { ...place, sources: [...place.sources, ...c.add] });
        const j = judge(f.place);
        if (j.served && j.real >= bar) {
          add = c.add;
          before = f;
          jb = j;
          found = true;
          costNote += `; ${c.add.map((s) => `${s[0]},${s[1]}`).join(" ")} costs none`;
          break;
        }
      }
      costNote += found ? ")" : `; none of the next ${Math.min(COSTLESS_TRIES, pre.all.length - 1)} sites costs none)`;
    }
    if ((jb.served && !ja.served) || (jb.served === ja.served && (jb.real > ja.real || (jb.real === ja.real && jb.score > ja.score)))) {
      spring = [...(spring ?? []), ...add];
      everySpot += `  the start's spring for its water: ${add.map((s) => `${s[0]},${s[1]}`).join(" ")} (before the search)${costNote}`;
      feeds = before;
    } else {
      if (after.add) spring = [...(spring ?? []), ...after.add];
      everySpot += (after.add ? after.note.slice(feeds.note.length) : pre.note.replace(": ", ": not taken, ")) + " (after the search)";
      feeds = { place: after.place, note: feeds.note };
    }
  } else if (pre) {
    // (no place before the search: one after it, on the water the search leaves)
    const ra = buildChecked(feeds.place);
    const post = ra.strictFails.includes("start.water") ? startSpringFor(feeds.place, ra) : null;
    if (post?.best) {
      spring = [...(spring ?? []), ...post.best.add];
      feeds = { place: { ...feeds.place, sources: [...feeds.place.sources, ...post.best.add] }, note: feeds.note };
    }
    everySpot += (post ?? pre).note + (post ? " (after the search)" : "");
  }
  const searched = feeds.place !== place;
  if (searched) {
    place = feeds.place;
    ({ built, v, strict, blocking, strictFails } = buildChecked(place));
  }
  // A start with no allowed spring site and still no pumpable water moves to water (planning's ruling of 2026-11-16: no
  // place ships with no pumpable water within 20 tiles of its start): the spots within 20 tiles' walk of a shore
  // (`placeStartSpots`), each built and checked, kept where `start.water` passes, the water stands as the start's pool
  // (`startPool`) and nothing else it passed then fails, its wood grown where it falls short (objects only); the fewest
  // failures win, then the nearest pool. Where none passes, the nearest spot with water a pump reaches is logged with
  // its numbers
  if (pre && strictFails.includes("start.water")) {
    const had = new Set(strictFails);
    const spots = placeStartSpots(place, built.heights, built.settle.depth, built.settle.contamination, { limit: Infinity, walk: 20 });
    let best: { at: [number, number]; place: PlaceData; r: Checked; score: number; walk: number } | null = null;
    let near: { at: [number, number]; why: string } | null = null;
    for (const at of spots) {
      let cand = withStart(place, at);
      let r = buildChecked(cand);
      if (r.strictFails.includes("start.water")) continue;
      if (r.strictFails.some((id) => WOOD_CHECKS.includes(id) && !had.has(id))) {
        const walkField = startWalkField(r.built.heights, cand.W, cand.H, placeEntities(cand, r.built.heights), { x: at[0] + 1, y: at[1] + 1 });
        const g = growFastWood(cand, r, walkField, { wood: checkLimit(r.strict, "start.wood"), floor: checkLimit(r.strict, "start.wood_floor") }, (c) => c.strictFails.includes("start.wood_fast"));
        cand = g.place;
        r = g.r;
      }
      const pool = poolOf(cand);
      const worse = r.strictFails.filter((id) => !had.has(id) && !free.has(id));
      if (!pool || worse.length) {
        near ??= { at, why: `${!pool ? "its water is a thin sheet, no pool" : ""}${!pool && worse.length ? "; " : ""}${worse.join(", ")}` };
        continue;
      }
      const sc = score(r.strictFails);
      if (best && (sc > best.score || (sc === best.score && pool.walk >= best.walk))) continue;
      best = { at, place: cand, r, score: sc, walk: pool.walk };
    }
    if (best) {
      moved ??= place.start;
      place = best.place;
      ({ built, v, strict, blocking, strictFails } = best.r);
    }
    everySpot += `  the start moved to water (${spots.length} spots within 20 tiles of a shore): ${best ? `${best.at.join(",")}, a pool ${Math.round(best.walk * 10) / 10} tiles' walk away` : near ? `none; the nearest, ${near.at.join(",")}: ${near.why}` : "none pass start.water"}`;
  }
  // still none: the start moved to a dry spot near it with its own spring there (`springSpotFor`)
  if (poolRule && pre && strictFails.includes("start.water")) {
    const sp = springSpotFor(place, { built, v, strict, blocking, strictFails });
    everySpot += sp.note;
    if (sp.best) {
      moved ??= place.start;
      spring = [...(spring ?? []), ...sp.best.sources.filter(([x, y]) => !place.sources.some((q) => q[0] === x && q[1] === y))];
      place = sp.best;
      ({ built, v, strict, blocking, strictFails } = buildChecked(place));
    }
  }
  // a bed the searched springs leave without its film gives its land back (D331), on the place as it stands now (a start
  // moved to water above keeps its spot and wood: tools/lib/placeBeds.ts)
  const unbed = searched ? unneededBeds({ place, r: { built, v, strict, blocking, strictFails } }, basin.beds, { real: realOf(item.id, place.W, place.H), build: buildChecked, inFlow: (p) => flaggedSources(p).flagged.length }) : null;
  const unbedNote = unbed?.back ? `  land back under ${unbed.back} of ${basin.beds.length} beds the searched springs leave dry` : "";
  if (unbed?.back) {
    place = unbed.place;
    ({ built, v, strict, blocking, strictFails } = unbed.r);
  }
  // the films the searched springs leave get their mend (D(new-films)); a film none of whose mends is kept stays, and
  // the check refuses it (planning: such a place keeps today's build, `TODAY_KEPT`)
  const after = filmsAfter(item.id, place, { built, v, strict, blocking, strictFails });
  if (after.place !== place) {
    place = after.place;
    ({ built, v, strict, blocking, strictFails } = after.r);
  }
  const feedNote = feeds.note + unbedNote + after.note;
  lap("springs searched");
  // A start short of berries (after a move or a spring, or on its own land) gets the bushes the
  // `start.food` check's own fix plants (the editor's one-click fix: moist tiles within 20 tiles'
  // walk of the start, nearest first; objects only, never land, D331). Where the fix finds too few
  // tiles, the bushes `plants.survive` marks as dying (a spring's water over them, or the sealed
  // pools' moist ground drained) make room first: bushes only, so the wood stays. The result stays
  // only if the start has more living berries and nothing fails that did not.
  let planted = 0;
  const foodOf = (r: { strict: typeof strict }) => r.strict.report.checks.find((c) => c.id === "start.food");
  const fixTiles = (c: CheckResult | undefined, W: number) => (c?.fix ?? []).flatMap((f) => (f.op === "placeEntity" && f.params.template === "BlueberryBush" ? [f.params.y * W + f.params.x] : []));
  const food = foodOf({ strict });
  if (food && counts(food)) {
    const short = Number(food.limit ?? 0) - Number(food.value ?? 0);
    let base = place;
    let baseFix = fixTiles(food, place.W);
    if (baseFix.length < short) {
      const dying = new Set((strict.report.checks.find((c) => c.id === "plants.survive")?.where?.entities ?? []) as string[]);
      const dead = placeEntities(place, built.heights).filter((e) => e.template === "BlueberryBush" && dying.has(e.id)).map((e) => e.y * place.W + e.x);
      if (dead.length) {
        const gone = new Set(dead);
        const cleared = { ...place, bushes: encodeTiles(decodeTiles(place.bushes).filter((i) => !gone.has(i))) };
        const fix = fixTiles(foodOf(buildChecked(cleared)), place.W);
        if (fix.length > baseFix.length) {
          base = cleared;
          baseFix = fix;
        }
      }
    }
    if (baseFix.length) {
      const withBushes = { ...base, bushes: encodeTiles([...new Set([...decodeTiles(base.bushes), ...baseFix])].sort((a, b) => a - b)) };
      const r = buildChecked(withBushes);
      const after = foodOf(r);
      if (after && Number(after.value ?? 0) > Number(food.value ?? 0) && !r.strictFails.some((id) => !strictFails.includes(id))) {
        planted = baseFix.length;
        place = withBushes;
        ({ built, v, strict, blocking, strictFails } = r);
      }
    }
  }
  // Living plants on soil that kills them (#523: the survey's trees and bushes stood on ground its
  // sealed pools kept moist, which the open edges drained) move to the nearest free tile close by
  // where they live, by `plants.survive`'s own rule, or go (tools/lib/placePlants.ts; objects only,
  // the land and water stay). The start's needs come first: its berries never fall, and the logs it
  // loses (the wood checks count a dying tree's logs: a dead tree keeps them) are kept by the dying trees nearest
  // it, which stay where they stood as the dead trees they are in the game (DEAD_TREES_KEEP_LOGS); where that is
  // short, the wood moves, not the rule: pines (birches where the place leans to them) on the moist ground nearest
  // it, the fast species `start.wood_fast` (D515) counts, so an oak never lowers its share. The log says so.
  lap("berries");
  const survive = strict.report.checks.find((c) => c.id === "plants.survive");
  let plants = "";
  let floorsFail = false;
  if (survive && counts(survive) && strict.analysis) {
    // (a start a few logs under the limit is the conversion's rounding, not a land without wood: its wood is topped up)
    const topUp = (have: number, want: number) => (have < want && want - have <= WOOD_NEAR_MISS ? want : Math.min(have, want));
    const value = (s: typeof strict, id: string) => Number(s.report.checks.find((c) => c.id === id)?.value ?? 0);
    const limit = (id: string) => Number(strict.report.checks.find((c) => c.id === id)?.limit ?? 0);
    const bar = { wood: topUp(value(strict, "start.wood"), limit("start.wood")), floor: Math.min(value(strict, "start.wood_floor"), limit("start.wood_floor")), food: value(strict, "start.food") };
    const short = (s: typeof strict) => Math.max(bar.wood - value(s, "start.wood"), bar.floor - value(s, "start.wood_floor"));
    const g = { moisture: strict.analysis.moisture, contamination: strict.analysis.soilContamination, depth: built.settle.depth };
    const near = strict.analysis.startDistance;
    const settled = settlePlants(place, g, near, PLANT_REACH);
    let next = settled.place;
    let r = buildChecked(next);
    let woods = 0;
    let woodKind = "pines";
    let kept = 0;
    let moves = settled.moves;
    const moved = (to: boolean) => moves.filter((m) => m.to >= 0 === to).length;
    // (a place that met `start.wood_fast` must go on meeting it; one that never did is not held to it)
    const fastLow = (s: typeof r) => !strictFails.includes("start.wood_fast") && s.strictFails.includes("start.wood_fast");
    if (short(r.strict) > 0 || fastLow(r)) {
      const walk = startWalkField(built.heights, place.W, place.H, placeEntities(next, built.heights), { x: place.start[0] + 1, y: place.start[1] + 1 });
      // (the walk here is the tool's estimate of the check's: each step is built and checked again)
      // the trees that stood on soil that kills them stay dead where they stood, the nearest the start first, as far as
      // their logs are wanted (the game gives a dead tree's logs: DEAD_TREES_KEEP_LOGS; none to the fast share)
      const deadLogs = Object.fromEntries(Object.entries(LOGS_PER_TREE_SPECIES).map(([t, n]) => [t, DEAD_TREES_KEEP_LOGS[t] ? n : 0]));
      const keepDead = () => {
        for (let round = 0; round < 6 && short(r.strict) > 0; round++) {
          const k = keepNearest(next, moves, walk, LOG_FLOOR_WALK, short(r.strict), deadLogs);
          if (!k.kept) break;
          next = k.place;
          moves = k.moves;
          kept += k.kept;
          r = buildChecked(next);
        }
      };
      keepDead();
      // still short: the wood moves, not the rule. Its lost logs are planted on the moist ground nearest the start as
      // pines, or birches where the place leans to them: `start.wood_fast`, which a place that met it must go on
      // meeting, counts only those; where it is short, a batch sized by its share is added
      const grown = growFastWood(next, r, walk, bar, fastLow);
      next = grown.place;
      r = grown.r;
      woods += grown.planted;
      woodKind = grown.kind;
      keepDead();
    }
    if (!r.built.settle.depth.every((d, i) => d === built.settle.depth[i])) throw new Error(`${place.name}: moving plants changed the water`);
    const left = r.strict.report.checks.find((c) => c.id === "plants.survive");
    const meets = short(r.strict) <= 0 && value(r.strict, "start.food") >= bar.food && !r.strictFails.some((id) => !strictFails.includes(id));
    plants = meets
      ? `  plants on dry soil ${survive.value} → ${left && counts(left) ? left.value : 0}: ${moved(true)} moved, ${moved(false)} gone` +
        (woods ? `, ${woods} ${woodKind} planted by the start` : "") +
        (kept ? `, ${kept} dying trees left dead for the start's wood` : "")
      : `  plants on dry soil kept (${survive.value}): moving them costs the start (` +
        [
          ...r.strictFails.filter((id) => !strictFails.includes(id)),
          ...(value(r.strict, "start.wood") < bar.wood ? [`wood ${value(r.strict, "start.wood")} of ${bar.wood}`] : []),
          ...(value(r.strict, "start.wood_floor") < bar.floor ? [`floor ${value(r.strict, "start.wood_floor")} of ${bar.floor}`] : []),
          ...(value(r.strict, "start.food") < bar.food ? [`berries ${value(r.strict, "start.food")} of ${bar.food}`] : []),
        ].join(", ") +
        ")";
    floorsFail = !meets;
    if (meets) {
      place = next;
      ({ built, v, strict, blocking, strictFails } = r);
    }
  }
  // The starting-logs floor met by groves (D245): a start still short of `start.wood` or `start.wood_floor` gets fast
  // trees on the moist ground nearest it (`growFastWood`, objects only), kept only where nothing it passed then fails
  lap("plants");
  let groves = "";
  if (!floorsFail && strict.analysis && (strictFails.includes("start.wood") || strictFails.includes("start.wood_floor"))) {
    const walk = startWalkField(built.heights, place.W, place.H, placeEntities(place, built.heights), { x: place.start[0] + 1, y: place.start[1] + 1 });
    const g = growFastWood(place, { built, v, strict, blocking, strictFails }, walk, { wood: checkLimit(strict, "start.wood"), floor: checkLimit(strict, "start.wood_floor") }, () => false);
    if (g.planted && !g.r.strictFails.some((id) => !strictFails.includes(id)) && g.r.strictFails.length < strictFails.length) {
      place = g.place;
      ({ built, v, strict, blocking, strictFails } = g.r);
      groves = `  ${g.planted} ${g.kind} planted for the start's wood`;
    }
  }
  lap("groves");
  // No place ships with no pumpable water within 20 tiles of its start (D(new-films), #1218): a start that the steps
  // above leave with none at all is withheld, printed with what was tried
  if (noWaterAtAll(strict)) {
    out.pool = false;
    withheld.push(place.name);
    say(`WITHHELD ${place.W}² ${place.name}: its start has no pumpable water within 20 tiles;${realPool}${everySpot}`);
    return out;
  }
  if (floorsFail) {
    // (a start that cannot keep its wood once its plants stand on ground they live on: never forgotten, never offered)
    withheld.push(place.name);
    say(`WITHHELD ${place.W}² ${place.name}: start fails the floors${plants.replace(/^ +plants on dry soil kept/, " - plants on dry soil kept")}`);
    return out;
  }
  const notes =
    (moved ? `  start moved from ${moved.join(",")} to ${place.start.join(",")}${movedWood}` : "") +
    basin.note +
    mendNote +
    feedNote +
    (spring ? `  spring by the start at ${spring.map((s) => `${s[0]},${s[1]}`).join(" ")}` : "") +
    (planted ? `  ${planted} berry bushes planted by the start` : "") +
    plants +
    groves +
    realPool +
    everySpot;
  return finishPlace(item, place, surveyedRuins, t, notes, out);
}

/** A place whose start, water and plants are settled: its ruin fields laid along its land (D(new-ruins),
 *  src/core/places/ruins.ts) to the survey's count of columns, built and checked, its files and index entry made. The
 *  last step of `runPlace`, and the whole of `--ruins`, which takes the committed place for everything before it: the
 *  ruins are laid on the place with none, so both give the same files, and `--ruins` again changes nothing. */
function finishPlace(item: LibraryItem, place: PlaceData, columns: number, t: number, notes: string, out: Outcome): Outcome {
  const say = (line: string) => void out.lines.push(line);
  const { entries } = out;
  const files = { set: (k: string, b: Uint8Array) => void out.files.push([k, b]) };
  // Ruin fields along the land (D(new-ruins)): the survey's ruled squares go and the generator's laying (D518) lays the
  // place's columns again on its settled ground, objects only. The water and soil they are read from stay as they are
  // (the build throws if the water moved), and a laying that fails a check the place passed is not kept.
  lap("before the ruins");
  const bare = { ...place, ruins: encodeTiles([]) };
  const laid = layRuins(bare, buildChecked(bare), columns);
  place = laid.place;
  const { built, v, strict, blocking, strictFails } = laid.checked;
  const ruinNote = laid.note;
  lap("ruins");
  const bytes = writeTimber(built.file);
  const ms = Math.round(performance.now() - t);
  // the conversion's known faults (every place has them, D200) and the places' own recorded
  // ones are not failures of the tool; anything else is, and so is a map the game would not load
  // (and the start-land preferences, information for a real place, D331)
  const known = new Set<string>([...CONVERSION_FAULT_CHECKS, ...PLACE_FAULT_CHECKS, ...START_LAND, NO_WATER]);
  const unknown = [...blocking.map((c) => c.id), ...strictFails].filter((id) => !known.has(id));
  const loads = v.report.checks.every((c) => c.class !== "load" || !counts(c));
  if (unknown.length) for (const c of [...blocking, ...strict.report.checks.filter(counts)]) if (unknown.includes(c.id)) say(`   ${place.name}: ${c.id}: ${c.message}${c.where?.tiles ? ` at ${JSON.stringify(c.where.tiles.slice(0, 4))}` : ""}`);
  if (unknown.length || !loads) out.failed = true;
  // (whether its start's water is a pool, #1218: the index's `start.water` stays the check's own, a start with no water
  // within its walk, until no offered place's start is without a pool, `PLACES_START_WITHOUT_POOL`: no place gains a fault)
  out.pool = startPool(place, built.heights, built.settle.depth, built.settle.contamination, { thin: FILM_DEPTH, thinShare: FILM_THIN_SHARE }) !== null;
  const faults = PLACE_FAULT_CHECKS.filter((id) => strictFails.includes(id));
  out.fails = [...strictFails];
  say(
    `${unknown.length || !loads ? "FAIL" : "ok  "} ${place.W}² ${String(ms).padStart(6)} ms  ticks ${String(built.settle.ticks).padStart(5)}${built.settle.settled ? "" : " (not settled)"}  ${place.name}` +
      (blocking.length ? `  export: ${blocking.map((c) => c.id).join(", ")}` : "") +
      (strictFails.length ? `  generate profile: ${strictFails.join(", ")}` : "") +
      notes +
      ruinNote,
  );
  const data = gzipSync(strToU8(JSON.stringify(place)), { level: 9, mtime: 0 });
  files.set(`data/${place.id}.json.gz`, data);
  files.set(`cards/${place.id}.jpg`, cardJpeg(built.heights, place.W, place.H, built.settle.depth));
  entries.push({
    id: place.id,
    name: place.name,
    family: place.family,
    familyName: place.familyName,
    plays: place.plays,
    size: place.W,
    metres: place.metres,
    data: `data/${place.id}.json.gz`,
    image: `cards/${place.id}.jpg`,
    bytes: bytes.length,
    sha256: sha256(bytes),
    faults: [...faults],
  });
  if (placeFileName(place) !== mapFileName(place.name)) throw new Error(`${place.name}: file name ${placeFileName(place)}`);
  if (waterMeasure) say(waterLine(built, place));
  // what opens is what the game keeps (planning's rule, #236: no known list): the file's water model settled again,
  // as the first edit settles it, keeps the wet tiles within 1 % and every body of 30 tiles or more; and no film above
  // floor 0. A floor-0 sheet the edge's spill holds (D303) is allowed and counted, over real water and real dry land.
  lap("files");
  const w = waterVerdict(item.id, built, place.id);
  say(w.line);
  out.measure = w.measure;
  if (w.failed) out.failed = true;
  lap("water verdict");
  if (timesOn) say(timesLine());
  return out;
}

/** `columns` ruins laid along a place's land (`placeRuins`; the place has none, `r` its build), seeded from its key,
 *  built and checked: the first of a few layings that fails nothing the place passes without them. None that does is an
 *  error. */
function layRuins(place: PlaceData, r: Checked, columns: number): { place: PlaceData; checked: Checked; note: string } {
  const ground = { depth: r.built.settle.depth, moisture: r.strict.analysis!.moisture, soilContamination: r.strict.analysis!.soilContamination };
  const had = columns;
  const refused: string[] = [];
  for (let round = 0; round < RUIN_ROUNDS; round++) {
    const tiles = placeRuins(place, r.built.heights, ground, round ? `${seedKey(place)}:${round}` : seedKey(place), columns);
    const next = { ...place, ruins: encodeTiles(tiles) };
    const c = buildChecked(next);
    if (!c.built.settle.depth.every((d, i) => d === r.built.settle.depth[i])) throw new Error(`${place.name}: laying the ruins changed the water`);
    const worse = c.strictFails.filter((id) => !r.strictFails.includes(id));
    if (worse.length) {
      refused.push(worse.join(","));
      continue;
    }
    return { place: next, checked: c, note: `  ruins laid along the land: ${had} → ${tiles.length} columns${round ? ` (laying ${round + 1}; earlier ones failed ${refused.join("; ")})` : ""}` };
  }
  throw new Error(`${place.name}: every laying of its ruins fails a check it passed (${refused.join("; ")})`);
}

/** The layings of a place's ruins tried, each from its own seed. */
const RUIN_ROUNDS = 4;

// the places on several processes at once, each taking the next place no process has claimed (the biggest maps first,
// so the longest are never left to the end), each place's outcome written to a file and put back in the library's
// order: the same log, files and verdicts as one process gives, which ran one place after another
const claimDir = arg("claim");
const resume = arg("resume");
if (claimDir) {
  for (const i of claimOrder()) {
    try {
      closeSync(openSync(join(claimDir, `claim-${i}`), "wx"));
    } catch {
      continue;
    }
    const t = performance.now();
    const o = runPlace(items[i]);
    // written whole, then renamed, so a run stopped part-way never leaves half an outcome for `--resume`
    writeFileSync(join(claimDir, `out-${i}.json.part`), JSON.stringify(o ? { ...o, files: o.files.map(([f, b]) => [f, Buffer.from(b).toString("base64")]) } : null));
    renameSync(join(claimDir, `out-${i}.json.part`), join(claimDir, `out-${i}.json`));
    if (o) console.error(`done ${items[i].id} (${o.id}) in ${Math.round((performance.now() - t) / 1000)} s; ${readdirSync(claimDir).filter((f) => /^out-\d+\.json$/.test(f)).length} of ${mine?.size ?? items.length} places`);
  }
  process.exit(0);
}
const outcomes: (Outcome | null)[] = await runShards();
/** The offered places' measure, summed (D(new-films): over real water; over real dry land as the floor-0 sheet and the rest). */
const totals = { real: 0, dry: 0, sheet: 0, rest: 0 };
/** The places kept on today's build (`TODAY_KEPT`), by name. */
const kept: string[] = [];
for (const o of outcomes) {
  if (!o) continue;
  if (TODAY_KEPT[o.id] && o.entries.length) kept.push(o.entries[0].name);
  if (o.measure) for (const k of ["real", "dry", "sheet", "rest"] as const) totals[k] += o.measure[k];
  for (const line of o.lines) console.log(line);
  withheld.push(...o.withheld);
  if (o.failed) failures++;
  for (const e of o.entries) {
    if (entries.some((x) => x.id === e.id)) throw new Error(`two places are called ${e.name}`);
    entries.push(e);
  }
  for (const [k, b] of o.files) files.set(k, b);
}

/** The order the processes claim the places in: the biggest maps first (their settles are the longest), the library's
 *  order among equals. */
function claimOrder(): number[] {
  return placeClaimOrder(items.map((it) => it.size)).filter((i) => !mine || mine.has(i));
}

/** Every place's outcome, in the library's order: on `SHARDS` processes (no more than `--only` names), or on this one for a single place or a machine of one core. */
async function runShards(): Promise<(Outcome | null)[]> {
  const n = Math.min(SHARDS, only ? only.length : (mine?.size ?? items.length));
  if (n <= 1) return items.map((item, i) => (mine && !mine.has(i) ? null : runPlace(item)));
  // `--resume <dir>`: the places' outcomes are kept in <dir> (one file each, as each place ends), and a run started again
  // with the same <dir> and the same code skips the places already done there; a place claimed but never finished (the
  // run stopped) is claimed again
  const dir = resume ?? mkdtempSync(join(tmpdir(), "real-places-"));
  if (resume) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      const m = /^claim-(\d+)$/.exec(f);
      if (m && !existsSync(join(dir, `out-${m[1]}.json`))) rmSync(join(dir, f));
      if (f.endsWith(".part")) rmSync(join(dir, f));
    }
    const kept = readdirSync(dir).filter((f) => /^out-\d+\.json$/.test(f)).length;
    if (kept) console.error(`--resume: ${kept} place(s) already done in ${dir}`);
  }
  try {
    await Promise.all(
      Array.from(
        { length: n },
        (_, k) =>
          new Promise<void>((done, fail) => {
            const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...process.argv.slice(2), "--claim", dir], { stdio: ["ignore", "inherit", "inherit"] });
            child.on("error", fail);
            child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`places process ${k + 1} of ${n} stopped (exit ${code})`))));
          }),
      ),
    );
    return items.map((_, i) => {
      if (mine && !mine.has(i)) return null;
      const raw = JSON.parse(readFileSync(join(dir, `out-${i}.json`), "utf8")) as (Omit<Outcome, "files"> & { files: [string, string][] }) | null;
      return raw ? { ...raw, files: raw.files.map(([f, b]): [string, Uint8Array] => [f, new Uint8Array(Buffer.from(b, "base64"))]) } : null;
    });
  } finally {
    if (!resume) rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `--check --shard i/n`: what a full `--check` says, split so the shards together say it. This shard's places, built
 * fresh: each offered one's data and card are the committed bytes and its index entry is the committed one; each withheld
 * one has no entry, data or card. The whole set, from what is committed (no build, every shard): index.json is the bytes
 * the tool makes from its own entries, those entries are library places in the library's order, once each, and every
 * file under data/ and cards/ is one an entry names. Every place is in exactly one shard, so the shards' union is the
 * full check: the same files compared, the same entries, no place offered that a fresh run withholds or the reverse.
 */
function checkShard(s: Shard): never {
  const differ: string[] = [];
  const committed = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")) as PlaceIndex;
  const byId = new Map(committed.places.map((e) => [e.id, e]));
  let offered = 0;
  for (const o of outcomes) {
    if (!o) continue;
    for (const [k, b] of o.files) {
      const p = join(OUT, k);
      if (!existsSync(p) || sha256(new Uint8Array(readFileSync(p))) !== sha256(b)) differ.push(k);
    }
    for (const e of o.entries) {
      offered++;
      if (JSON.stringify(byId.get(e.id)) !== JSON.stringify(e)) differ.push(`index.json (${e.id})`);
    }
    if (o.withheld.length) {
      if (byId.has(o.id)) differ.push(`index.json (${o.id}, withheld)`);
      for (const k of [`data/${o.id}.json.gz`, `cards/${o.id}.jpg`]) if (existsSync(join(OUT, k))) differ.push(`${k} (withheld)`);
    }
  }
  // the whole set, from the committed files
  const ids = items.map((it) => slug(placeName(it)));
  if (new Set(ids).size !== ids.length) throw new Error("two library places have one id");
  const at = committed.places.map((e) => ids.indexOf(e.id));
  if (at.some((k, j) => k < 0 || (j > 0 && k <= at[j - 1]))) differ.push("index.json (its places are not library places once each, in the library's order)");
  if (sha256(new Uint8Array(readFileSync(join(OUT, "index.json")))) !== sha256(indexBytes(committed.places))) differ.push("index.json (not the tool's index of its own entries)");
  const named = new Set(committed.places.flatMap((e) => [e.data, e.image]));
  for (const dir of ["data", "cards"]) {
    if (!existsSync(join(OUT, dir))) continue;
    for (const f of readdirSync(join(OUT, dir))) if (!named.has(`${dir}/${f}`)) differ.push(`${dir}/${f} (no index entry names it)`);
  }
  console.log(
    `shard ${s.i} of ${s.n}: ${offered} offered, ${withheld.length} withheld${withheld.length ? `: ${withheld.join(", ")}` : ""} of its ${mine!.size} places; ${Math.round((performance.now() - t0) / 1000)} s. ` +
      `The whole set as committed: ${committed.places.length} offered of ${items.length}; left out ${skipped.length} random-land controls (${skipped.map((x) => x.id).join(", ")}).`,
  );
  if (differ.length) {
    console.error(`${OUT} differs from a fresh run: ${differ.join(", ")}. Run npm run places.`);
    process.exit(1);
  }
  console.log(`${OUT} matches a fresh run for shard ${s.i} of ${s.n}, and the whole set's index and files hold together`);
  process.exit(0);
}

if (failures) {
  console.error(`${failures} place(s) failed a check: nothing written`);
  process.exit(1);
}

if (shard) checkShard(shard);

/** index.json's bytes for these entries (the offered places, in the library's order: the gallery keeps it, rounds of one
 *  place per family, so neighbours differ). */
function indexBytes(entries: PlaceIndexEntry[]): Uint8Array {
  const families = [...new Set(entries.map((e) => e.family))].map((id) => ({ id, name: FAMILIES[id].name })).sort((a, b) => a.name.localeCompare(b.name));
  const index: PlaceIndex = { format: 1, count: entries.length, families, sizes: [...new Set(entries.map((e) => e.size))].sort((a, b) => a - b), places: entries };
  return strToU8(JSON.stringify(index, null, 1) + "\n");
}
files.set("index.json", indexBytes(entries));

const total = [...files.values()].reduce((s, b) => s + b.length, 0);
const dataBytes = [...files].filter(([k]) => k.startsWith("data/")).reduce((s, [, b]) => s + b.length, 0);
const cardBytes = [...files].filter(([k]) => k.startsWith("cards/")).reduce((s, [, b]) => s + b.length, 0);
console.log(
  `${entries.length} offered, ${withheld.length} withheld${withheld.length ? `: ${withheld.join(", ")}` : ""}; ${Math.round((performance.now() - t0) / 1000)} s; left out ${skipped.length} random-land controls (${skipped.map((s) => s.id).join(", ")}). ` +
    `Water over real water ${totals.real} tiles, over real dry land ${totals.dry} (floor-0 sheet no deeper than ${FILM_DEPTH} ${totals.sheet}, the rest ${totals.rest}). ` +
    (kept.length ? `${kept.length} kept on today's build: ${kept.join(", ")}. ` : "") +
    `Data ${(dataBytes / 1024).toFixed(0)} KB, cards ${(cardBytes / 1024).toFixed(0)} KB (${(cardBytes / 1024 / Math.max(1, entries.length)).toFixed(1)} KB each), total ${(total / 1024).toFixed(0)} KB.`,
);

if (only) {
  // --write: the places named, their data and card files and their index entries, the rest of the library as it is
  if (!process.argv.includes("--write")) {
    console.log("--only: nothing written");
    process.exit(0);
  }
  const was = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")) as PlaceIndex;
  for (const e of entries) {
    const k = was.places.findIndex((p) => p.id === e.id);
    if (k < 0) throw new Error(`--only --write: ${e.id} is not in ${OUT}/index.json (a new place needs the full run)`);
    was.places[k] = e;
  }
  for (const id of withheld) if (was.places.some((p) => p.name === id)) throw new Error(`--only --write: ${id} would be withheld (the full run withholds it)`);
  for (const [k, b] of files) if (k !== "index.json") writeFileSync(join(OUT, k), b);
  writeFileSync(join(OUT, "index.json"), JSON.stringify(was, null, 1) + "\n");
  console.log(`--only --write: ${entries.length} place(s) written to ${OUT}`);
  process.exit(0);
}
if (check) {
  const differ: string[] = [];
  for (const [k, b] of files) {
    const p = join(OUT, k);
    if (!existsSync(p) || sha256(new Uint8Array(readFileSync(p))) !== sha256(b)) differ.push(k);
  }
  for (const dir of ["data", "cards"]) {
    if (!existsSync(join(OUT, dir))) continue;
    for (const f of readdirSync(join(OUT, dir))) if (!files.has(`${dir}/${f}`)) differ.push(`${dir}/${f} (not made any more)`);
  }
  if (differ.length) {
    console.error(`${OUT} differs from a fresh run: ${differ.join(", ")}. Run npm run places.`);
    process.exit(1);
  }
  console.log(`${OUT} matches a fresh run`);
  process.exit(0);
}
rmSync(OUT, { recursive: true, force: true });
for (const [k, b] of files) {
  const p = join(OUT, k);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, b);
}
console.log(`wrote ${files.size} files to ${OUT}`);
