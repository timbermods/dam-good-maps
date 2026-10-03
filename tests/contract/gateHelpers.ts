// Shared by the release gate's tests (investigation/release-gate-core, D385): small generated maps,
// and what a test compares. Only the core's public entry points (generate, MapSession, the project file).
import { createHash } from "node:crypto";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";

const maps = new Map<string, GenerateResult>();

/** A generated map (cached per test file). */
export function map(seed = 1, side = 64, theme?: ThemeId): GenerateResult {
  const key = `${seed} ${side} ${theme ?? ""}`;
  let r = maps.get(key);
  if (!r) {
    r = generate(makeSpec({ seed, size: { x: side, y: side }, ...(theme ? { theme } : {}) }));
    maps.set(key, r);
  }
  return r;
}

export const session = (seed = 1, side = 64, theme?: ThemeId) => MapSession.fromGenerated(map(seed, side, theme));
export const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export const timber = (s: MapSession) => sha(s.exportTimber().bytes);
/** Save the project file and open it again. */
export const reopen = (s: MapSession) => MapSession.open(decodeProject(s.project()));

let n = 0;
/** A fresh lowercase GUID, deterministic within a run. */
export function guid(): string {
  n++;
  const h = createHash("sha256").update(`gate ${n}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
