// A premise map from a plan, through stage 2 (docs/PREMISES.md §7 step 3): the plan's water by number (stage 1), the
// relief between (stage 2), the start where the plan's frame puts it (stage 3's full frame check is a later step),
// the plan's sources and rows of Blockages as features, then one build by the generator's own `buildMap` (one
// canonical settle) and its checks in profile "generate". What the generator's mode (step 4) will call; for now
// `tools/premise-map.ts` writes its `.timber` and project. Generate's maps do not change.

import type { BuildResult, GeneratedField } from "../features/build";
import { buildMap } from "../features/build";
import { featureId } from "../features/ids";
import type { Feature, LakeFeature, MapObjectFeature, SetPieceFeature, StartFeature } from "../features/schema";
import type { TimberFile } from "../format/timber";
import { fieldData, validateBuilt } from "../gen/generate";
import { toTimberFile } from "../gen/pack";
import type { FieldData } from "../doc/document";
import { tilesToRuns } from "../math/grid";
import type { MapSpec } from "../spec/mapspec";
import type { ValidationReport } from "../validate/report";
import { badwaterNiches, reliefBetween } from "./raster/relief";
import type { PremisePlan } from "./types";
import { waterByNumber, type StageWater } from "./water";

export interface PremiseMap {
  plan: PremisePlan;
  water: StageWater;
  /** Stage 2's ground: the field the build starts from. */
  heights: Uint8Array;
  features: Feature[];
  field: FieldData;
  built: BuildResult;
  file: TimberFile;
  report: ValidationReport;
  name: string;
  /** What could not stand as the plan has it, one line each (never silent, D342). */
  notes: string[];
}

/** The map's name: its start's lake and the landmark, from the plan's own names. */
function nameOf(plan: PremisePlan): string {
  const landmark = plan.names[plan.frame.landmark];
  const lake = plan.stair ? plan.names[plan.stair.startLake] : undefined;
  return landmark ?? lake ?? "Lake Stair";
}

/** The sources of one body as one spring: a lake feature the field already holds (its ground is the field's), its
 *  strength the body's sources' together, at their middle on the body's own water. */
function springsOf(plan: PremisePlan, w: StageWater, notes: string[]): LakeFeature[] {
  const { W } = plan;
  const out: LakeFeature[] = [];
  const byBody = new Map<string, { strength: number; cells: number[] }>();
  w.emitters.forEach((e, k) => {
    const s = plan.sources[k];
    if (s.bad) return;
    if (e.cell < 0) {
      notes.push(`source ${s.id} stands on no water of ${s.into}`);
      return;
    }
    const g = byBody.get(s.into) ?? { strength: 0, cells: [] };
    g.strength += s.strength;
    g.cells.push(e.cell);
    byBody.set(s.into, g);
  });
  for (const [body, g] of byBody) {
    // (the cell nearest the sources' middle)
    let mx = 0;
    let my = 0;
    for (const c of g.cells) {
      mx += c % W;
      my += Math.floor(c / W);
    }
    mx /= g.cells.length;
    my /= g.cells.length;
    let at = g.cells[0];
    let bd = Infinity;
    for (const c of g.cells) {
      const d = (c % W - mx) * (c % W - mx) + (Math.floor(c / W) - my) * (Math.floor(c / W) - my);
      if (d < bd) [bd, at] = [d, c];
    }
    const x = at % W;
    const y = Math.floor(at / W);
    const strength = Math.round(g.strength * 100) / 100;
    out.push({
      id: featureId(plan.seed, "lake", `premise/spring/${body}`),
      kind: "lake",
      origin: "generated",
      role: `premise/spring/${body}`,
      locked: false,
      params: {
        // (a square round the spring's tile: its middle is the tile, so the build's row of sources stands there)
        outline: [[x - 1, y - 1], [x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1]],
        floorDepth: 1,
        outlet: { at: [x, y], sill: w.raster.heights[at], to: "none" },
        inflow: { spring: strength },
        planned: false,
        natural: true,
      },
    });
  }
  return out;
}

/** The permanent badwater source (D200) in its niche (relief.ts `badwaterNiches`). */
function badwaterOf(plan: PremisePlan, heights: Uint8Array, niches: Record<string, [number, number]>): SetPieceFeature[] {
  const out: SetPieceFeature[] = [];
  for (const s of plan.sources) {
    const at = niches[s.id];
    if (!s.bad || !at) continue;
    const [x, y] = at;
    out.push({
      id: featureId(plan.seed, "setPiece", `premise/badwater/${s.id}`),
      kind: "setPiece",
      origin: "generated",
      role: `premise/badwater/${s.id}`,
      locked: false,
      params: {
        kind: "badwaterBasin",
        request: { mode: "basin", at: [x + 1, y + 1], strength: s.strength },
        plan: { mode: "basin", x, y, floor: heights[y * plan.W + x], strength: s.strength, outlet: [], outletLevels: [], outletWidth: 1, outletTo: "edge" },
        report: ["placed by its premise's plan in a niche beside its link's bed; the field holds its ground"],
      },
    });
  }
  return out;
}

/** Each link's rows of Blockages as stage 1 laid them. */
function rowsOf(plan: PremisePlan, w: StageWater): MapObjectFeature[] {
  const out: MapObjectFeature[] = [];
  for (const l of plan.links)
    (w.raster.rows[l.id] ?? []).forEach((row, k) => {
      if (!row.length) return;
      const role = `premise/row/${l.id}/${k}`;
      out.push({ id: featureId(plan.seed, "mapObject", role), kind: "mapObject", origin: "generated", role, locked: false, params: { kind: "plug", placement: { area: tilesToRuns([...row].sort((a, b) => a - b), plan.W) } } });
    });
  return out;
}

/** The map of a plan through stage 2, built and checked as the generator builds its maps. */
export function premiseMap(spec: MapSpec, plan: PremisePlan): PremiseMap {
  const notes: string[] = [];
  const water = waterByNumber(plan);
  const heights = reliefBetween(plan, water);
  const niches = badwaterNiches(plan, water, heights, notes);
  const { x, y, z, orientation } = plan.frame.start;
  const start: StartFeature = {
    id: featureId(plan.seed, "start", "start/main"),
    kind: "start",
    origin: "generated",
    role: "start/main",
    locked: false,
    params: { position: [x, y], orientation, benchRadius: 2, benchLevel: z, player: 0 },
  };
  const springs = springsOf(plan, water, notes);
  const bad = badwaterOf(plan, heights, niches);
  const features: Feature[] = [start, ...springs, ...bad, ...rowsOf(plan, water)];
  const field: GeneratedField = { heights, contains: new Set([...springs, ...bad].map((f) => f.id)), top: plan.top };
  const built = buildMap({ W: plan.W, H: plan.H, seed: spec.seed, features, field });
  const file = toTimberFile(spec, built);
  const report = validateBuilt(spec, features, built, file).report;
  return { plan, water, heights, features, field: fieldData(field, plan.W), built, file, report, name: nameOf(plan), notes };
}
