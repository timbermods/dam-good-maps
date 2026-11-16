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
//
// The browser specs (tests/e2e) that test the editor on some land open theirs the same way, through the page's own Open
// (`openSaved`, tests/e2e/open.ts): `page-<theme>-<size>-<seed>[-<setting><value>…].damgoodmaps`, the map the page makes
// of a spec fragment ("s=44&z=96&d=n&t=riverValley"), saved once, so a land change moves none of their tiles either.

import { readFileSync } from "node:fs";
import { decodeProject, type MapDocument } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";
import { GENERATOR_VERSION, type ThemeId } from "../src/core/spec/mapspec";

export const FIXTURE_DIR = "tests/fixtures/projects";

/** How the map was made beyond its theme, size and seed: `noforms`, generated without 3D forms (`generate`'s `forms: false`, D488), for the tests of a
 *  heightfield's own rules; `terr<N>`, with the Terracing setting at N (0 to 100). Joined by "-", in that order. */
export type FixtureVariant = "noforms" | `terr${number}` | `noforms-terr${number}` | `vert${number}`;

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
export const fixtureProject = (theme: ThemeId, size: number, seed: number, variant?: FixtureVariant): Uint8Array => relabel(fixtureName(theme, size, seed, variant));

/** A browser spec's fixture's name: `page-<theme>-<size>-<seed>`, then each other setting of the fragment as its key and value
 *  ("s=7&z=96&d=n&t=riverValley&bw=0&uc=1": `page-riverValley-96-7-bw0-uc1.damgoodmaps`). The fragment names its theme, size and
 *  seed, and makes the map for Normal (`d=n`), as every map is made. */
export function pageFixtureName(fragment: string): string {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const [t, z, s, d] = ["t", "z", "s", "d"].map((k) => params.get(k));
  if (!t || !z || !s || (d !== null && d !== "n")) throw new Error(`a page fixture's fragment names its theme, size and seed, made for Normal: ${fragment}`);
  const rest = [...params].filter(([k]) => !["t", "z", "s", "d", "v"].includes(k)).map(([k, v]) => `-${k}${v}`);
  return `page-${t}-${z}-${s}${rest.join("")}.damgoodmaps`;
}

/** A browser spec's fixture's project file (the map the page makes of `fragment`, saved), as `fixtureProject` gives a scenario's. */
export const pageFixtureProject = (fragment: string): Uint8Array => relabel(pageFixtureName(fragment));

/** A fixture saved under a name of its own (not the scenario list's: a land kept for one case, such as
 *  `preview-riverValley-96-9-leaks.damgoodmaps`, the land a preview case was found on), as `fixtureProject` opens it. */
export const namedProject = (name: string): Uint8Array => relabel(name);

function relabel(name: string): Uint8Array {
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
