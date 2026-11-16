// Writes the scenario tests' fixture projects (tests/fixtures/projects, D148; tests/fixtureProjects.ts says why).
//
//   npm run fixtures:projects            writes every fixture in the list below that is not yet on disk
//   npm run fixtures:projects -- --all   rewrites every fixture from the generator now current (a deliberate refresh)
//   npm run fixtures:projects -- scenario-highlands-64-1 ...   rewrites the named ones (a name without its extension)
//
// A refresh moves the maps the tests stand on: run the quick suite after it and re-aim what moved, as a land change does.
// Add a fixture here when a test needs a map the list lacks, and open it with `fixtureProject`/`fixtureSession`.
// A browser spec's map goes in PAGE, as the fragment the spec opened before (`page-<theme>-<size>-<seed>[-...]`, the map the
// page makes of it), and the spec opens it with `openSaved` (tests/e2e/open.ts); a refresh of those re-aims the browser specs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodeProject, encodeProject } from "../src/core/doc/document";
import { generate } from "../src/core/gen/generate";
import { MapSession } from "../src/core/doc/session";
import { GENERATOR_VERSION, makeSpec, type MapSpec, type ThemeId } from "../src/core/spec/mapspec";
import { decodeSpecFragment } from "../src/core/spec/codec";
import { FIXTURE_DIR, fixtureName, pageFixtureName, type FixtureVariant } from "../tests/fixtureProjects";

type Entry = [theme: ThemeId, size: number, seed: number, variant?: FixtureVariant];

const LIST: Entry[] = [
  // Highlands
  ...[1, 3, 5, 7, 10, 23].map((seed): Entry => ["highlands", 48, seed]), // the collaboration tests, objectsRide
  ...[1, 3, 6, 12, 14].map((seed): Entry => ["highlands", 64, seed]),
  ...[2, 3, 5, 21, 25, 26, 4242].map((seed): Entry => ["highlands", 96, seed]),
  ["highlands", 96, 3, "noforms"],
  ["highlands", 96, 57, "noforms"],
  ["highlands", 96, 4],
  ...[1, 3, 7, 26, 28].map((seed): Entry => ["highlands", 128, seed]),
  // River Valley
  ...[11, 12].map((seed): Entry => ["riverValley", 48, seed]),
  ...[1, 2, 3, 4, 5, 7, 11, 13, 22, 29].map((seed): Entry => ["riverValley", 64, seed]),
  ["riverValley", 64, 20, "noforms"],
  ["riverValley", 64, 29, "noforms"],
  ...[1, 2, 3, 4, 5, 8, 9, 11, 13, 15, 18, 21, 33, 98].map((seed): Entry => ["riverValley", 96, seed]),
  ...[3, 4, 11, 14, 4242].map((seed): Entry => ["riverValley", 128, seed]),
  // Canyon, Lake Basin, Delta, Islands
  ...[3, 9, 31].map((seed): Entry => ["canyon", 48, seed]),
  ...[1, 2, 3, 4, 5, 6, 13].map((seed): Entry => ["canyon", 96, seed]),
  ...[1, 3, 4].map((seed): Entry => ["lakeBasin", 64, seed]),
  ...[2, 4].map((seed): Entry => ["lakeBasin", 96, seed]),
  ["delta", 64, 1],
  ["delta", 96, 1],
  ["islands", 96, 5],
  // Naturalize's tests (naturalizeNature.test.ts): 96² maps without 3D forms, at Terracing 100 or the theme's own
  ...[2, 3, 4, 6, 8].map((seed): Entry => ["riverValley", 96, seed, "noforms-terr100"]),
  ...[1, 2, 3, 4].map((seed): Entry => ["lakeBasin", 96, seed, "noforms-terr100"]),
  ["highlands", 96, 5, "noforms-terr100"],
  ["canyon", 96, 2, "noforms-terr100"],
  ["canyon", 96, 4, "noforms-terr100"],
  ["highlands", 96, 2, "noforms"],
  ["canyon", 96, 4, "noforms"],
  ["delta", 96, 2, "noforms"],
  ["islands", 96, 5, "noforms"],
  // generator 0.10.25's land, the land the scenario tests the weathering's reach (0.10.29) moved were written on
  ...[2, 7].map((seed): Entry => ["highlands", 64, seed]),
  ...[22, 24, 4249].map((seed): Entry => ["highlands", 96, seed]),
  ["riverValley", 64, 6],
  ["riverValley", 96, 5],
  ["canyon", 128, 2],
  ["highlands", 96, 22, "vert70"],
  // generator 0.10.27's land (written from dev at 12661aca), where forcePower's seed 4 was chosen; scenario-riverValley-128-4 holds 0.10.22's
  ["riverValley", 128, 4, "v0.10.27"],
];

// The browser specs' maps (tests/e2e, `openSaved`): each the map the page made of its fragment, saved with the generator
// each spec was aimed at (0.10.26)
const PAGE: string[] = [
  "s=4242&z=96&d=n&t=riverValley",
  "s=56&z=96&d=n&t=riverValley",
  "s=1&z=96&d=n&t=riverValley",
  "s=2&z=96&d=n&t=riverValley",
  "s=3&z=96&d=n&t=riverValley",
  "s=4&z=96&d=n&t=riverValley",
  "s=6&z=96&d=n&t=riverValley",
  "s=7&z=96&d=n&t=riverValley",
  "s=13&z=96&d=n&t=riverValley",
  "s=9&z=96&d=n&t=riverValley",
  "s=4242&z=96&d=n&t=riverValley&bw=0",
  "s=8&z=96&d=n&t=riverValley&bw=0",
  "s=7&z=96&d=n&t=riverValley&bw=0&uc=1",
  "s=1&z=96&d=n&t=highlands",
  "s=47&z=96&d=n&t=highlands",
  "s=4242&z=96&d=n&t=highlands",
  "s=4244&z=96&d=n&t=highlands",
  "s=4246&z=96&d=n&t=highlands",
  "s=4&z=96&d=n&t=lakeBasin",
  "s=77&z=96&d=n&t=lakeBasin",
  "s=86&z=96&d=n&t=lakeBasin",
  "s=5&z=128&d=n&t=lakeBasin",
  "s=1&z=128&d=n&t=canyon",
  "s=8&z=128&d=n&t=canyon",
  "s=1&z=96&d=n&t=islands",
  "s=7&z=128&d=n&t=islands",
];

/** Each fixture: its file's name, and the map's spec and whether it has 3D forms. */
const JOBS: { name: string; make: () => { spec: MapSpec; forms: boolean } }[] = [
  ...LIST.map(([theme, size, seed, variant]) => ({
    name: fixtureName(theme, size, seed, variant),
    make: () => {
      const spec = makeSpec({ seed, theme, size: { x: size, y: size } });
      const terracing = /terr(\d+)/.exec(variant ?? "")?.[1];
      if (terracing !== undefined) spec.settings.terrain.terracing = Number(terracing);
      const verticality = /vert(\d+)/.exec(variant ?? "")?.[1];
      if (verticality !== undefined) spec.settings.terrain.verticality = Number(verticality);
      return { spec, forms: !variant?.startsWith("noforms") };
    },
  })),
  // (the spec the page makes of the fragment: App.tsx's initialSpec)
  ...PAGE.map((fragment) => ({ name: pageFixtureName(fragment), make: () => ({ spec: decodeSpecFragment(fragment)!.spec, forms: true }) })),
];

const args = process.argv.slice(2);
const all = args.includes("--all");
const named = args.filter((a) => !a.startsWith("--"));
mkdirSync(FIXTURE_DIR, { recursive: true });
let total = 0;
for (const { name, make } of JOBS) {
  const path = `${FIXTURE_DIR}/${name}`;
  if (named.length ? !named.includes(name.replace(/\.damgoodmaps$/, "")) : !all && existsSync(path)) {
    // (a file on disk holds no stored map, however it got there)
    if (existsSync(path)) {
      const { stored, ...doc } = decodeProject(new Uint8Array(readFileSync(path)));
      if (stored) writeFileSync(path, encodeProject(doc));
      total += readFileSync(path).length;
    }
    continue;
  }
  const { spec, forms } = make();
  const r = generate(spec, forms ? {} : { forms: false });
  // (no stored map: it belongs to one generator version and doubles the file, so the file holds the map's base and its features, as the project of an older generator does)
  const { stored: _stored, ...doc } = decodeProject(MapSession.fromGenerated(r, r.file).project());
  const bytes = encodeProject(doc);
  writeFileSync(path, bytes);
  total += bytes.length;
  console.log(`${name}: ${(bytes.length / 1024).toFixed(0)} KB (generator ${GENERATOR_VERSION})`);
}
console.log(`${JOBS.length} fixtures, ${(total / 1048576).toFixed(2)} MB`);
