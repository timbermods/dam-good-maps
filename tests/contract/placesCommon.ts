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

/** The failing checks of a place, its known faults apart (the conversion's edge wall and sources in
 *  flow, and the missing mine site), and which of them fail. */
export function placeFailures(checks: readonly CheckResult[]): { other: string[]; edgeWall: boolean; sourceInFlow: boolean; mineSite: boolean } {
  const all = failing(checks);
  const known = (f: string) => f.startsWith("terrain.edge_wall:") || f.startsWith("water.source_in_flow:") || f.startsWith("resources.mine_site:");
  return {
    other: all.filter((f) => !known(f)),
    edgeWall: all.some((f) => f.startsWith("terrain.edge_wall:")),
    sourceInFlow: all.some((f) => f.startsWith("water.source_in_flow:")),
    mineSite: all.some((f) => f.startsWith("resources.mine_site:")),
  };
}

/** Every place in shard `k` of `n`: its .timber, built as the page builds it (build, settle,
 *  validate, write), passes the export profile and every check of the generate profile but its known
 *  faults, which flag it as long as the places have them (`PLACES_HAVE_EDGE_WALLS`,
 *  `PLACES_SOURCES_IN_FLOW`, `PLACES_LACK_MINE_SITES`), and is the same bytes as the index records. */
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
      expect(v.report.passed).toBe(!PLACES_HAVE_EDGE_WALLS && !PLACES_LACK_MINE_SITES);
      expect(r.validation.report.checks.find((c) => c.id === "terrain.edge_wall")!.severity).toBe(PLACES_HAVE_EDGE_WALLS ? "error" : "info");
      // the missing mine site only warns on export: the gallery's download works
      expect(r.validation.report.checks.find((c) => c.id === "resources.mine_site")!.severity).toBe(PLACES_LACK_MINE_SITES ? "warning" : "info");
      expect(sha256(r.bytes)).toBe(entry.sha256);
      expect(r.bytes.length).toBe(entry.bytes);
    });
  });
}
