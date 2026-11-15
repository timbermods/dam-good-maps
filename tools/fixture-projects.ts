// Writes the scenario tests' fixture projects (tests/fixtures/projects, D148; tests/fixtureProjects.ts says why).
//
//   npm run fixtures:projects            writes every fixture in the list below that is not yet on disk
//   npm run fixtures:projects -- --all   rewrites every fixture from the generator now current (a deliberate refresh)
//   npm run fixtures:projects -- scenario-highlands-64-1 ...   rewrites the named ones (a name without its extension)
//
// A refresh moves the maps the tests stand on: run the quick suite after it and re-aim what moved, as a land change does.
// Add a fixture here when a test needs a map the list lacks, and open it with `fixtureProject`/`fixtureSession`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodeProject, encodeProject } from "../src/core/doc/document";
import { generate } from "../src/core/gen/generate";
import { MapSession } from "../src/core/doc/session";
import { GENERATOR_VERSION, makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { FIXTURE_DIR, fixtureName, type FixtureVariant } from "../tests/fixtureProjects";

type Entry = [theme: ThemeId, size: number, seed: number, variant?: FixtureVariant];

const LIST: Entry[] = [
  // Highlands
  ...[1, 3, 5, 7, 10, 23].map((seed): Entry => ["highlands", 48, seed]), // the collaboration tests, objectsRide
  ...[1, 3, 6, 12, 14].map((seed): Entry => ["highlands", 64, seed]),
  ...[2, 3, 5, 21, 26, 4242].map((seed): Entry => ["highlands", 96, seed]),
  ["highlands", 96, 3, "noforms"],
  ["highlands", 96, 57, "noforms"],
  ["highlands", 96, 4],
  ...[1, 3, 7, 26, 28].map((seed): Entry => ["highlands", 128, seed]),
  // River Valley
  ...[11, 12].map((seed): Entry => ["riverValley", 48, seed]),
  ...[1, 2, 3, 4, 5, 7, 11, 13, 22, 29].map((seed): Entry => ["riverValley", 64, seed]),
  ["riverValley", 64, 20, "noforms"],
  ["riverValley", 64, 29, "noforms"],
  ...[1, 2, 3, 4, 8, 9, 11, 13, 15, 18, 21, 33, 98].map((seed): Entry => ["riverValley", 96, seed]),
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
];

const args = process.argv.slice(2);
const all = args.includes("--all");
const named = args.filter((a) => !a.startsWith("--"));
mkdirSync(FIXTURE_DIR, { recursive: true });
let total = 0;
for (const [theme, size, seed, variant] of LIST) {
  const name = fixtureName(theme, size, seed, variant);
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
  const spec = makeSpec({ seed, theme, size: { x: size, y: size } });
  const terracing = /terr(\d+)/.exec(variant ?? "")?.[1];
  if (terracing !== undefined) spec.settings.terrain.terracing = Number(terracing);
  const r = generate(spec, variant?.startsWith("noforms") ? { forms: false } : {});
  // (no stored map: it belongs to one generator version and doubles the file, so the file holds the map's base and its features, as the project of an older generator does)
  const { stored: _stored, ...doc } = decodeProject(MapSession.fromGenerated(r, r.file).project());
  const bytes = encodeProject(doc);
  writeFileSync(path, bytes);
  total += bytes.length;
  console.log(`${name}: ${(bytes.length / 1024).toFixed(0)} KB (generator ${GENERATOR_VERSION})`);
}
console.log(`${LIST.length} fixtures, ${(total / 1048576).toFixed(2)} MB`);
