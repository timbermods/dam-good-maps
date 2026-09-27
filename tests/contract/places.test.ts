// Real places (ROADMAP "Real places", PLAN §20 D136, D151, D152, D155, D171, D174): the gallery's
// data and its choice (tools/places/selection.json), the land without edge walls, its titles, the
// credits and the in-game description, a sample of every size built, validated and compared byte
// for byte with the index (every place: places-build-*.test.ts, nightly and in the release check),
// its resources from the shared baseline, both validators on the sample, the editor's import of a
// place, and the rule that real places never feed the generator and are never built in the
// browser.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { readTimber } from "../../src/core/format/timber";
import { CREDITS_URL, fileNotices, PROVIDERS, RIVERS_LICENCE_URL, RIVERS_NOTICE, WATER_LICENCE_URL, WATER_NOTICE } from "../../src/core/places/attribution";
import { decodeHeights, PLACE_NOTES, placeDescription, placeNotes, placeProblems, placeSample, placeTimber } from "../../src/core/places/place";
import { validateMap } from "../../src/core/validate/checks";
import type { CheckResult } from "../../src/core/validate/report";
import { checkPlaces, INDEX, PLACES_DIR, PLACES_HAVE_EDGE_WALLS, PLACES_LACK_MINE_SITES, PLACES_SOURCES_IN_FLOW, placeData, sha256 } from "./placesCommon";
import { EDGE_SHARE, edgeWalls } from "../../src/core/analysis/edges";
import { title as titleOf } from "../../tools/places/titles";
import { FLOW_CAP } from "../../tools/places/convert";
import { density } from "../../src/core/gen/calibrated";

/** The choice tools/places-convert.ts made. */
const SELECTION = JSON.parse(readFileSync("tools/places/selection.json", "utf8")) as {
  places: { id: string; name: string; row: string; status: "kept" | "replaced" | "added"; was?: string }[];
  dropped: { name: string; row: string; status?: "kept" | "replaced" | "added"; reason: string }[];
};

/** A WebP's width and height (its VP8, VP8L or VP8X header), or null. */
function webpSize(b: Uint8Array): [number, number] | null {
  const text = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const u16 = (o: number) => b[o] | (b[o + 1] << 8);
  const u24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  const chunk = text(12, 4);
  if (chunk === "VP8 ") return [u16(26) & 0x3fff, u16(28) & 0x3fff];
  if (chunk === "VP8X") return [u24(24) + 1, u24(27) + 1];
  if (chunk === "VP8L") {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  return null;
}

describe("the gallery's data", () => {
  it("holds the survey's real places: no random-land controls, one entry and three files each", () => {
    expect(INDEX.format).toBe(1);
    expect(INDEX.count).toBe(INDEX.places.length);
    // the second round's gallery (Kyler, 2026-09-25, D174): about 150 places
    expect(INDEX.count).toBe(SELECTION.places.length);
    expect(INDEX.count).toBeGreaterThanOrEqual(130);
    expect(INDEX.places.filter((p) => p.family === "random" || /random/i.test(p.name))).toEqual([]);
    expect(new Set(INDEX.places.map((p) => p.id)).size).toBe(INDEX.count);
    expect(new Set(INDEX.places.map((p) => p.name)).size).toBe(INDEX.count);
    expect(INDEX.sizes).toEqual([96, 128, 256]);
    expect(INDEX.families.map((f) => f.id).sort()).toEqual([...new Set(INDEX.places.map((p) => p.family))].sort());
    for (const p of INDEX.places) {
      expect(p.id, p.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.file, p.id).toBe(`maps/${p.id}.timber`);
      expect(p.plays.length, p.id).toBeLessThan(100);
      expect(existsSync(join(PLACES_DIR, p.data)), p.data).toBe(true);
      // the card's two pictures (Kyler, 2026-09-25), WebP, showing the map as it is now
      // (tools/places-thumbs.ts): the 3D view's angled overview, twice the card's 240 px; and the map
      // from above, a whole number of pixels a tile (about 512 px), so every tile edge is sharp
      expect(p.image, p.id).toBe(`cards/${p.id}.webp`);
      expect(p.topImage, p.id).toBe(`cards/${p.id}-top.webp`);
      const card = new Uint8Array(readFileSync(join(PLACES_DIR, p.image)));
      expect(webpSize(card), p.image).toEqual([480, 480]);
      expect(card.length, p.image).toBeLessThan(80_000);
      const top = new Uint8Array(readFileSync(join(PLACES_DIR, p.topImage)));
      const side = Math.round(512 / p.size) * p.size;
      expect(webpSize(top), p.topImage).toEqual([side, side]);
      expect(side % p.size).toBe(0);
      expect(top.length, p.topImage).toBeLessThan(80_000);
      expect(p.imageFrom, `${p.id}: its pictures show an older map; run npm run places:thumbs`).toBe(p.sha256);
    }
    // nothing else is published
    const listed = new Set(INDEX.places.flatMap((p) => [p.data, p.image, p.topImage]));
    for (const dir of ["data", "cards"]) for (const f of readdirSync(join(PLACES_DIR, dir))) expect(listed.has(`${dir}/${f}`), `${dir}/${f}`).toBe(true);
  });

  it("each place's data matches its entry", () => {
    for (const entry of INDEX.places) {
      const p = placeData(entry);
      expect([p.id, p.name, p.family, p.familyName, p.plays, p.W, p.H, p.metres], entry.id).toEqual([entry.id, entry.name, entry.family, entry.familyName, entry.plays, entry.size, entry.size, entry.metres]);
      expect(p.heights.length).toBe(p.W * p.H);
    }
  });

  it("stays light: the page loads the index, and the pictures as their cards come into view", () => {
    const size = (p: string) => statSync(join(PLACES_DIR, p)).size;
    const data = INDEX.places.reduce((s, p) => s + size(p.data), 0);
    const cards = INDEX.places.reduce((s, p) => s + size(p.image), 0);
    console.log(`real places: index ${size("index.json")} B, data ${data} B (largest ${Math.max(...INDEX.places.map((p) => size(p.data)))} B), cards ${cards} B`);
    // the index grows with the gallery (85 places were under 64 KB, 753 B a place; Kyler's 150,
    // D174): the same budget a place, and what the page downloads, gzipped, stays small
    expect(size("index.json") / INDEX.count).toBeLessThan(64_000 / 85);
    expect(gzipSync(new Uint8Array(readFileSync(join(PLACES_DIR, "index.json"))), { level: 6 }).length).toBeLessThan(32_000);
    expect(Math.max(...INDEX.places.map((p) => size(p.data)))).toBeLessThan(64_000);
    // the pictures load lazily, as the cards come into view
    // (the cards' pictures are the shared components in src/ui/Pictures.tsx)
    expect(readFileSync("src/places/Gallery.tsx", "utf8")).not.toMatch(/<img /);
    const imgs = readFileSync("src/ui/Pictures.tsx", "utf8").match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBe(1);
    for (const img of imgs) expect(img).toContain('loading="lazy"');
  });
});

describe("the choice (tools/places/selection.json, tools/places-convert.ts)", () => {
  it("keeps the first round's places or says why not, and adds the rest across the families", () => {
    // the gallery's order is the selection's
    expect(INDEX.places.map((p) => p.id)).toEqual(SELECTION.places.map((p) => p.id));
    expect(INDEX.places.map((p) => placeData(p).survey)).toEqual(SELECTION.places.map((p) => p.row));
    // the first round's 85: each kept (from its own survey row), made from another row of its
    // region (its title kept), or dropped with the reason; an addition D214 (rivers, not floods) or
    // D224 (the starting-logs floor) took is dropped with its reason too
    const first = SELECTION.places.filter((p) => p.status !== "added");
    expect(first.length + SELECTION.dropped.filter((d) => d.status !== "added").length).toBe(85);
    for (const d of SELECTION.dropped) expect(d.reason.length, d.name).toBeGreaterThan(10);
    for (const d of SELECTION.dropped.filter((q) => q.status)) expect(d.reason, d.name).toMatch(/\((D214|D224|D271)\)/);
    for (const p of SELECTION.places.filter((q) => q.status === "replaced")) expect(p.was, p.id).toMatch(/^n\d{3}-/);
    // spread across the families: none far behind the rest
    const perFamily = INDEX.families.map((f) => INDEX.places.filter((p) => p.family === f.id).length);
    expect(INDEX.families.length).toBe(20);
    expect(Math.min(...perFamily)).toBeGreaterThanOrEqual(Math.max(...perFamily) - 3);
    // never a random-land control, never the Las Medulas region (a Roman mine)
    for (const p of SELECTION.places) expect(p.row, p.id).toMatch(/^n\d{3}-(96|128|256)-(30|60|120)-(normalised|compressed|linear)-16$/);
  });

  it("the land as it is: no edge walls or rims (D151, D152)", () => {
    for (const entry of INDEX.places) {
      const p = placeData(entry);
      const walls = edgeWalls(decodeHeights(p.heights), p.W, p.H);
      // the check's rule: no edge 60% walled; the first round's walls had 89-99%
      expect(Math.max(...walls.map((w) => w.share)), entry.id).toBeLessThan(EDGE_SHARE);
      // the place's own objects are its sources and its start: resources come when it is built
      expect(Object.keys(p).sort(), entry.id).toEqual(expect.arrayContaining(["format", "heights", "sources", "start", "survey"]));
      // a place whose square has no observed water is dry (D271), and its note says so
      if (!p.sources.length) expect(entry.notes, entry.id).toContain("No water a pump can reach from the start");
      for (const [x, y, strength] of p.sources) {
        expect(x >= 0 && y >= 0 && x < p.W && y < p.H, entry.id).toBe(true);
        expect(strength, entry.id).toBeGreaterThan(0);
        expect(strength, entry.id).toBeLessThanOrEqual(8);
      }
    }
  });

  it("rivers, not floods (D214): each place's water within the cap for its size, near the official maps' range", () => {
    // the caps: the official maps' strongest water for the size, never under the survey's own 2×
    expect(FLOW_CAP).toEqual({ 96: 2, 128: 2, 256: 3.75 });
    const flows = new Map(JSON.parse(readFileSync("tools/places/selection.json", "utf8")).places.map((p: { id: string; flow: number }) => [p.id, p.flow]));
    for (const entry of INDEX.places) {
      const p = placeData(entry);
      const cap = FLOW_CAP[p.W];
      expect(flows.get(p.id), p.id).toBeLessThanOrEqual(cap);
      // what the sources give: at most the cap, the generator's strength for the size times it
      // (each source rounded to a thousandth)
      const total = p.sources.reduce((s, [, , v]) => s + v, 0);
      const area = p.W * p.H;
      expect(total, p.id).toBeLessThanOrEqual((cap * density("water_strength_per_10k", area) * area) / 1e4 + p.sources.length * 0.0005);
    }
  });
});

describe("titles (Kyler, 2026-09-25)", () => {
  it("are plain and unique, without \"Near\" or the sample, and the index keeps the survey's name", () => {
    for (const p of INDEX.places) {
      // plain: the game's handling of other characters is not yet checked (a future probe batch)
      expect(p.name, p.id).toMatch(/^[A-Za-z][A-Za-z ,'-]*[a-z]$/);
      expect(p.name, p.id).not.toMatch(/\bnear\b|sample|m per tile|badwater/i);
      expect(p.id).toBe(p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      // the survey's own name, verbatim, and the part of the place it sampled
      const m = /^Near (.+?)(?: \((\w+) sample\))?, (\d+) m per tile$/.exec(p.surveyName);
      expect(m, p.surveyName).not.toBeNull();
      expect(p.sample, p.id).toBe(m![2]);
      expect(Number(m![3]), p.id).toBe(p.metres);
      // the sentence's place is the survey's place, with "the" or a few words where it needs them
      const place = placeData(p).place;
      const own = titleOf(p.surveyName);
      expect(place, p.id).toBe(own.place);
      expect([own.name, `the ${own.name}`].includes(place) || place.startsWith(`${own.name.split(",")[0]}, `), `${p.id}: ${place}`).toBe(true);
    }
    // a region's first map is titled by its place; its second by its own part of the place (D214:
    // a real feature in its square or a position, never "Centre"), else the part the survey sampled
    const regions = new Set<string>();
    for (const p of INDEX.places) {
      const survey = placeData(p).survey;
      const region = Math.floor(Number(survey.slice(1, 4)) / 4);
      const second = regions.has(`${region}`);
      regions.add(`${region}`);
      expect(p.name, p.id).toBe(titleOf(p.surveyName, second, survey.replace(/-\w+-\d+$/, "")).name);
      expect(p.name, p.id).not.toMatch(/\bCentre\b/);
    }
    expect(new Set(INDEX.places.map((p) => p.name.toLowerCase())).size).toBe(INDEX.count);
    // the renames that tidy an awkward title
    const title = (survey: string) => INDEX.places.find((p) => p.surveyName.startsWith(`Near ${survey} (`) || p.surveyName.startsWith(`Near ${survey},`))?.name;
    expect(title("Grand Canyon Colorado")).toBe("Grand Canyon");
    expect(title("Death Valley Badwater fan")).toBe("Death Valley");
    // Kyler's choices (2026-09-25)
    expect(title("Lower Mississippi oxbows")).toBe("Mississippi Oxbows");
    expect(title("Taklimakan Kunlun fan")).toBe("Kunlun Alluvial Fan");
    expect(title("Dinaric karst Plitvice")).toBe("Plitvice Lakes");
    expect(title("Yosemite Valley")).toBe("Yosemite Valley");
    // the words, as tools/places-convert.ts makes them: a place's second map names its part
    expect(titleOf("Near Brahmaputra near Majuli (east sample), 30 m per tile")).toEqual({ name: "Majuli, Brahmaputra", place: "Majuli, on the Brahmaputra", sample: "east" });
    expect(titleOf("Near Colca Canyon (north sample), 30 m per tile", true, "n006-128-30")).toEqual({ name: "Colca Canyon North", place: "the Colca Canyon", sample: "north" });
    // a second map at the place's centre is named by its own land (Kyler, 2026-09-26, D214)
    expect(titleOf("Near Lake Toba, 30 m per tile", true, "n132-96-30")).toEqual({ name: "Samosir, Lake Toba", place: "Lake Toba" });
    expect(() => titleOf("Near Uvac River, 30 m per tile", true, "n088-96-30")).toThrow(/needs its own title/);
    expect(titleOf("Near Western Ghats Mahabaleshwar (east sample), 30 m per tile", true, "n277-256-30").name).toBe("Kate's Point, Western Ghats");
    expect(INDEX.places.filter((p) => p.sample).length).toBeGreaterThan(40);
  });
});

describe("credits and the in-game description (docs/real-places-credits.md)", () => {
  it("every map's description: its title, that it is not a replica, and the credits page", () => {
    expect(CREDITS_URL).toBe("https://timbermods.github.io/dam-good-maps/real-places/credits/");
    const carried: Record<string, string[]> = {};
    for (const entry of INDEX.places) {
      const p = placeData(entry);
      const d = placeDescription(p);
      const notices = fileNotices(p.lat, p.lon);
      expect(d.split("\n\n")).toEqual([
        p.name,
        `Inspired by the land near ${p.place}, at Timberborn's scale; not a replica.`,
        `Credits: ${CREDITS_URL}`,
        ...(notices.length ? [`Elevation data: ${notices.join("; ")}.`] : []),
      ]);
      for (const n of notices) (carried[n] ??= []).push(p.name);
      // plain text: the game's handling of other characters is not yet checked (a future probe batch)
      expect(d, entry.id).toMatch(/^[\x20-\x7e\n]+$/);
    }
    // the notices whose terms need them in the file (docs/real-places-credits.md): Kartverket's in
    // the maps in Norway, and LINZ's, with its licence, in those in New Zealand
    const text = (start: string) => PROVIDERS.find((p) => p.notice.startsWith(start))!.inFile!.text;
    expect(PROVIDERS.filter((p) => p.inFile).length).toBe(2);
    expect(carried).toEqual({
      [text("Norway")]: ["Geirangerfjord", "Lofoten", "Geirangerfjord East"],
      [text("New Zealand")]: ["Waimakariri River", "Milford Sound", "Hooker Valley", "Mount Taranaki", "Kawarau and Shotover", "Hooker Valley East", "Mount Taranaki North", "Waimakariri River Southwest"],
    });
    expect(text("Norway")).toContain("Kartverket");
    expect(text("New Zealand")).toContain("https://creativecommons.org/licenses/by/3.0/nz/");
  });

  it("every provider has its notice, licence and verdict; the credits page is a page of the site", () => {
    expect(PROVIDERS.length).toBe(11);
    for (const p of PROVIDERS) {
      expect(p.notice.length, p.notice).toBeGreaterThan(10);
      expect(p.licence.length, p.notice).toBeGreaterThan(3);
      expect(p.licenceUrl, p.notice).toMatch(/^https:\/\//);
    }
    // a region's box holds its places, and no place elsewhere
    expect(fileNotices(62.1, 7.1)).toHaveLength(1); // Geirangerfjord
    expect(fileNotices(61.82, 28.5)).toEqual([]); // Saimaa, Finland
    expect(fileNotices(-43.72, 170.1)).toHaveLength(1); // Hooker Valley
    expect(fileNotices(-33.87, 151.2)).toEqual([]); // Sydney
    const verdicts = readFileSync("docs/real-places-credits.md", "utf8");
    for (const p of PROVIDERS) expect(verdicts, p.licence).toContain(p.licenceUrl);
    // the water data (D271): each source's verdict and notice, verbatim
    expect(verdicts).toContain(WATER_LICENCE_URL);
    expect(verdicts).toContain(WATER_NOTICE);
    expect(verdicts).toContain(RIVERS_LICENCE_URL);
    expect(verdicts).toContain(RIVERS_NOTICE);
    expect(readFileSync("real-places/credits/index.html", "utf8")).toContain("/src/places/credits-main.tsx");
    expect(readFileSync("vite.config.ts", "utf8")).toContain("./real-places/credits/index.html");
  });
});

// A sample of every size for the checks on every push: the first two places at 96² and 128², and
// the first at 256² (placeSample; the browser tests use it too).
const SAMPLE = placeSample(INDEX);
const builds = new Map<string, ReturnType<typeof placeTimber>>();
const built = (id: string) => {
  if (!builds.has(id)) builds.set(id, placeTimber(placeData(INDEX.places.find((p) => p.id === id)!)));
  return builds.get(id)!;
};

checkPlaces("a sample of every size validates and is the index's file (every place: nightly and the release check)", SAMPLE, (e) => built(e.id));

describe("a sample of places", () => {
  it("writes the description into the file, and the file is the index's", () => {
    for (const e of SAMPLE) {
      const r = built(e.id);
      const file = readTimber(r.bytes);
      expect(file.metadata?.MapDescription).toBe(placeDescription(placeData(e)));
      expect(sha256(r.bytes)).toBe(e.sha256);
    }
  });

  it("carries the resources the shared baseline plans on its ground, a mine site among them", () => {
    for (const e of SAMPLE) {
      const r = built(e.id);
      const templates = readTimber(r.bytes).world.entities.map((x) => String(x.Template));
      expect(templates.filter((t) => t === "UndergroundRuins").length, e.id).toBeGreaterThanOrEqual(1);
      expect(templates.filter((t) => t === "BlueberryBush").length, e.id).toBeGreaterThan(0);
      expect(templates.filter((t) => /^(Pine|Birch|Oak)$/.test(t)).length, e.id).toBeGreaterThan(0);
      expect(templates.filter((t) => t === "StartingLocation").length, e.id).toBe(1);
      expect(templates.filter((t) => t === "WaterSource").length, e.id).toBe(placeData(e).sources.length);
    }
  });

  it("Refine: the editor imports a place, and exports it unedited as the same file", () => {
    for (const e of SAMPLE) {
      const r = built(e.id);
      const s = MapSession.importMap(r.bytes, r.fileName);
      expect(s.mode).toBe("import");
      expect(s.meta.name).toBe(e.name);
      expect(s.size).toEqual({ x: e.size, y: e.size });
      expect(s.validate("import", { loadOnly: true }).report.passed).toBe(true);
      const out = s.exportTimber();
      expect(out.fileName).toBe(`${e.name}.timber`);
      expect(sha256(out.bytes)).toBe(e.sha256);
    }
  });
});

// The Python validator (prototype/validate.py), as the oracle runs it: the same verdict for every
// check. CI installs Python; a machine without it skips this.
function python(): string | null {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}
const PY = python();
if (!PY && process.env.CI) throw new Error("CI needs Python with numpy for the real places oracle");

describe.skipIf(!PY)("both validators agree on the sample (prototype/validate.py)", () => {
  it("every check has the same verdict, and every map passes both but for the known faults and the playability checks (information, D245), which both flag", () => {
    const dir = join(".scratch", "places-oracle");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const e of SAMPLE) {
      const p = join(dir, `${e.id}.timber`);
      writeFileSync(p, built(e.id).bytes);
      // an explicit empty feature list, as the survey's oracle wrote it: Python also checks outflow
      writeFileSync(join(dir, `${e.id}.damgoodmaps.json`), gzipSync(strToU8(JSON.stringify({ spec: null, features: [] })), { mtime: 0 }));
      paths.push(p);
    }
    const r = spawnSync(PY!, ["-B", "prototype/validate.py", "--json", ...paths], { encoding: "utf8", maxBuffer: 256 << 20 });
    expect(r.error).toBeUndefined();
    const reports = new Map<string, { passed: boolean; checks: { id: string; ok: boolean; na: boolean; approx?: string }[] }>();
    for (const line of (r.stdout ?? "").split(/\r?\n/)) if (line.startsWith("{")) {
      const j = JSON.parse(line) as { path: string; passed: boolean; checks: { id: string; ok: boolean; na: boolean; approx?: string }[] };
      reports.set(relative(".", j.path).split(sep).join("/"), j);
    }
    const ts = (c: CheckResult) => (c.applicable === false ? "na" : c.approximate ? "approx" : c.ok ? "pass" : "fail");
    const py = (c: { ok: boolean; na: boolean; approx?: string }) => (c.na ? "na" : c.approx ? "approx" : c.ok ? "pass" : "fail");
    let anyFails = false;
    for (const [k, e] of SAMPLE.entries()) {
      const rep = reports.get(paths[k].split(sep).join("/"));
      expect(rep, `${e.id}: no Python report. ${r.stderr ?? ""}`).toBeDefined();
      const b = built(e.id);
      const v = validateMap(readTimber(b.bytes), { profile: "generate", designedFor: "normal", features: [], water: { model: b.validation.model!, settled: b.validation.water! } });
      const cls = new Map(v.report.checks.map((c) => [c.id, c.class]));
      const known = [...(PLACES_HAVE_EDGE_WALLS ? ["terrain.edge_wall"] : []), ...(PLACES_SOURCES_IN_FLOW.has(e.id) ? ["water.source_in_flow"] : []), ...(PLACES_LACK_MINE_SITES ? ["resources.mine_site"] : [])];
      // both fail nothing but the known faults and, since D245, playability checks (information)
      const pyFailing = rep!.checks.filter((c) => !c.ok && !c.na && !c.approx && !(c as { advisory?: boolean }).advisory).map((c) => c.id);
      expect(pyFailing.filter((id) => cls.get(id) !== "playability" && id !== "resources.mine_site").sort(), e.id).toEqual(known.filter((id) => id !== "resources.mine_site").sort());
      expect(rep!.passed, e.id).toBe(pyFailing.length === 0);
      anyFails ||= pyFailing.length > 0;
      const a = Object.fromEntries(v.report.checks.map((c) => [c.id, ts(c)]));
      const p = Object.fromEntries(rep!.checks.map((c) => [c.id, py(c)]));
      expect(p, e.id).toEqual(a);
    }
    expect(r.status).toBe(anyFails ? 1 : 0);
  });
});

describe("kept on their own land (Kyler, 2026-09-26, D245)", () => {
  it("a place short of the playability checks still builds, loads, and says what it lacks", () => {
    // the places whose notes say the start has no pumpable water, and that the water keeps moving
    for (const words of [PLACE_NOTES[0][1], PLACE_NOTES[2][1]]) {
      const e = INDEX.places.find((p) => p.notes?.includes(words) && p.size < 256);
      expect(e, words).toBeDefined();
      const r = built(e!.id);
      // it loads as the editor shows it: the export profile passes
      expect(r.validation.report.passed, e!.id).toBe(true);
      const v = validateMap(readTimber(r.bytes), { profile: "generate", designedFor: "normal", features: [], water: { model: r.validation.model!, settled: r.validation.water! } });
      const { blocking, shortOf } = placeProblems(v.report.checks);
      // only playability checks fall short: information, never a reason to drop the place
      expect(blocking, e!.id).toEqual([]);
      expect(shortOf.length, e!.id).toBeGreaterThan(0);
      expect(v.report.passed, e!.id).toBe(false);
      // and it says so, in the index the card reads
      expect(e!.notes, e!.id).toEqual(placeNotes(v.report.checks));
      expect(sha256(r.bytes)).toBe(e!.sha256);
    }
  });

  it("notes only what would sink a player, in a few plain words", () => {
    expect(PLACE_NOTES.map(([id]) => id)).toEqual(["start.water", "start.wood", "water.settles"]);
    const words = new Set(PLACE_NOTES.map(([, w]) => w));
    for (const p of INDEX.places) for (const n of p.notes ?? []) expect(words.has(n), `${p.id}: ${n}`).toBe(true);
    for (const w of words) {
      expect(w.split(" ").length).toBeLessThanOrEqual(9);
      expect(w, "no advice").not.toMatch(/\b(add|move|try|should|build|place)\b/i);
    }
    // the everyday advisories get none
    expect(PLACE_NOTES.some(([id]) => /drought|reservoir|clean/.test(id))).toBe(false);
  });

  it("every place is on its own land: none dropped but the 15 Kyler dropped from the review sheet (D271)", () => {
    expect(SELECTION.dropped.map((d) => d.name)).toEqual([
      "Lake Toba",
      "Godavari Delta",
      "Majuli, Brahmaputra",
      "Tsingy de Bemaraha",
      "Mount Mayon North",
      "Kinabatangan River East",
      "Kornati",
      "Masurian Lakes",
      "San Daniele, Tagliamento River",
      "Roaring River Fan East",
      "Tiger Leaping Gorge North",
      "Cape of Good Hope",
      "Danube Delta Southwest",
      "Ilulissat Icefjord Southwest",
      "Painted Desert North",
    ]);
    for (const d of SELECTION.dropped) expect(d.reason, d.name).toMatch(/^dropped by Kyler from the D245 review sheet, number \d+ \(D271\)$/);
    expect(SELECTION.places.length).toBe(136);
    // a region's second map keeps its name when Kyler dropped its first
    expect(INDEX.places.some((p) => p.name === "Samosir, Lake Toba")).toBe(true);
  });
});

describe("real places stay out of the generator (D108), and the browser never builds one", () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) out.push(...sources(path));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(path);
    }
    return out;
  }

  it("only the gallery and the page's Refine link use them", () => {
    const users = sources("src")
      .filter((f) => /from\s+["'][^"']*places\/[^"']*["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.split(sep).join("/"))
      .filter((f) => !f.startsWith("src/places/") && !f.startsWith("src/core/places/"))
      .sort();
    expect(users).toEqual(["src/ui/App.tsx"]);
    // the page's Refine link loads only the fetch helpers, never the place builder
    expect(readFileSync("src/ui/App.tsx", "utf8")).not.toMatch(/core\/places/);
  });

  it("the pages fetch the .timber built at deploy time: the builder is only a type to them", () => {
    let seen = 0;
    for (const f of sources("src/places")) {
      for (const line of readFileSync(f, "utf8").split("\n").filter((l) => /from\s+["'][^"']*core\/places\/place["']/.test(l))) {
        expect(line, f).toMatch(/^import type /);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
