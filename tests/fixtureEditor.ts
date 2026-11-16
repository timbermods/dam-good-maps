// A fixture (tests/fixtureProjects.ts) shown in the editor's worker, for the tests of the session worker (src/worker/session.ts).

import * as ed from "../src/worker/session";
import type { ThemeId } from "../src/core/spec/mapspec";
import { fixtureSession, namedSession, type FixtureVariant } from "./fixtureProjects";

/** The fixture shown in the editor's worker as the map just generated is (`refine`), with its water settled as the generator's. */
export const fixtureInEditor = (theme: ThemeId, size: number, seed: number, variant?: FixtureVariant): ed.SessionOpen => ed.collabOpen(fixtureSession(theme, size, seed, variant));

/** A fixture saved under a name of its own (`namedProject`), shown in the editor's worker as `fixtureInEditor` shows one. */
export const namedInEditor = (name: string): ed.SessionOpen => ed.collabOpen(namedSession(name));
