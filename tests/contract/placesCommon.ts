// Shared by the Real places contract tests (ROADMAP "Real places", PLAN §20 D136): the gallery's
// index and data (public/real-places/, written by tools/real-places.ts), and the check every place
// must pass. The builds are split over a few test files so they run side by side.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { decodePlaceFile, placeTimber, type PlaceData, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";
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

/** No edge walls (Kyler, 2026-09-25, D151): every place as converted for real-places-done stands in
 *  a full-height wall round the whole map, which `terrain.edge_wall` flags, a principle that blocks
 *  the export profile the places are built in. placeTimber refuses only what would not load, so the
 *  gallery keeps serving them until Real places 2 converts them without it and turns this to
 *  false. */
export const PLACES_HAVE_EDGE_WALLS = true;

/** Water sources start rivers (D171): the places whose conversion puts a source inside a flow
 *  another source already feeds (`water.source_in_flow`, a design check: it fails the generate
 *  profile; in the export profile it does not apply, since sources go anywhere in the editor,
 *  D184). Real places 2 places sources only at heads and empties this list. */
export const PLACES_SOURCES_IN_FLOW = new Set([
  "near-altiplano", "near-atacama-fan", "near-badlands-national-park", "near-bandiagara",
  "near-blue-mountains-jamison", "near-blyde-river-canyon", "near-brahmaputra-near-majuli",
  "near-bungle-bungle", "near-capitol-reef", "near-chilean-aysen-fjord", "near-chocolate-hills",
  "near-cliffs-of-moher", "near-colca-canyon", "near-copper-canyon", "near-death-valley",
  "near-dinaric-karst-plitvice", "near-drakensberg-amphitheatre", "near-ennedi-plateau",
  "near-ethiopian-highlands", "near-finnish-saimaa", "near-geirangerfjord", "near-glencoe",
  "near-godavari-delta", "near-goosenecks-san-juan", "near-gullfoss", "near-ilulissat-icefjord",
  "near-kenai-aialik-bay", "near-lake-toba", "near-lena-delta", "near-lower-mississippi-oxbows",
  "near-mamore-river", "near-monument-valley", "near-mount-mayon", "near-na-pali-coast",
  "near-ngorongoro", "near-niagara-falls", "near-painted-desert", "near-phong-nha",
  "near-rhine-and-moselle", "near-roaring-river-fan", "near-sete-cidades", "near-skeidara-outwash",
  "near-taklimakan-kunlun-fan", "near-tara-gorge", "near-tiger-leaping-gorge", "near-todgha-gorge",
  "near-toklat-river", "near-torres-del-paine", "near-tsingy-bemaraha", "near-twelve-apostles",
  "near-victoria-falls", "near-waimakariri-river", "near-western-ghats-mahabaleshwar",
  "near-yosemite-valley",
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
  "near-alaknanda-and-bhagirathi", "near-altiplano", "near-aoraki-hooker-valley", "near-aso-caldera",
  "near-bandiagara", "near-bardenas-reales", "near-blue-mountains-jamison",
  "near-blyde-river-canyon", "near-brahmaputra-near-majuli", "near-capitol-reef",
  "near-chilean-aysen-fjord", "near-chocolate-hills", "near-cliffs-of-moher", "near-colca-canyon",
  "near-colorado-plateau", "near-copper-canyon", "near-death-valley", "near-dinaric-karst-plitvice",
  "near-drakensberg-amphitheatre", "near-english-lake-district", "near-ennedi-plateau",
  "near-ethiopian-highlands", "near-finnish-saimaa", "near-geirangerfjord", "near-glencoe",
  "near-godavari-delta", "near-goosenecks-san-juan", "near-grand-canyon-colorado",
  "near-ilulissat-icefjord", "near-kaieteur-falls", "near-katherine-gorge", "near-kenai-aialik-bay",
  "near-kinabatangan-river", "near-lake-toba", "near-lauterbrunnen", "near-lena-delta",
  "near-li-river-yangshuo", "near-lofoten", "near-lower-mississippi-oxbows", "near-mamore-river",
  "near-milford-sound", "near-monument-valley", "near-mount-etna", "near-mount-fuji",
  "near-mount-mayon", "near-mount-roraima", "near-mount-taranaki", "near-na-pali-coast",
  "near-niagara-escarpment-hamilton", "near-painted-desert", "near-paricutin", "near-phong-nha",
  "near-roaring-river-fan", "near-sete-cidades", "near-skeidara-outwash",
  "near-taklimakan-kunlun-fan", "near-tara-gorge", "near-thousand-islands-saint-lawrence",
  "near-tibetan-plateau", "near-tiger-leaping-gorge", "near-todgha-gorge", "near-toklat-river",
  "near-torres-del-paine", "near-tsingy-bemaraha", "near-verdon-gorge", "near-victoria-falls",
  "near-waimakariri-river", "near-western-ghats-mahabaleshwar", "near-yosemite-valley",
]);
export const PLACES_BELOW_THE_FLOOR = new Set([
  "near-alaknanda-and-bhagirathi", "near-altiplano", "near-aoraki-hooker-valley", "near-aso-caldera",
  "near-bandiagara", "near-blyde-river-canyon", "near-brahmaputra-near-majuli",
  "near-colorado-plateau", "near-death-valley", "near-glencoe", "near-godavari-delta",
  "near-kenai-aialik-bay", "near-lauterbrunnen", "near-lena-delta", "near-mamore-river",
  "near-paricutin", "near-roaring-river-fan", "near-sete-cidades", "near-skeidara-outwash",
  "near-waimakariri-river",
]);

/** The start's water is never a sealed puddle (Kyler's D302, M9a): these places' starts reach only
 *  water no source feeds that a Normal drought empties, which `start.water` refuses (a playability
 *  check: it warns in the export profile, and the gallery's download works). Real places 2 gives
 *  the places their water (D300) and empties the list. */
export const PLACES_START_WATER_A_PUDDLE = new Set([
  "near-atacama-fan", "near-badlands-national-park", "near-bandiagara", "near-bungle-bungle",
  "near-capitol-reef", "near-cliffs-of-moher", "near-colca-canyon", "near-colorado-plateau",
  "near-death-valley", "near-deccan-plateau", "near-drumheller", "near-english-lake-district",
  "near-fish-river-canyon", "near-iguazu-falls", "near-kaieteur-falls", "near-kinabatangan-river",
  "near-lake-toba", "near-mount-mayon", "near-na-pali-coast", "near-ngorongoro",
  "near-niagara-falls", "near-paricutin", "near-phong-nha", "near-taklimakan-kunlun-fan",
  "near-tibetan-plateau", "near-tsingy-bemaraha", "near-twelve-apostles", "near-uvac-river",
  "near-victoria-falls", "near-waimakariri-river", "near-yosemite-valley",
]);

/** The failing checks of a place, its known faults apart (the conversion's edge wall and sources in
 *  flow, the missing mine site and badwater source, the starting wood and the start's water), and
 *  which of them fail. */
export function placeFailures(checks: readonly CheckResult[]): { other: string[]; edgeWall: boolean; sourceInFlow: boolean; mineSite: boolean; badwater: boolean; wood: boolean; floor: boolean; startWater: boolean } {
  const all = failing(checks);
  const known = (f: string) =>
    f.startsWith("terrain.edge_wall:") ||
    f.startsWith("water.source_in_flow:") ||
    f.startsWith("resources.mine_site:") ||
    f.startsWith("resources.badwater_source:") ||
    f.startsWith("start.wood:") ||
    f.startsWith("start.wood_floor:") ||
    // (item 47's start land is a preference for real places, D331: a place whose start lacks it
    // still opens; its conversion picks a start with it where one qualifies, when it resumes)
    f.startsWith("start.farmland:") ||
    f.startsWith("start.level_land:") ||
    (f.startsWith("start.water:") && f.includes("sealed puddle"));
  return {
    other: all.filter((f) => !known(f)),
    edgeWall: all.some((f) => f.startsWith("terrain.edge_wall:")),
    sourceInFlow: all.some((f) => f.startsWith("water.source_in_flow:")),
    mineSite: all.some((f) => f.startsWith("resources.mine_site:")),
    badwater: all.some((f) => f.startsWith("resources.badwater_source:")),
    wood: all.some((f) => f.startsWith("start.wood:")),
    floor: all.some((f) => f.startsWith("start.wood_floor:")),
    startWater: all.some((f) => f.startsWith("start.water:")),
  };
}

/** Every place in shard `k` of `n`: its .timber, built as the page builds it (build, settle,
 *  validate, write), passes the export profile and every check of the generate profile but its known
 *  faults, which flag it as long as the places have them (`PLACES_HAVE_EDGE_WALLS`,
 *  `PLACES_SOURCES_IN_FLOW`, `PLACES_LACK_MINE_SITES`, `PLACES_LACK_BADWATER`, `PLACES_SHORT_OF_WOOD`,
 *  `PLACES_BELOW_THE_FLOOR`), and is the same bytes as the index records. */
export function checkShard(k: number, n: number): void {
  const places = INDEX.places.filter((_, i) => i % n === k);
  describe(`real places ${k + 1} of ${n}: every map validates and is the same file`, () => {
    it.each(places.map((p) => [p.name, p] as const))("%s", (_name, entry) => {
      const r = placeTimber(placeData(entry));
      expect(r.validation.report.profile).toBe("export");
      // the export profile passes but for the edge wall, a principle it blocks (D151); the gallery
      // still gets the file, as placeTimber refuses only what would not load
      expect(r.validation.report.passed).toBe(!PLACES_HAVE_EDGE_WALLS);
      expect(r.fileName).toBe(`${entry.name}.timber`);
      // the written file, read back: every check of the strictest profile, on its own settle
      const file = readTimber(r.bytes);
      const v = validateMap(file, { profile: "generate", designedFor: "normal", features: [], water: { model: r.validation.model!, settled: r.validation.water! } });
      const f = placeFailures(v.report.checks);
      expect(f.other).toEqual([]);
      expect(f.edgeWall).toBe(PLACES_HAVE_EDGE_WALLS);
      expect(f.sourceInFlow).toBe(PLACES_SOURCES_IN_FLOW.has(entry.id));
      expect(f.mineSite).toBe(PLACES_LACK_MINE_SITES);
      expect(f.badwater).toBe(PLACES_LACK_BADWATER);
      expect(f.wood).toBe(PLACES_SHORT_OF_WOOD.has(entry.id));
      expect(f.floor).toBe(PLACES_BELOW_THE_FLOOR.has(entry.id));
      expect(f.startWater).toBe(PLACES_START_WATER_A_PUDDLE.has(entry.id));
      expect(v.report.passed).toBe(!PLACES_HAVE_EDGE_WALLS && !PLACES_LACK_MINE_SITES && !PLACES_LACK_BADWATER);
      expect(r.validation.report.checks.find((c) => c.id === "terrain.edge_wall")!.severity).toBe(PLACES_HAVE_EDGE_WALLS ? "error" : "info");
      // the missing mine site only warns on export: the gallery's download works
      expect(r.validation.report.checks.find((c) => c.id === "resources.mine_site")!.severity).toBe(PLACES_LACK_MINE_SITES ? "warning" : "info");
      expect(r.validation.report.checks.find((c) => c.id === "resources.badwater_source")!.severity).toBe(PLACES_LACK_BADWATER ? "warning" : "info");
      expect(sha256(r.bytes)).toBe(entry.sha256);
      expect(r.bytes.length).toBe(entry.bytes);
    });
  });
}
