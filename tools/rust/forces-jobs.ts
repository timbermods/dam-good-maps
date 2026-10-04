// The Rust forces' byte fixtures (PLAN §20 D366, D381): fixed jobs for every force on the forces' studies
// (tests/contract/forceFixtures.ts), each verb's settings and gestures varied by k, and a few with odd
// ground (random levels, water, fresh rock, kept tiles, imported objects with their file entries, fallen
// trees, an unleashed source). tools/rust/check.ts runs them natively, in Node's WebAssembly and in each
// engine, and checks every packed result against tools/rust/forces-pins.json: the sha256s pinned when the
// TypeScript forces (tag `ts-forces-final`) gave the same results, so a change to a force shows here.
//
//   npx tsx tools/rust/check.ts                    checks them (CI's rust job)
//   npx tsx tools/rust/forces-jobs.ts > tools/rust/forces-pins.json    pins the current Rust (a deliberate change)

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { FOOTPRINTS } from "../../src/core/format/footprints";
import { F } from "../../src/core/format/json";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { executeInRust, jobBytes, type RustJob, type RustVerb } from "../../src/core/forces/rust/bridge";
import { fixture } from "../../tests/contract/forceFixtures";

const VERBS: RustVerb[] = ["craterize", "erupt", "quake", "carve", "glaciate"];

/** A plain job: verb, a W × W study, variant k. */
function job(verb: RustVerb, n: number, k: number): RustJob {
  const map = fixture(k % 4 === 0 ? "lake" : k % 4 === 1 ? "slide" : k % 4 === 2 ? "plain" : "river", n);
  const origin = Math.floor(n * 0.38) * n + Math.floor(n * 0.48);
  const path = [{ x: n * 0.3, y: n * 0.3 }, { x: n * 0.5, y: n * 0.7 }, { x: n * 0.7, y: n * 0.5 }];
  const end = Math.floor(n * 0.78) * n + Math.floor(n * 0.72);
  const keep = new Uint8Array(n * n);
  const power = k % 3 === 0 ? 100 : k % 3 === 1 ? 0 : 55;
  switch (verb) {
    case "carve":
      return { verb, map, keep, settings: { ...CARVE_DEFAULTS, power: 100, seed: k, mode: k % 2 ? "aim" : "unleash", defyGravity: true }, intent: k % 2 ? { origin, end } : { origin } };
    case "erupt":
      return { verb, map, keep, settings: { ...ERUPT_DEFAULTS, power, size: k % 2 ? null : 48, seed: k, shape: k % 2 ? "steep" : "broad", summit: ["auto", "peak", "crater", "caldera"][k % 4], flows: k % 2 ? "heavy" : "light", ridges: k % 3 !== 0, floor: 1 + (k % 9), mode: k % 2 ? "fissure" : "vent" }, intent: { origin, path } };
    case "quake":
      return { verb, map, keep, settings: { ...QUAKE_DEFAULTS, power, seed: k, scarp: k % 2 ? "sheer" : "stepped", floor: 1 + (k % 9), mode: k % 2 ? "slide" : "lift" }, intent: { path, side: k % 3 === 0 ? -1 : 1 } };
    case "glaciate":
      return { verb, map, keep, settings: { ...GLACIATE_DEFAULTS, power, seed: k, mode: k % 2 ? "aim" : "flow" }, intent: k % 2 ? { origin, end } : { origin } };
    case "craterize":
      return { verb, map, keep, settings: { ...CRATER_DEFAULTS, power, size: k % 2 ? null : 48, seed: k, walls: k % 2 ? "steep" : "terraced", centre: ["auto", "bowl", "peak", "ring", "flat"][k % 5], debris: k % 2 ? "heavy" : "light", rays: k % 3 !== 0, floor: 1 + (k % 9), mode: k % 2 ? "aim" : "strike" }, intent: k % 2 ? { origin, end: Math.floor(n * 0.6) * n + Math.floor(n * 0.8) } : { origin } };
  }
}

/** A job on odd ground, its settings drawn at random from k (the edges of every range among them). */
function oddJob(verb: RustVerb, n: number, k: number): RustJob {
  const j = job(verb, n, k);
  const map = j.map;
  const keep = j.keep!;
  let state = ((k + 1) * 15485863) >>> 0;
  const u = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const pick = <T>(a: T[]): T => a[Math.floor(u() * a.length)];
  const tile = () => Math.floor(u() * n * n);
  const power = pick([0, 100, 100 * u()]);
  const seed = pick([0, 0xffffffff, Math.floor(u() * 4294967296)]);
  for (let i = 0; i < map.heights.length; i++) {
    if (i % 37 === k % 37) map.heights[i] = Math.floor(u() * 23);
    if (i % 71 === k % 71) {
      map.water.depth[i] = u() * 3;
      map.water.contamination[i] = u();
    }
    map.lava[i] = (Math.floor(u() * 8388608) & ((1 << map.heights[i]) - 1)) >>> 0;
    if (i % 997 === k % 997) keep[i] = pick([1, 2]);
  }
  map.rockLayers = Array.from({ length: 23 }, () => pick([0, 1, u()]));
  const templates = Object.keys(FOOTPRINTS).filter((t) => FOOTPRINTS[t].size[0] <= 8 && FOOTPRINTS[t].size[1] <= 8);
  for (let i = 0; i < 24; i++) {
    const template = pick(templates);
    const x = Math.floor(u() * (n - 16)) + 8;
    const y = Math.floor(u() * (n - 16)) + 8;
    const owner = pick(["test", "pinned:test", "derived:slopes"]);
    const orientation = pick(["Cw0", "Cw90", "Cw180", "Cw270"] as const);
    const flipped = u() < 0.5;
    const z = map.heights[y * n + x];
    const id = "extra-" + i;
    map.entities.push({
      id,
      owner,
      template,
      x,
      y,
      z,
      orientation,
      flipped,
      components: { LivingNaturalResource: { IsDead: false }, WaterSource: { SpecifiedStrength: 2.7 } },
      raw: { Id: id, Template: template, Components: { UnknownFixture: { sentinel: F(0.12345678901234567) }, BlockObject: { Coordinates: { X: x, Y: y, Z: z }, Orientation: orientation, Flipped: flipped }, LivingNaturalResource: { IsDead: false }, WaterSource: { SpecifiedStrength: F(2.7) } } },
    });
  }
  map.fallen = map.entities
    .filter((e) => e.template === "Pine")
    .slice(0, 3)
    .map((e) => ({ id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: e.z, dx: 0.6, dy: -0.8, length: 2 }));
  const origin = tile();
  const end = tile();
  const s = j.settings as Record<string, unknown>;
  if (verb === "craterize") {
    j.settings = { ...s, power, seed, size: pick([null, 4, 180, 4 + u() * 176]), walls: pick(["steep", "terraced"]), centre: pick(["auto", "bowl", "peak", "ring", "flat"]), debris: pick(["light", "heavy"]), rays: u() < 0.5, mode: pick(["strike", "aim"]), floor: 1 + Math.floor(u() * 22) };
    j.intent = { origin, end };
  }
  if (verb === "erupt") {
    j.settings = { ...s, power, seed, size: pick([null, 6, 140, 6 + u() * 134]), shape: pick(["steep", "broad"]), summit: pick(["auto", "peak", "crater", "caldera"]), flows: pick(["light", "heavy"]), ridges: u() < 0.5, mode: pick(["vent", "fissure"]), floor: 1 + Math.floor(u() * 22) };
    j.intent = { origin, path: Array.from({ length: 2 + Math.floor(u() * 6) }, () => ({ x: 2 + u() * (n - 5), y: 2 + u() * (n - 5) })) };
  }
  if (verb === "quake") {
    j.settings = { ...s, power, seed, scarp: pick(["sheer", "stepped"]), mode: pick(["lift", "slide"]), floor: 1 + Math.floor(u() * 22) };
    j.intent = { side: pick([-1, 1]), path: Array.from({ length: 2 + Math.floor(u() * 6) }, () => ({ x: u() * (n - 1), y: u() * (n - 1) })) };
  }
  if (verb === "carve") {
    const aimed = u() < 0.5;
    const via = aimed && u() < 0.5 ? Array.from({ length: Math.floor(u() * 5) }, tile) : undefined;
    const settings: Record<string, unknown> = { ...s, power, seed, mode: aimed ? "aim" : "unleash", wander: pick([0, 35, 85, 100, 100 * u()]), width: pick([null, 2, 24, 2 + u() * 22]), depth: pick([null, 1, 12, 1 + Math.floor(u() * 12)]), walls: pick(["steep", "wide"]), defyGravity: u() < 0.5, dry: u() < 0.5, layers: u() < 0.5, floor: 1 + Math.floor(u() * 22), riverDepth: pick([null, 1, 22, 1 + Math.floor(u() * 22)]), banks: pick([null, 0, 10, 10 * u()]) };
    const intent: { origin: number; end?: number; via?: number[] } = aimed ? { origin, end: end === origin ? (end + 1) % (n * n) : end, ...(via ? { via } : {}) } : { origin };
    const options: RustJob["options"] = { sourceId: k % 17 === 0 ? "start" : "fixture-source-" + k };
    const unleashed = map.entities.find((e) => e.template === "WaterSource");
    if (unleashed && k % 13 === 0) {
      options.unleashed = unleashed.id;
      options.bad = k % 2 === 0;
      settings.dry = true;
      intent.origin = unleashed.y * n + unleashed.x;
    }
    for (const i of [origin, intent.end, ...(via ?? [])]) if (i !== undefined) keep[i] = 0;
    j.settings = settings;
    j.intent = intent;
    j.options = options;
  }
  if (verb === "glaciate") {
    const aimed = u() < 0.5;
    const via = aimed && u() < 0.5 ? Array.from({ length: Math.floor(u() * 5) }, tile) : undefined;
    j.settings = { ...s, power, seed, size: pick([null, 4, 64, 4 + u() * 60]), mode: aimed ? "aim" : "flow", meltwater: u() < 0.5, benches: pick(["none", "some", "many"]), steps: pick(["few", "some", "many"]), tarn: u() < 0.5, scree: u() < 0.5, floor: 1 + Math.floor(u() * 22) };
    j.intent = aimed ? { origin, end: end === origin ? (end + 1) % (n * n) : end, ...(via ? { via } : {}) } : { origin };
  }
  return j;
}

/** Every fixture's job, by name. */
export function forceJobs(): { name: string; job: RustJob }[] {
  const out: { name: string; job: RustJob }[] = [];
  for (const verb of VERBS) {
    for (let k = 0; k < 4; k++) out.push({ name: `${verb} 64 ${k}`, job: job(verb, 64, k) });
    for (let k = 0; k < 2; k++) out.push({ name: `${verb} 64 odd ${k}`, job: oddJob(verb, 64, k) });
  }
  return out;
}

/** Every fixture: its name and its job's bytes (the format the Rust reads, protocol.ts). */
export function forceFixtures(): { name: string; job: Uint8Array }[] {
  return forceJobs().map(({ name, job }) => ({ name, job: jobBytes(job) }));
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pins: Record<string, string> = {};
  for (const f of forceFixtures()) pins[f.name] = sha256(executeInRust(f.job));
  console.log(JSON.stringify(pins, null, 2));
}
