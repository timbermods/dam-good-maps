// Map setups for the request corpus: a generated map (theme, size, seed, difficulty, settings),
// then edits made through the same steps Claude uses (drawn rivers in every direction), earlier
// conversation turns (for follow-ups), a selected feature, or an import of the map's own file with
// a name and description of our choosing (the safety cases). No official or workshop maps: this
// runs in a cloud session without them.

import { MapSession } from "../../../src/core/doc/session";
import { readTimber, writeTimber } from "../../../src/core/format/timber";
import { generate, type GenerateResult } from "../../../src/core/gen/generate";
import { makeSpec, type Difficulty, type MapSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { applyMergePatch } from "../../../src/core/spec/mergepatch";
import { runProposal } from "./compound";
import { newConversation, type Conversation } from "./conversation";
import { withSetupSteps, type Step } from "./steps";

export interface Setup {
  /** Another setup to start from. */
  base?: string;
  theme?: ThemeId;
  size?: number | [number, number];
  seed?: number;
  designedFor?: Difficulty;
  /** A merge patch on the spec's settings. */
  settings?: Record<string, unknown>;
  /** Steps applied first (as accepted proposals, so they get handles). */
  edits?: { request: string; steps: Step[] }[];
  /** The handle (or role word) of the feature the player has selected. */
  select?: string;
  /** Re-import the map's own .timber with this file name and description. */
  import?: { fileName: string; description?: string };
  note?: string;
}

export interface Opened {
  session: MapSession;
  conv: Conversation;
  spec: MapSpec | null;
  generated: { passed: boolean; attempts: number };
}

const generated = new Map<string, GenerateResult>();

function flatten(setups: Record<string, Setup>, s: Setup, depth = 0): Setup {
  if (!s.base) return s;
  if (depth > 6) throw new Error("setup bases nest too deep");
  const b = setups[s.base];
  if (!b) throw new Error(`unknown base setup ${s.base}`);
  const parent = flatten(setups, b, depth + 1);
  return {
    ...parent,
    ...s,
    base: undefined,
    settings: s.settings ? (applyMergePatch(parent.settings ?? {}, s.settings) as Record<string, unknown>) : parent.settings,
    edits: [...(parent.edits ?? []), ...(s.edits ?? [])],
  };
}

export function specOf(s: Setup): MapSpec {
  const size = Array.isArray(s.size) ? { x: s.size[0], y: s.size[1] } : { x: s.size ?? 128, y: s.size ?? 128 };
  const spec = makeSpec({ seed: s.seed ?? 1, size, theme: s.theme ?? "riverValley", designedFor: s.designedFor ?? "normal" });
  if (s.settings) spec.settings = applyMergePatch(spec.settings, s.settings) as MapSpec["settings"];
  return spec;
}

/** Open a setup: generate (cached), apply its edits as accepted proposals, select, import. */
export function openSetup(setups: Record<string, Setup>, which: string | Setup, seed = 1): Opened {
  const s = flatten(setups, typeof which === "string" ? (setups[which] ?? (() => { throw new Error(`unknown setup ${which}`); })()) : which);
  const spec = specOf(s);
  const key = JSON.stringify(spec);
  let r = generated.get(key);
  if (!r) {
    r = generate(spec);
    generated.set(key, r);
  }
  // a fresh session per request: open the generated document again, so no two requests share
  // a built map
  let session = MapSession.fromGenerated({ ...r, built: r.built });
  try {
    session = MapSession.open(session.document);
  } catch {
    // some generated Lake Basin documents fail their own check on reopening (a ring outline past
    // the schema's bound; see M12-INTEGRATION.md): generate again instead
    session = MapSession.fromGenerated(generate(spec));
  }
  const conv = newConversation(seed);
  for (const e of s.edits ?? []) {
    // a setup may draw creeks and lakes as documents from before D184 hold them
    const res = withSetupSteps(() => runProposal(session, conv, { request: e.request, steps: e.steps }, "propose"));
    if (!res.accepted) throw new Error(`setup edit "${e.request}" failed: ${[...res.errors, ...res.steps.flatMap((x) => x.errors)].join("; ")}`);
  }
  if (s.import) {
    const out = session.exportTimber();
    const file = readTimber(out.bytes);
    if (s.import.description !== undefined && file.metadata) file.metadata = { ...file.metadata, MapDescription: s.import.description };
    session = MapSession.importMap(writeTimber(file), s.import.fileName);
    return { session, conv: newConversation(seed), spec: null, generated: { passed: r.report.passed, attempts: r.attempts } };
  }
  if (s.select) conv.selected = conv.handles[s.select] ?? session.features.find((f) => f.id === s.select || f.role === s.select)?.id ?? null;
  return { session, conv, spec: session.spec, generated: { passed: r.report.passed, attempts: r.attempts } };
}
