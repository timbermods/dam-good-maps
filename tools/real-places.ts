// Real places (ROADMAP "Real places", PLAN §20 D136): turn the landscape survey's library
// (investigation/landscapes/library/) into the gallery's own data, under public/real-places/.
//
//   npm run places                         (writes public/real-places/)
//   npm run places -- --check              (writes nothing; fails when the committed files differ)
//   npm run places -- --only near-glencoe  (builds and checks the places named, writes nothing)
//
// For every named place in the library (the three random-land controls are survey controls, not
// places, and stay out) it writes:
// - data/<id>.json.gz: the place's heights, water sources, start and planted objects, with its
//   name, landform family, scale and a plain line on how it plays (src/core/places/place.ts);
// - cards/<id>.jpg: the card's picture, our own top-down render (src/core/render/shade.ts) of the
//   map with its settled water, north up;
// - index.json: every place for the gallery page, with the sha256 of its .timber and the faults
//   its own map has (`faults`, from the generate profile's checks): the page leaves out the places
//   whose start reaches no fed water until they are fixed (D421, src/core/places/place.ts).
// Each .timber is built with src/core/places (build, settle, validate, write) and must pass the
// export profile and every check of the generate profile but the known faults (the conversion's, which
// every place has, and each place's own, recorded in `faults`); the tool stops on any other that fails.
// Objects only, never the land (D245, D331): a start moves to the best spot its land offers, a start
// that lost its water gets a spring, a start short of berries gets bushes, and plants on soil that
// kills them move to moist ground close by or go (#523, tools/lib/placePlants.ts), the start's wood and
// berries first. Everything it writes is the same bytes on every run.
//
// The product never imports from investigation/ (tests/unit/boundaries.test.ts); this tool reads the
// library's data files at run time, as tools may.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { keepNearest, settlePlants, startOaks } from "./lib/placePlants";
import { LOG_FLOOR_WALK, LOGS_PER_TREE_SPECIES } from "../src/core/data/logFloor";
import { startWalkField } from "../src/core/resources/baseline";
import { writeTimber } from "../src/core/format/timber";
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
/** The springs tried by a start that lost its water: [the walk the spring stands within plus 4, the
 *  places tried], nearer ones first. */
const SPRING_TRIES: [number, number][] = [
  [20, 6],
  [26, 12],
];
/** How far a plant on soil that kills it may move to ground where it lives (tiles, either way): the
 *  forest shifts to the moist ground beside where it stood, not across the map. */
const PLANT_REACH = 4;
/** The logs an oak gives, and the walk from the start the oaks that give back the start's lost logs
 *  stand within (the `start.wood` fix's: 2 inside the 20 tiles the check counts). */
const OAK_LOGS = LOGS_PER_TREE_SPECIES.Oak;
const OAK_WALK = 18;

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
  return { ...place, start: at, bushes: off(place.bushes), pines: off(place.pines), birches: off(place.birches), oaks: off(place.oaks), deadPines: off(place.deadPines), ruins: off(place.ruins) };
}

const counts = (c: CheckResult) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate;

/** A place built and checked: the export profile (`v`, what the editor's export asks) and every
 *  check of the generate profile (`strict`), with the failures of each that count. */
function buildChecked(place: PlaceData) {
  const built = buildPlace(place);
  const v = validatePlace(built);
  const strict = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
  return { built, v, strict, blocking: v.report.checks.filter(counts), strictFails: strict.report.checks.filter(counts).map((c) => c.id) };
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
const t0 = performance.now();
for (const item of items) {
  const fx = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(join(LIBRARY, item.fixture)))))) as Fixture;
  let place = toPlace(item, fx);
  if (only && !only.includes(place.id)) continue;
  if (entries.some((e) => e.id === place.id)) throw new Error(`two places are called ${place.name}`);
  const t = performance.now();
  let { built, v, strict, blocking, strictFails } = buildChecked(place);
  // A start the opened rivers flood, or that reaches no water a source feeds, moves (D245: the best
  // spot its own land offers; moving it toward water is fine): the spots nearest it that stay dry and
  // have a shore near (a flooded start where the place has none: the nearest dry ones), each built
  // and checked, then spots with a longer walk to their shore; the best wins, water first (D245's
  // water floor), then the wood and berries by it, then the nearest. Never one that falls below the
  // starting-logs floor it met (D224) or fails anything else it passed but the wood, the berries
  // and the start land (information, D331).
  const opened = place;
  let moved: [number, number] | null = null;
  const dry = strictFails.includes("start.dry");
  const free = new Set(["start.wood", "start.food", "start.water", "start.farmland", "start.level_land"]);
  // (water first, then the starting-logs floor, then the berries, then the wood: a spot or spring
  // that costs the start its berries ranks below one that keeps them)
  const score = (fails: string[]) => (fails.includes("start.water") ? 8 : 0) + (fails.includes("start.wood_floor") ? 4 : 0) + (fails.includes("start.food") ? 2 : 0) + (fails.includes("start.wood") ? 1 : 0);
  for (const walk of [undefined, LONG_SHORE_WALK]) {
    if (!strictFails.includes("start.dry") && !strictFails.includes("start.water")) break;
    const had = new Set(strictFails);
    const spots = placeStartSpots(place, built.heights, built.settle.depth, built.settle.contamination, { walk });
    if (dry && !walk) spots.push(...placeStartSpots(place, built.heights, built.settle.depth, built.settle.contamination, { shore: false, limit: 4 }));
    let best: { at: [number, number]; r: ReturnType<typeof buildChecked>; score: number } | null = null;
    const bar = had.has("start.dry") ? Infinity : score(strictFails);
    for (const at of spots) {
      const r = buildChecked(withStart(place, at));
      if (r.strictFails.some((id) => !had.has(id) && !free.has(id))) continue;
      if (!had.has("start.dry") && r.strictFails.includes("start.water")) continue;
      const sc = score(r.strictFails);
      if (sc >= bar || (best && sc >= best.score)) continue;
      best = { at, r, score: sc };
      if (sc === 0) break;
    }
    if (best) {
      moved ??= place.start;
      place = withStart(place, best.at);
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
  // loses (the wood checks count a dying tree's logs: a dead tree keeps them) come back as oaks on the
  // moist ground nearest it, as the `start.wood` fix plants them; where there is too little of that,
  // the dying trees nearest the start stay, and the log says so.
  const survive = strict.report.checks.find((c) => c.id === "plants.survive");
  let plants = "";
  if (survive && counts(survive) && strict.analysis) {
    const value = (s: typeof strict, id: string) => Number(s.report.checks.find((c) => c.id === id)?.value ?? 0);
    const limit = (id: string) => Number(strict.report.checks.find((c) => c.id === id)?.limit ?? 0);
    const bar = { wood: Math.min(value(strict, "start.wood"), limit("start.wood")), floor: Math.min(value(strict, "start.wood_floor"), limit("start.wood_floor")), food: value(strict, "start.food") };
    const short = (s: typeof strict) => Math.max(bar.wood - value(s, "start.wood"), bar.floor - value(s, "start.wood_floor"));
    const g = { moisture: strict.analysis.moisture, contamination: strict.analysis.soilContamination, depth: built.settle.depth };
    const near = strict.analysis.startDistance;
    const settled = settlePlants(place, g, near, PLANT_REACH);
    let next = settled.place;
    let r = buildChecked(next);
    let oaks = 0;
    let kept = 0;
    let moves = settled.moves;
    const moved = (to: boolean) => moves.filter((m) => m.to >= 0 === to).length;
    if (short(r.strict) > 0) {
      const walk = startWalkField(built.heights, place.W, place.H, placeEntities(next, built.heights), { x: place.start[0] + 1, y: place.start[1] + 1 });
      // (the walk here is the tool's estimate of the check's: each step is built and checked again)
      for (let round = 0; round < 4 && short(r.strict) > 0; round++) {
        const o = startOaks(next, g, near, walk, Math.ceil(short(r.strict) / OAK_LOGS), OAK_WALK);
        if (!o.planted) break;
        next = o.place;
        oaks += o.planted;
        r = buildChecked(next);
      }
      for (let round = 0; round < 6 && short(r.strict) > 0; round++) {
        const k = keepNearest(next, moves, walk, LOG_FLOOR_WALK, short(r.strict), LOGS_PER_TREE_SPECIES);
        if (!k.kept) break;
        next = k.place;
        moves = k.moves;
        kept += k.kept;
        r = buildChecked(next);
      }
    }
    if (!r.built.settle.depth.every((d, i) => d === built.settle.depth[i])) throw new Error(`${place.name}: moving plants changed the water`);
    const left = r.strict.report.checks.find((c) => c.id === "plants.survive");
    const meets = short(r.strict) <= 0 && value(r.strict, "start.food") >= bar.food && !r.strictFails.some((id) => !strictFails.includes(id));
    plants = meets
      ? `  plants on dry soil ${survive.value} → ${left && counts(left) ? left.value : 0}: ${moved(true)} moved, ${moved(false)} gone` +
        (oaks ? `, ${oaks} oaks planted by the start` : "") +
        (kept ? `, ${kept} dying trees kept for the start's wood` : "")
      : `  plants on dry soil kept (${survive.value}): moving them costs the start (` +
        [
          ...r.strictFails.filter((id) => !strictFails.includes(id)),
          ...(value(r.strict, "start.wood") < bar.wood ? [`wood ${value(r.strict, "start.wood")} of ${bar.wood}`] : []),
          ...(value(r.strict, "start.wood_floor") < bar.floor ? [`floor ${value(r.strict, "start.wood_floor")} of ${bar.floor}`] : []),
          ...(value(r.strict, "start.food") < bar.food ? [`berries ${value(r.strict, "start.food")} of ${bar.food}`] : []),
        ].join(", ") +
        ")";
    if (meets) {
      place = next;
      ({ built, v, strict, blocking, strictFails } = r);
    }
  }
  const bytes = writeTimber(built.file);
  const ms = Math.round(performance.now() - t);
  // the conversion's known faults (every place has them, D200) and the places' own recorded
  // ones are not failures of the tool; anything else is, and so is a map the game would not load
  // (and the start-land preferences, information for a real place, D331)
  const known = new Set<string>([...CONVERSION_FAULT_CHECKS, ...PLACE_FAULT_CHECKS, "start.farmland", "start.level_land"]);
  const unknown = [...blocking.map((c) => c.id), ...strictFails].filter((id) => !known.has(id));
  const loads = v.report.checks.every((c) => c.class !== "load" || !counts(c));
  if (unknown.length) for (const c of [...blocking, ...strict.report.checks.filter(counts)]) if (unknown.includes(c.id)) console.log(`   ${place.name}: ${c.id}: ${c.message}${c.where?.tiles ? ` at ${JSON.stringify(c.where.tiles.slice(0, 4))}` : ""}`);
  if (unknown.length || !loads) failures++;
  const faults = PLACE_FAULT_CHECKS.filter((id) => strictFails.includes(id));
  console.log(
    `${unknown.length || !loads ? "FAIL" : "ok  "} ${place.W}² ${String(ms).padStart(6)} ms  ticks ${String(built.settle.ticks).padStart(5)}${built.settle.settled ? "" : " (not settled)"}  ${place.name}` +
      (blocking.length ? `  export: ${blocking.map((c) => c.id).join(", ")}` : "") +
      (strictFails.length ? `  generate profile: ${strictFails.join(", ")}` : "") +
      (moved ? `  start moved from ${moved.join(",")} to ${place.start.join(",")}` : "") +
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
  `${entries.length} places in ${Math.round((performance.now() - t0) / 1000)} s; left out ${skipped.length} random-land controls (${skipped.map((s) => s.id).join(", ")}). ` +
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
