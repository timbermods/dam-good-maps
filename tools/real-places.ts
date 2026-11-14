// Real places (ROADMAP "Real places", PLAN §20 D136): turn the landscape survey's library
// (investigation/landscapes/library/) into the gallery's own data, under public/real-places/.
//
//   npm run places                         (writes public/real-places/)
//   npm run places -- --check              (writes nothing; fails when the committed files differ)
//   npm run places -- --only near-glencoe  (builds and checks the places named, writes nothing)
//   npm run places -- --shards 1           (one place after another on this process: the places run on one
//                                          process a core by default, the same log, files and verdicts)
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
//   its walk), or one named in WITHHELD_UNTIL until a fault of its land is mended, ships no data, card or
//   index entry; every run prints it by name with its reason and counts it withheld.
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
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync, strToU8 } from "fflate";
import encodeJpeg from "../src/core/format/vendor/jpeg-encoder.js";
import { entityJson } from "../src/core/format/entities";
import { stringify } from "../src/core/format/json";
import {
  buildPlace,
  decodeHeights,
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
import { keepNearest, settlePlants, startWood, startWoodSpecies } from "./lib/placePlants";
import { mendSources } from "./lib/placeSources";
import { DEAD_TREES_KEEP_LOGS, LOG_FLOOR_WALK, LOGS_PER_TREE_SPECIES } from "../src/core/data/logFloor";
import { startWalkField } from "../src/core/resources/baseline";
import { writeTimber } from "../src/core/format/timber";
import { SettleCache } from "../src/core/features/build";
import { namedFile } from "../src/core/gen/pack";
import { relaxEdges } from "../src/core/land/levels";
import { EDITOR_LEVEL } from "../src/core/spec/mapspec";
import { edgeLip } from "../src/core/water/edgeLip";
import { placeSprings } from "../src/core/places/spring";
import { placeStartSpots, startTiles } from "../src/core/places/start";
import { thumbnailRgba } from "../src/core/render/shade";
import { validateMap } from "../src/core/validate/checks";
import type { CheckResult } from "../src/core/validate/report";

const LIBRARY = "investigation/landscapes/library";
/** The processes the places run on at once (`--shards n` sets it; one a core by default; 1 runs them here, in turn). */
const SHARDS = Math.max(1, Number(process.argv.includes("--shards") ? process.argv[process.argv.indexOf("--shards") + 1] : availableParallelism()));
const OUT = "public/real-places";
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
/** Places withheld by name until a fault of their land is mended, with the reason every run prints. Near Dinaric
 *  karst Plitvice's start meets every floor since the start's move ranks by the land floors, but its conversion puts
 *  a source in another's flow (`water.source_in_flow`); it left `PLACES_SOURCES_IN_FLOW` (tests/contract/placesCommon.ts,
 *  whose note says Real places 2 places sources only at heads) when #1094 withheld it, and that list never grows:
 *  planning's ruling on #1096. */
const WITHHELD_UNTIL: Record<string, string> = {
  "near-dinaric-karst-plitvice": "withheld until water.source_in_flow is mended (sources at heads only)",
};
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
  "n101-128-120-normalised-16": "Near Death Valley",
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
  const name = (RENAME[item.id] ?? item.name.replace(/, \d+ m per tile$/, "").replace(/ \((north|south|east|west|northeast|northwest|southeast|southwest) sample\)$/, "")).trim();
  if (!/^Near /.test(name)) throw new Error(`${item.id}: unexpected name ${name}`);
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
    place: name.replace(/^Near /, ""),
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

/** A place built and checked: the export profile (`v`, what the editor's export asks) and every
 *  check of the generate profile (`strict`), with the failures of each that count. */
/** The settles of the place being run (`runPlace`): its candidates (a start moved, plants moved or planted, a spring
 *  added) are each built and checked, and those whose objects alone differ leave the water as it was, so its settle is
 *  made once, not once a candidate (Katherine Gorge: 44 builds of 7.6 s each). */
let settles = new SettleCache();
function buildChecked(place: PlaceData) {
  const built = buildPlace(place, settles);
  const v = validatePlace(built);
  const strict = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
  return { built, v, strict, blocking: v.report.checks.filter(counts), strictFails: strict.report.checks.filter(counts).map((c) => c.id) };
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
const only = arg("only")?.split(",") ?? null;
const library = JSON.parse(readFileSync(join(LIBRARY, "index.json"), "utf8")) as { items: LibraryItem[] };
const items = library.items.filter((it) => it.family !== "random");
const skipped = library.items.filter((it) => it.family === "random");

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
}

/** One place, built, mended and checked (null: not among `--only`'s). */
function runPlace(item: LibraryItem): Outcome | null {
  const fx = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(join(LIBRARY, item.fixture)))))) as Fixture;
  const out: Outcome = { id: "", lines: [], withheld: [], entries: [], files: [], failed: false };
  settles = new SettleCache();
  const say = (line: string) => void out.lines.push(line);
  const { withheld, entries } = out;
  const files = { set: (k: string, b: Uint8Array) => void out.files.push([k, b]) };
  let place = toPlace(item, fx);
  if (only && !only.includes(place.id)) return null;
  out.id = place.id;
  if (WITHHELD_UNTIL[place.id]) {
    withheld.push(place.name);
    say(`WITHHELD ${place.W}² ${place.name}: ${WITHHELD_UNTIL[place.id]}`);
    return out;
  }
  const t = performance.now();
  // Sources only at heads (D171, tools/lib/placeSources.ts): a source in another's flow merges into the upstream source
  // where that file's rules allow it; the rest stay, and the place keeps the fault until none is left. (The sealed-land
  // comparison for the start's water below is the survey's own, so it keeps the unmended sources.)
  const surveyed = place;
  const mend = mendSources(place);
  place = mend.place;
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
  const free = new Set(["start.wood", "start.food", "start.water", ...START_LAND]);
  // (water first, then the land floors, then the starting-logs floor, then the berries, then the wood:
  // a spot or spring that costs the start its berries ranks below one that keeps them)
  const score = (fails: string[]) =>
    (fails.includes("start.water") ? 32 : 0) + (fails.some((id) => LAND_FLOORS.includes(id)) ? 16 : 0) + (fails.includes("start.wood_floor") ? 4 : 0) + (fails.includes("start.food") ? 2 : 0) + (fails.includes("start.wood") ? 1 : 0);
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
  let spring: [number, number, number][] | null = null;
  if (strictFails.includes("start.water") && !buildChecked({ ...opened, heights: encodeHeights(fx.heights) }).strictFails.includes("start.water")) {
    const had = new Set(strictFails);
    let best: { add: [number, number, number][]; r: ReturnType<typeof buildChecked>; score: number } | null = null;
    for (const [rule, tries] of SPRING_TRIES) {
      for (const add of placeSprings(place, built.heights, built.settle.depth, { rule, tries })) {
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
  if (floorsFail) {
    // (a start that cannot keep its wood once its plants stand on ground they live on: never forgotten, never offered)
    withheld.push(place.name);
    say(`WITHHELD ${place.W}² ${place.name}: start fails the floors${plants.replace(/^ +plants on dry soil kept/, " - plants on dry soil kept")}`);
    return out;
  }
  const bytes = writeTimber(built.file);
  const ms = Math.round(performance.now() - t);
  // the conversion's known faults (every place has them, D200) and the places' own recorded
  // ones are not failures of the tool; anything else is, and so is a map the game would not load
  // (and the start-land preferences, information for a real place, D331)
  const known = new Set<string>([...CONVERSION_FAULT_CHECKS, ...PLACE_FAULT_CHECKS, ...START_LAND]);
  const unknown = [...blocking.map((c) => c.id), ...strictFails].filter((id) => !known.has(id));
  const loads = v.report.checks.every((c) => c.class !== "load" || !counts(c));
  if (unknown.length) for (const c of [...blocking, ...strict.report.checks.filter(counts)]) if (unknown.includes(c.id)) say(`   ${place.name}: ${c.id}: ${c.message}${c.where?.tiles ? ` at ${JSON.stringify(c.where.tiles.slice(0, 4))}` : ""}`);
  if (unknown.length || !loads) out.failed = true;
  const faults = PLACE_FAULT_CHECKS.filter((id) => strictFails.includes(id));
  say(
    `${unknown.length || !loads ? "FAIL" : "ok  "} ${place.W}² ${String(ms).padStart(6)} ms  ticks ${String(built.settle.ticks).padStart(5)}${built.settle.settled ? "" : " (not settled)"}  ${place.name}` +
      (blocking.length ? `  export: ${blocking.map((c) => c.id).join(", ")}` : "") +
      (strictFails.length ? `  generate profile: ${strictFails.join(", ")}` : "") +
      (moved ? `  start moved from ${moved.join(",")} to ${place.start.join(",")}${movedWood}` : "") +
      mendNote +
      (spring ? `  spring by the start at ${spring.map((s) => `${s[0]},${s[1]}`).join(" ")}` : "") +
      (planted ? `  ${planted} berry bushes planted by the start` : "") +
      plants,
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
  if (placeFileName(place) !== namedFile(place.name)) throw new Error(`${place.name}: file name ${placeFileName(place)}`);
  return out;
}

// the places on several processes at once, each taking the next place no process has claimed (the biggest maps first,
// so the longest are never left to the end), each place's outcome written to a file and put back in the library's
// order: the same log, files and verdicts as one process gives, which ran one place after another
const claimDir = arg("claim");
if (claimDir) {
  for (const i of claimOrder()) {
    try {
      closeSync(openSync(join(claimDir, `claim-${i}`), "wx"));
    } catch {
      continue;
    }
    const o = runPlace(items[i]);
    writeFileSync(join(claimDir, `out-${i}.json`), JSON.stringify(o ? { ...o, files: o.files.map(([f, b]) => [f, Buffer.from(b).toString("base64")]) } : null));
  }
  process.exit(0);
}
const outcomes: (Outcome | null)[] = await runShards();
for (const o of outcomes) {
  if (!o) continue;
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
  return items.map((_, i) => i).sort((a, b) => items[b].size - items[a].size || a - b);
}

/** Every place's outcome, in the library's order: on `SHARDS` processes, or on this one for `--only` or a machine of one core. */
async function runShards(): Promise<(Outcome | null)[]> {
  const n = only ? 1 : Math.min(SHARDS, items.length);
  if (n <= 1) return items.map((item) => runPlace(item));
  const dir = mkdtempSync(join(tmpdir(), "real-places-"));
  try {
    await Promise.all(
      Array.from(
        { length: n },
        (_, k) =>
          new Promise<void>((done, fail) => {
            const child = spawn(process.execPath, [...process.execArgv, process.argv[1], "--claim", dir], { stdio: ["ignore", "inherit", "inherit"] });
            child.on("error", fail);
            child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`places process ${k + 1} of ${n} stopped (exit ${code})`))));
          }),
      ),
    );
    return items.map((_, i) => {
      const raw = JSON.parse(readFileSync(join(dir, `out-${i}.json`), "utf8")) as (Omit<Outcome, "files"> & { files: [string, string][] }) | null;
      return raw ? { ...raw, files: raw.files.map(([f, b]): [string, Uint8Array] => [f, new Uint8Array(Buffer.from(b, "base64"))]) } : null;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures) {
  console.error(`${failures} place(s) failed a check: nothing written`);
  process.exit(1);
}

// the gallery keeps the library's order: rounds of one place per family, so neighbours differ
const families = [...new Set(entries.map((e) => e.family))].map((id) => ({ id, name: FAMILIES[id].name })).sort((a, b) => a.name.localeCompare(b.name));
const index: PlaceIndex = { format: 1, count: entries.length, families, sizes: [...new Set(entries.map((e) => e.size))].sort((a, b) => a - b), places: entries };
files.set("index.json", strToU8(JSON.stringify(index, null, 1) + "\n"));

const total = [...files.values()].reduce((s, b) => s + b.length, 0);
const dataBytes = [...files].filter(([k]) => k.startsWith("data/")).reduce((s, [, b]) => s + b.length, 0);
const cardBytes = [...files].filter(([k]) => k.startsWith("cards/")).reduce((s, [, b]) => s + b.length, 0);
console.log(
  `${entries.length} offered, ${withheld.length} withheld${withheld.length ? `: ${withheld.join(", ")}` : ""}; ${Math.round((performance.now() - t0) / 1000)} s; left out ${skipped.length} random-land controls (${skipped.map((s) => s.id).join(", ")}). ` +
    `Data ${(dataBytes / 1024).toFixed(0)} KB, cards ${(cardBytes / 1024).toFixed(0)} KB (${(cardBytes / 1024 / Math.max(1, entries.length)).toFixed(1)} KB each), total ${(total / 1024).toFixed(0)} KB.`,
);

if (only) {
  console.log("--only: nothing written");
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
    console.error(`public/real-places differs from a fresh run: ${differ.join(", ")}. Run npm run places.`);
    process.exit(1);
  }
  console.log("public/real-places matches a fresh run");
  process.exit(0);
}
rmSync(OUT, { recursive: true, force: true });
for (const [k, b] of files) {
  const p = join(OUT, k);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, b);
}
console.log(`wrote ${files.size} files to ${OUT}`);
