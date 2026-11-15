// Saved projects the scenario tests open (D148): a test of an edit, a force, a brush, the session, collaboration or the
// water on a given map opens the map from a file saved once, so a change to the generator (a GENERATOR_VERSION bump) moves
// none of them. Only a test whose subject is the generated map itself (its start, its checks, its places, the generator's
// own outputs) generates live.
//
// A fixture is a project file in tests/fixtures/projects, named `scenario-<theme>-<size>-<seed>[-<variant>].damgoodmaps`, saved as
// the app saves a generated map: `MapSession.fromGenerated(generate(makeSpec({ seed, theme, size }), options), r.file)
// .project()`. `npm run fixtures:projects` (tools/fixture-projects.ts) writes every fixture from its list; run it when a
// land change should deliberately move the maps the tests stand on, then re-aim the tests, as before.
//
// A fixture opens exactly as saved: its heights, water and objects are the file's, whatever the generator is now. It opens
// as the current generator's own map (its version relabelled, as carveFallSweep does): a project of an older generator
// opens frozen (session.mode), with its own water and objects, and edits it differently from a live map.

import { readFileSync } from "node:fs";
import { decodeProject, type MapDocument } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";
import { GENERATOR_VERSION, type ThemeId } from "../src/core/spec/mapspec";

export const FIXTURE_DIR = "tests/fixtures/projects";

/** How the map was made beyond its theme, size and seed: `noforms`, generated without 3D forms (`generate`'s `forms: false`, D488), for the tests of a
 *  heightfield's own rules; `terr<N>`, with the Terracing setting at N (0 to 100). Joined by "-", in that order. */
export type FixtureVariant = "noforms" | `terr${number}` | `noforms-terr${number}`;

export const fixtureName = (theme: ThemeId, size: number, seed: number, variant?: FixtureVariant): string => `scenario-${theme}-${size}-${seed}${variant ? `-${variant}` : ""}.damgoodmaps`;

const raw = new Map<string, Uint8Array>();
const relabelled = new Map<string, Uint8Array>();

function fileBytes(name: string): Uint8Array {
  let b = raw.get(name);
  if (!b) {
    try {
      b = new Uint8Array(readFileSync(`${FIXTURE_DIR}/${name}`));
    } catch {
      throw new Error(`no fixture ${FIXTURE_DIR}/${name}: add it to tools/fixture-projects.ts and run \`npm run fixtures:projects\``);
    }
    raw.set(name, b);
  }
  return b;
}

/** The fixture's project file, as the generator now current would have saved it: the same map, labelled as made by it. The file in git holds
 *  no stored map (it would double its bytes, and belongs to one generator version, D367); the map is built from it once in a process
 *  and saved again, so its later opens take the stored map as every project does. */
export function fixtureProject(theme: ThemeId, size: number, seed: number, variant?: FixtureVariant): Uint8Array {
  return namedProject(fixtureName(theme, size, seed, variant));
}

/** A fixture saved under a name of its own (not the scenario list's: a land kept for one case, such as
 *  `preview-riverValley-96-9-leaks.damgoodmaps`, the land a preview case was found on), as `fixtureProject` opens it. */
export function namedProject(name: string): Uint8Array {
  let b = relabelled.get(name);
  if (!b) {
    b = MapSession.open({ ...decodeProject(fileBytes(name)), generatorVersion: GENERATOR_VERSION }).project(1);
    relabelled.set(name, b);
  }
  return b;
}

/** The fixture's document (fresh each call: a session may keep what it opens). */
export const fixtureDoc = (theme: ThemeId, size: number, seed: number, variant?: FixtureVariant): MapDocument => decodeProject(fixtureProject(theme, size, seed, variant));

/** The fixture's map, opened as a session. */
export const fixtureSession = (theme: ThemeId, size: number, seed: number, variant?: FixtureVariant): MapSession => MapSession.open(fixtureDoc(theme, size, seed, variant));

/** A fixture saved under a name of its own, opened as a session. */
export const namedSession = (name: string): MapSession => MapSession.open(decodeProject(namedProject(name)));
