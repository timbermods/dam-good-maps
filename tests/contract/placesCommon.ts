// Shared by the Real places contract tests (ROADMAP "Real places", PLAN §20 D136): the gallery's
// index and data (public/real-places/, written by tools/real-places.ts), and the check every place
// must pass. Every place is checked nightly and on a pull request into main (the release check),
// split over three files so they run side by side; a sample of every size on every push
// (places.test.ts).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { decodeHeights, decodePlaceFile, LOG_FLOOR, placeTimber, startLogs, type PlaceData, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";
import { mapObjects } from "../../src/core/sim/model";
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

/** No edge walls (Kyler, 2026-09-25, D151): every place as converted for real-places-done stood in
 *  a full-height wall round the whole map, which `terrain.edge_wall` flags. Real places 2 converts
 *  them without it (tools/places-convert.ts): none has one, so every place passes the check. The
 *  flag stays so a conversion that brings a wall back fails here by name. */
export const PLACES_HAVE_EDGE_WALLS = false;

/** Water sources start rivers (D171): the places whose conversion put a source inside a flow
 *  another source already feeds (`water.source_in_flow`). Real places 2 places sources only where
 *  water begins and takes out any the check flags, so the list is empty. */
export const PLACES_SOURCES_IN_FLOW: ReadonlySet<string> = new Set<string>();

/** A mine site on every map (Kyler, 2026-09-25): the places as converted for real-places-done had
 *  none. Real places 2 plans their resources and mine sites with the shared baseline
 *  (src/core/resources/plan.ts, when each map is built), so every place has one. */
export const PLACES_LACK_MINE_SITES = false;

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

/** Each place: its .timber, built as the deploy builds it (build, settle, validate, write), passes
 *  the export profile and every check of the generate profile but its known faults, which flag it
 *  as long as the places have them (`PLACES_HAVE_EDGE_WALLS`, `PLACES_SOURCES_IN_FLOW`,
 *  `PLACES_LACK_MINE_SITES`), has the starting-logs floor's logs near its start (D224), and is the
 *  same bytes as the index records. */
export function checkPlaces(title: string, places: readonly PlaceIndexEntry[], build: (e: PlaceIndexEntry) => ReturnType<typeof placeTimber> = (e) => placeTimber(placeData(e))): void {
  describe(title, () => {
    it.each(places.map((p) => [p.name, p] as const))("%s", (_name, entry) => {
      const r = build(entry);
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
      // the starting-logs floor (Kyler, 2026-09-26, D224, D227), at every difficulty: the logs of the
      // written file's grown trees within the floor's walk of its start
      const p = placeData(entry);
      expect(startLogs(decodeHeights(p.heights), p.W, p.H, mapObjects(file.world)), entry.id).toBeGreaterThanOrEqual(LOG_FLOOR);
      expect(r.validation.report.checks.find((c) => c.id === "terrain.edge_wall")!.severity).toBe(PLACES_HAVE_EDGE_WALLS ? "error" : "info");
      // the missing mine site only warns on export: the gallery's download works
      expect(r.validation.report.checks.find((c) => c.id === "resources.mine_site")!.severity).toBe(PLACES_LACK_MINE_SITES ? "warning" : "info");
      expect(sha256(r.bytes)).toBe(entry.sha256);
      expect(r.bytes.length).toBe(entry.bytes);
    });
  });
}

/** Every place in shard `k` of `n` (nightly, and the release check). */
export function checkShard(k: number, n: number): void {
  checkPlaces(
    `real places ${k + 1} of ${n}: every map validates and is the same file`,
    INDEX.places.filter((_, i) => i % n === k),
  );
}
