// generate's premise and real places (D141, D501, D508, D136): the lists are the page's own, a premise map is the map
// the page makes for the same choices, a place opens as the page's worker opened it before core/places/open.ts, and the
// examples in the descriptions work.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { decodePlaceFile, placeTimber } from "../../src/core/places/place";
import { DEFAULT_THEME, makeSpec, PREMISE_CHOICES, PREMISE_NAMES } from "../../src/core/spec/mapspec";
import { closeAll, exportFiles, mapOf, specOf } from "../src/maps";
import { callTool, TOOLS } from "../src/server";

type R = Awaited<ReturnType<typeof callTool>>;
const textOf = (r: R) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
const generateSchema = () => (TOOLS.find((t) => t.name === "generate")!.inputSchema as { properties: Record<string, { enum?: string[]; description: string }> }).properties;
const exampleIn = (desc: string) => JSON.parse(/Example: (\{.*?\})\./.exec(desc)![1]) as Record<string, unknown>;

async function made(args: Record<string, unknown>): Promise<R> {
  let r = await callTool("generate", args);
  for (let m = /^Map (map-\d+) is not ready yet/.exec(textOf(r)); m; m = /^Map (map-\d+) is not ready yet/.exec(textOf(r))) r = await callTool("wait", { map: m[1] });
  return r;
}
const handleOf = (r: R) => /^Map (map-\d+) /.exec(textOf(r))![1];

beforeAll(() => closeAll());
afterAll(() => closeAll());

describe("generate's premise", () => {
  it("offers the page's premises, and the example makes the map the page makes for it", async () => {
    const premise = generateSchema().premise;
    expect(premise.enum).toEqual(["none", ...PREMISE_CHOICES.map((p) => PREMISE_NAMES[p])]);
    const example = exampleIn(premise.description);
    const r = await made(example);
    expect(r.isError, textOf(r)).toBeFalsy();
    expect(textOf(r)).toMatch(/^Premise: Lake stair, in the River Valley style\. .+ Landmark: /m);
    // the page's spec for the same choices (src/ui/App.tsx: makeSpec with the premise, made for Normal), and its map
    const page = makeSpec({ seed: 1, size: { x: 128, y: 128 }, designedFor: "normal", theme: "riverValley", premise: "lakeStair" });
    expect(specOf(example).spec).toEqual(page);
    const here = MapSession.fromGenerated(generate(page), generate(page).file);
    const a = exportFiles(here);
    const b = exportFiles(mapOf(handleOf(r)));
    expect(Buffer.compare(Buffer.from(a.timber), Buffer.from(b.timber))).toBe(0);
    expect(Buffer.compare(Buffer.from(a.project), Buffer.from(b.project))).toBe(0);
  });

  it("says why the themes made a map the premise could not, and refuses a premise it does not know", async () => {
    const r = await made({ premise: "Lake stair", theme: "riverValley", size: 96, seed: 1 });
    expect(r.isError, textOf(r)).toBeFalsy();
    expect(textOf(r)).toMatch(/^Premise: The lake stair needs at least 128 tiles a side .*: the themes made this map\.$/m);
    const no = await callTool("generate", { premise: "Moat", size: 96 });
    expect(no.isError).toBe(true);
    expect(textOf(no)).toBe(`The premise is none, ${PREMISE_CHOICES.map((p) => PREMISE_NAMES[p]).join(", ")}`);
    // none is no premise: the themes' map
    expect(specOf({ premise: "none", size: 96, seed: 1 }).spec.premise).toBeUndefined();
  });
});

describe("generate's default", () => {
  it("with no theme and no premise is the page's default map (src/ui/App.tsx initialSpec), byte for byte", async () => {
    const page = makeSpec({ seed: 7, theme: DEFAULT_THEME });
    expect(page.premise).toBeUndefined();
    expect(specOf({ seed: 7 }).spec).toEqual(page);
    // a theme alone keeps no premise, as the page's theme choice keeps its Idea at none
    expect(specOf({ seed: 7, theme: "canyon" }).spec).toEqual(makeSpec({ seed: 7, theme: "canyon" }));
    const r = await made({ seed: 7 });
    expect(r.isError, textOf(r)).toBeFalsy();
    const g = generate(page);
    const a = exportFiles(MapSession.fromGenerated(g, g.file));
    const b = exportFiles(mapOf(handleOf(r)));
    expect(Buffer.compare(Buffer.from(a.timber), Buffer.from(b.timber))).toBe(0);
    expect(Buffer.compare(Buffer.from(a.project), Buffer.from(b.project))).toBe(0);
  });
});

describe("real places", () => {
  const index = JSON.parse(readFileSync(join("public", "real-places", "index.json"), "utf8"));

  it("lists the page's places, and the example opens as the page's worker opened it", async () => {
    const all = JSON.parse(textOf(await callTool("places", {})));
    expect(all.count).toBe(index.places.length);
    expect(all.places.map((p: { id: string }) => p.id)).toEqual(index.places.map((p: { id: string }) => p.id));
    const calderas = JSON.parse(textOf(await callTool("places", { landform: "caldera", size: 96 })));
    expect(calderas.places.length).toBeGreaterThan(0);
    for (const p of calderas.places) expect(p).toMatchObject({ landform: "Caldera", size: 96 });
    const example = exampleIn(generateSchema().place.description);
    const r = await callTool("generate", example);
    expect(r.isError, textOf(r)).toBeFalsy();
    expect(textOf(r)).toMatch(/^Map map-\d+ \(a real place, opened in /);
    // an import shows the file's own water and its start object (`shownWater`, `startTile`)
    expect(textOf(r)).toMatch(/^Start: X \d+ · Y \d+, level \d+\.$/m);
    expect(textOf(r)).toMatch(/^Water: [1-9]\d* wet tiles/m);
    // the worker's own steps before the move into core: decode, build its .timber, import it marked as the place
    const entry = index.places.find((p: { name: string }) => p.name === example.place);
    const place = decodePlaceFile(new Uint8Array(readFileSync(join("public", "real-places", entry.data))));
    const page = MapSession.importMap(placeTimber(place).bytes, `${place.name}.timber`, place.id);
    const a = exportFiles(page);
    const b = exportFiles(mapOf(handleOf(r)));
    expect(b.timberName).toBe(a.timberName);
    expect(Buffer.compare(Buffer.from(a.timber), Buffer.from(b.timber))).toBe(0);
    expect(Buffer.compare(Buffer.from(a.project), Buffer.from(b.project))).toBe(0);
  });

  it("refuses an unknown place, a place with other choices, and a landform or size no place has", async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ["generate", { place: "Atlantis" }, 'There is no real place called "Atlantis": the places tool lists them'],
      ["generate", { place: "near-aso-caldera", size: 128, premise: "Any" }, "A real place is a map of its own: give place alone, without size, premise"],
      ["places", { landform: "moon" }, `The landform is one of ${index.families.map((f: { id: string }) => f.id).join(", ")}`],
      ["places", { size: 64 }, `The places' sizes are ${index.sizes.join(", ")}`],
    ];
    for (const [tool, args, why] of cases) {
      const r = await callTool(tool, args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(textOf(r)).toBe(why);
    }
  });
});
