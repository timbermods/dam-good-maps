// Shared by the Real places contract tests (ROADMAP "Real places", PLAN §20 D136): the gallery's
// index and data (public/real-places/, written by tools/real-places.ts), and the check every place
// must pass. The builds are split over a few test files so they run side by side.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { namedFile } from "../../src/core/gen/pack";
import { readTimber } from "../../src/core/format/timber";
import { decodePlaceFile, PLACE_FAULT_CHECKS, placeTimber, type PlaceData, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";
import { validateMap } from "../../src/core/validate/checks";
import type { CheckResult } from "../../src/core/validate/report";

export const PLACES_DIR = "public/real-places";
export const INDEX = JSON.parse(readFileSync(`${PLACES_DIR}/index.json`, "utf8")) as PlaceIndex;

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export function placeData(entry: PlaceIndexEntry): PlaceData {
  return decodePlaceFile(new Uint8Array(readFileSync(`${PLACES_DIR}/${entry.data}`)));
}

/** Checks that fail and count: not advisory, applicable, not approximate. */
export const failing = (checks: readonly CheckResult[]) => checks.filter((c) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate).map((c) => `${c.id}: ${c.message}`);

/** No edge walls (Kyler, 2026-09-25, D151): the places are built from the survey's unsealed land
 *  (tools/real-places.ts), so no place has the sealed border's wall, which `terrain.edge_wall`
 *  would flag, a principle that blocks the generate profile and warns in the export profile (D3). */
export const PLACES_HAVE_EDGE_WALLS = false;

/** Water whose source has no outlet (`water.outflow`, a design check of the generate profile): on
 *  these places a source's water spreads over flat land and dries before it reaches the edge or a
 *  lake. Information for a real place (D245): its own land, recorded in `faults` with no note. */
export const PLACES_WATER_WITHOUT_OUTLET = new Set([
  "near-tibetan-plateau",
]);

/** Water that keeps moving (D245, `water.settles`): under the game's water rules (D311) these places' water has not
 *  settled within the settle's days; each keeps its own land and water with the card note "Water keeps moving". */
export const PLACES_WATER_KEEPS_MOVING = new Set([
  "near-niagara-falls", "near-twelve-apostles",
]);

/** Water sources start rivers (D171): the places whose conversion puts a source inside a flow
 *  another source already feeds (`water.source_in_flow`, a design check: it fails the generate
 *  profile; in the export profile it does not apply, since sources go anywhere in the editor,
 *  D184). The mend (tools/lib/placeSources.ts) merges a flagged source into its head where it can; what stays is here:
 *  sources with no head within 20 tiles and merges that move the depth below too far.
 *  The list only shrinks. */
export const PLACES_SOURCES_IN_FLOW = new Set([
  "near-blyde-river-canyon", "near-brahmaputra-near-majuli", "near-chilean-aysen-fjord", "near-chocolate-hills",
  "near-death-valley", "near-ethiopian-highlands", "near-finnish-saimaa", "near-geirangerfjord", "near-glencoe",
  "near-iguazu-falls", "near-kenai-aialik-bay", "near-lofoten", "near-mamore-river", "near-milford-sound",
  "near-monument-valley", "near-mount-fuji", "near-niagara-falls", "near-painted-desert", "near-phong-nha",
  "near-rhine-and-moselle", "near-roaring-river-fan", "near-sete-cidades", "near-skeidara-outwash",
  "near-taklimakan-kunlun-fan", "near-tara-gorge", "near-toklat-river", "near-twelve-apostles",
]);

/** A mine site on every map (Kyler, 2026-09-25): the places as converted for real-places-done have
 *  none, which `resources.mine_site` flags (a playability check: it warns in the export profile the
 *  places are built in, so the gallery keeps working). Real places 2 places them with the resource
 *  baseline (src/core/resources/plan.ts) and turns this to false. */
export const PLACES_LACK_MINE_SITES = true;

/** A badwater source on every map (Kyler, 2026-09-26, D200): the places as converted have none,
 *  which `resources.badwater_source` flags (a playability check: it warns in the export profile).
 *  Real places 2 places them with `planMapResources`'s springs and turns this to false. */
export const PLACES_LACK_BADWATER = true;

/** Starting wood (D227: Normal asks for 200 logs within 20 tiles' walk, 80 before) and the
 *  starting-logs floor (D224, D227: 178 logs within 40 tiles' walk at every difficulty): the places
 *  as converted plant their starts' groves for the old 80 logs, so these places fall short of
 *  `start.wood` (a playability check: it warns in the export profile, and the gallery's download
 *  works), and these fall below the floor (`start.wood_floor`, the same). Real places 2 plants for
 *  both, in varied, natural ways (D229), and empties the lists. */
export const PLACES_SHORT_OF_WOOD = new Set([
  "near-alaknanda-and-bhagirathi", "near-brahmaputra-near-majuli", "near-chocolate-hills", "near-colorado-plateau",
  "near-godavari-delta", "near-kenai-aialik-bay", "near-lauterbrunnen", "near-li-river-yangshuo",
  "near-mount-roraima",
]);
export const PLACES_BELOW_THE_FLOOR = new Set([
  "near-alaknanda-and-bhagirathi", "near-brahmaputra-near-majuli", "near-colorado-plateau", "near-godavari-delta",
  "near-kenai-aialik-bay", "near-lauterbrunnen",
]);

/** The start's water is never a sealed puddle (Kyler's D302, M9a), and a start has water a pump
 *  reaches: these places' starts reach no water a source feeds, which `start.water` refuses (a
 *  playability check: it warns in the export profile, and the gallery's download works). Their water
 *  was a puddle the canonical settle's pre-fill left in a hollow no source's water reaches, water
 *  from nowhere that a Normal drought emptied; since D385 the settle takes such water away, so most
 *  of these starts now reach none (Near Dinaric Karst Plitvice and Near Mount Taranaki joined the
 *  list then). With the edges open (D151) a start whose land offers a spot with water moved there,
 *  and one that had water on the sealed land got a spring by it (tools/real-places.ts). Real places
 *  2 gives the rest their water (D300) and empties the list. */
export const PLACES_START_WITHOUT_FED_WATER = new Set([
  "near-capitol-reef", "near-cliffs-of-moher", "near-colca-canyon", "near-death-valley", "near-deccan-plateau",
  "near-drumheller", "near-english-lake-district", "near-fish-river-canyon", "near-glencoe", "near-iguazu-falls",
  "near-kaieteur-falls", "near-kinabatangan-river", "near-mount-etna", "near-mount-mayon", "near-ngorongoro",
  "near-niagara-falls", "near-phong-nha", "near-twelve-apostles", "near-yosemite-valley",
]);

/** Plants that die (D385): the conversion planted these places' trees and bushes on ground the
 *  pre-fill's puddles kept moist (water from nowhere, see above); with that water gone, some stand on
 *  dry soil, which `plants.survive` flags (a playability check: it warns in the export profile).
 *  With the edges open (D151) the water the sealed border held drained too. Such plants now move to
 *  moist ground close by or go (#523, tools/lib/placePlants.ts); the trees the start's wood needs
 *  stay where they stood, dead (a dead tree keeps its logs), and where the start is still short the
 *  wood is planted on the moist ground nearest it. A start with no moist ground within its walk
 *  cannot move its plants without costing the fast wood (`start.wood_fast`): such a place ships no
 *  data (tools/real-places.ts withholds it), so no place offered has plants on dry soil and the
 *  list is empty. */
export const PLACES_PLANTS_ON_DRY_SOIL = new Set<string>();

/** Berries at the start (D385): these places' starting berry bushes stood on the same puddles'
 *  moist ground, so `start.food` (a playability check, a warning in the export profile) now finds
 *  too few living ones. A start short of berries gets the bushes the check's own fix plants
 *  (tools/real-places.ts); these starts have no free moist soil within their walk for it (a dry
 *  start, or a spring's thin sheet over the land round it). Real places 2 plants them by the
 *  settled water and empties the list. */
export const PLACES_SHORT_OF_BERRIES = new Set([
  "near-alaknanda-and-bhagirathi", "near-colorado-plateau", "near-rhine-and-moselle", "near-uvac-river",
]);

/** The failing checks of a place, its known faults apart (the conversion's edge wall and sources in
 *  flow, water without an outlet, water that keeps moving, the missing mine site and badwater source, the starting wood, the start's water and
 *  berries, and plants on dry soil), and which of them fail. */
export function placeFailures(checks: readonly CheckResult[]): { other: string[]; edgeWall: boolean; sourceInFlow: boolean; outflow: boolean; settles: boolean; mineSite: boolean; badwater: boolean; wood: boolean; floor: boolean; startWater: boolean; food: boolean; plants: boolean } {
  const all = failing(checks);
  const known = (f: string) =>
    f.startsWith("terrain.edge_wall:") ||
    f.startsWith("water.source_in_flow:") ||
    f.startsWith("water.outflow:") ||
    f.startsWith("water.settles:") ||
    f.startsWith("resources.mine_site:") ||
    f.startsWith("resources.badwater_source:") ||
    f.startsWith("start.wood:") ||
    f.startsWith("start.wood_floor:") ||
    // (item 47's start land is a preference for real places, D331: a place whose start lacks it
    // still opens; its conversion picks a start with it where one qualifies, when it resumes)
    // (and the start's floors, D515: a real place warns where its start falls short, D245)
    f.startsWith("start.farmland:") ||
    f.startsWith("start.level_land:") ||
    f.startsWith("start.reach:") ||
    f.startsWith("start.forester:") ||
    f.startsWith("start.wood_fast:") ||
    f.startsWith("start.water:") ||
    f.startsWith("start.food:") ||
    f.startsWith("plants.survive:");
  return {
    other: all.filter((f) => !known(f)),
    edgeWall: all.some((f) => f.startsWith("terrain.edge_wall:")),
    sourceInFlow: all.some((f) => f.startsWith("water.source_in_flow:")),
    outflow: all.some((f) => f.startsWith("water.outflow:")),
    settles: all.some((f) => f.startsWith("water.settles:")),
    mineSite: all.some((f) => f.startsWith("resources.mine_site:")),
    badwater: all.some((f) => f.startsWith("resources.badwater_source:")),
    wood: all.some((f) => f.startsWith("start.wood:")),
    floor: all.some((f) => f.startsWith("start.wood_floor:")),
    startWater: all.some((f) => f.startsWith("start.water:")),
    food: all.some((f) => f.startsWith("start.food:")),
    plants: all.some((f) => f.startsWith("plants.survive:")),
  };
}

/** Every place in shard `k` of `n`: its .timber, built as the page builds it (build, settle,
 *  validate, write), passes the export profile and every check of the generate profile but its known
 *  faults, which flag it as long as the places have them (`PLACES_HAVE_EDGE_WALLS`,
 *  `PLACES_SOURCES_IN_FLOW`, `PLACES_WATER_WITHOUT_OUTLET`, `PLACES_LACK_MINE_SITES`, `PLACES_LACK_BADWATER`, `PLACES_SHORT_OF_WOOD`,
 *  `PLACES_BELOW_THE_FLOOR`, `PLACES_START_WITHOUT_FED_WATER`, `PLACES_SHORT_OF_BERRIES`,
 *  `PLACES_PLANTS_ON_DRY_SOIL`), and is the same bytes as the index records. */
export function checkShard(k: number, n: number): void {
  const places = INDEX.places.filter((_, i) => i % n === k);
  describe(`real places ${k + 1} of ${n}: every map validates and is the same file`, () => {
    it.each(places.map((p) => [p.name, p] as const))("%s", (_name, entry) => {
      const r = placeTimber(placeData(entry));
      expect(r.validation.report.profile).toBe("export");
      // the export profile passes: an edge wall, a principle (D151), only warns there (D3), and
      // placeTimber refuses only what would not load
      expect(r.validation.report.passed).toBe(true);
      expect(r.fileName).toBe(namedFile(entry.name));
      // the written file, read back: every check of the strictest profile, on its own settle
      const file = readTimber(r.bytes);
      const v = validateMap(file, { profile: "generate", designedFor: "normal", features: [], water: { model: r.validation.model!, settled: r.validation.water! } });
      const f = placeFailures(v.report.checks);
      expect(f.other).toEqual([]);
      expect(f.edgeWall).toBe(PLACES_HAVE_EDGE_WALLS);
      expect(f.sourceInFlow).toBe(PLACES_SOURCES_IN_FLOW.has(entry.id));
      expect(f.outflow).toBe(PLACES_WATER_WITHOUT_OUTLET.has(entry.id));
      expect(f.settles).toBe(PLACES_WATER_KEEPS_MOVING.has(entry.id));
      expect(f.mineSite).toBe(PLACES_LACK_MINE_SITES);
      expect(f.badwater).toBe(PLACES_LACK_BADWATER);
      expect(f.wood).toBe(PLACES_SHORT_OF_WOOD.has(entry.id));
      expect(f.floor).toBe(PLACES_BELOW_THE_FLOOR.has(entry.id));
      expect(f.startWater).toBe(PLACES_START_WITHOUT_FED_WATER.has(entry.id));
      expect(f.food).toBe(PLACES_SHORT_OF_BERRIES.has(entry.id));
      expect(f.plants).toBe(PLACES_PLANTS_ON_DRY_SOIL.has(entry.id));
      // the faults the index records are the ones this build has: the gallery hides by them (D421)
      const has: Record<(typeof PLACE_FAULT_CHECKS)[number], boolean> = { "water.source_in_flow": f.sourceInFlow, "water.outflow": f.outflow, "water.settles": f.settles, "start.wood": f.wood, "start.wood_floor": f.floor, "start.water": f.startWater, "start.food": f.food, "plants.survive": f.plants };
      expect(entry.faults).toEqual(PLACE_FAULT_CHECKS.filter((id) => has[id]));
      expect(v.report.passed).toBe(!PLACES_HAVE_EDGE_WALLS && !PLACES_LACK_MINE_SITES && !PLACES_LACK_BADWATER);
      expect(r.validation.report.checks.find((c) => c.id === "terrain.edge_wall")!.severity).toBe(PLACES_HAVE_EDGE_WALLS ? "warning" : "info");
      // the missing mine site only warns on export: the gallery's download works
      expect(r.validation.report.checks.find((c) => c.id === "resources.mine_site")!.severity).toBe(PLACES_LACK_MINE_SITES ? "warning" : "info");
      expect(r.validation.report.checks.find((c) => c.id === "resources.badwater_source")!.severity).toBe(PLACES_LACK_BADWATER ? "warning" : "info");
      expect(sha256(r.bytes)).toBe(entry.sha256);
      expect(r.bytes.length).toBe(entry.bytes);
    });
  });
}
