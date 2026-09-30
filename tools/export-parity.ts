// The game's values for the objects the shelf places by the game's rules (PLAN §20 D337, D338, D339), read from the
// installed game's blueprints and pinned in src/core/data/parity-values.json (parity.ts says where each value comes from).
//
//   npx tsx tools/export-parity.ts            prints what it read
//   npx tsx tools/export-parity.ts --write    also pins it in src/core/data/parity-values.json
//   npx tsx tools/export-parity.ts --check    fails if the pinned file is for another game version or differs
//
// Reads Timberborn_Data/StreamingAssets/Modding/Blueprints.zip and Localizations.zip (read only, never copied into
// the repository). Rerun it whenever the game's version changes (docs/HANDOFF.md §9).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const GAME = process.env.DGM_GAME_DIR ?? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Timberborn";
const OUT = join(import.meta.dirname, "..", "src", "core", "data", "parity-values.json");
const MODDING = join(GAME, "Timberborn_Data", "StreamingAssets", "Modding");

type Blueprint = Record<string, any>;
const blueprints = new Map<string, Blueprint>();
for (const [path, bytes] of Object.entries(unzipSync(new Uint8Array(readFileSync(join(MODDING, "Blueprints.zip")))))) {
  if (path.endsWith(".blueprint.json")) blueprints.set(path.replace(/\\/g, "/"), JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, "")));
}
const get = (path: string): Blueprint => {
  const b = blueprints.get(path);
  if (!b) throw new Error(`the game has no ${path}`);
  return b;
};
const version = readFileSync(join(GAME, "Timberborn_Data", "StreamingAssets", "Version.txt"), "utf8").trim();
const size = (b: Blueprint): [number, number, number] => [b.BlockObjectSpec.Size.X, b.BlockObjectSpec.Size.Y, b.BlockObjectSpec.Size.Z];

const out: Record<string, unknown> = { gameVersion: version, maxStrengthPerTile: get("Configurations/WaterStrength.blueprint.json").WaterStrengthSpec.MaxWaterSourceStrength };

const fluids: Record<string, unknown> = {};
for (const [path, b] of [...blueprints].filter(([p]) => p.startsWith("MapEditor/Water/")).sort((a, c) => a[0].localeCompare(c[0]))) {
  const name = b.TemplateSpec.TemplateName as string;
  const w = b.WaterSourceSpec;
  const d: Record<string, unknown> = { size: size(b), flippable: b.BlockObjectSpec.Flippable, timed: b.TimedComponentActivatorSpec !== undefined };
  if (w) {
    d.tiles = w.Coordinates.map((c: any) => [c.X, c.Y]);
    d.defaultStrength = w.DefaultStrength;
    d.contamination = b.WaterSourceContaminationSpec.DefaultContamination;
  }
  if (b.WaterDepthStrengthModifierSpec) d.depthLimit = b.WaterDepthStrengthModifierSpec.DepthLimit;
  if (b.HazardousWeatherWaterSourceSpec) d.activeIn = b.HazardousWeatherWaterSourceSpec.ActiveInHazardousWeather;
  if (b.UndergroundWaterSourceSpec) d.needsDrill = true;
  if (b.UnderstructureConstraintSpec) d.on = b.UnderstructureConstraintSpec.UnderstructureTemplateNames;
  fluids[name] = d;
  void path;
}
out.fluids = fluids;
const timed = get("MapEditor/Water/WaterSource/WaterSource.blueprint.json").TimedComponentActivatorSpec;
// (the map editor's fields: cycles from 1, days from 0: TimedComponentActivatorSettingsFragment; a seep switches on again at 0.9 of its limit: WaterDepthStrengthModifier.HysteresisBottomScale)
out.timed = { cycles: timed.CyclesUntilCountdownActivation, days: timed.DaysUntilActivation, minCycles: 1, minDays: 0 };
out.seepRestartScale = 0.9;
const core = get("MapEditor/Objects/UnstableCore/UnstableCore.blueprint.json");
out.core = {
  minRadius: core.UnstableCoreSpec.MinExplosionRadius,
  maxRadius: core.UnstableCoreSpec.MaxExplosionRadius,
  defaultRadius: core.UnstableCoreSpec.DefaultExplosionRadius,
  innerRadius: core.UnstableCoreSpec.InnerRadius,
  cycles: core.TimedComponentActivatorSpec.CyclesUntilCountdownActivation,
  days: core.TimedComponentActivatorSpec.DaysUntilActivation,
  optional: core.TimedComponentActivatorSpec.IsOptionallyActivable,
  minCycles: 1,
  minDays: 0,
};
const reserves: Record<string, unknown> = {};
for (const n of ["ReservePile", "ReserveWarehouse", "ReserveTank"]) {
  const b = get(`MapEditor/Objects/${n}/${n}.blueprint.json`);
  reserves[n] = { type: b.StockpileSpec.WhitelistedGoodType, capacity: b.StockpileSpec.MaxCapacity, cost: Object.fromEntries((b.BuildingSpec.BuildingCost as any[]).map((c) => [c.Id, c.Amount])), size: size(b) };
}
out.reserves = reserves;

const goodType = new Map<string, string>();
for (const [p, b] of blueprints) if (p.startsWith("Goods/")) goodType.set(b.GoodSpec.Id, b.GoodSpec.GoodType);
const common = new Set<string>(get("GoodCollections/GoodCollection.Common.blueprint.json").GoodCollectionSpec.Goods);
const goods: Record<string, { common: string[]; other: string[] }> = {};
for (const t of ["Pileable", "Box", "Liquid"]) {
  const ids = [...goodType].filter(([, ty]) => ty === t).map(([id]) => id).sort();
  goods[t] = { common: ids.filter((i) => common.has(i)), other: ids.filter((i) => !common.has(i)) };
}
out.goods = goods;
// a new reserve holds the first good of its type in the game's list: the ones every faction has first, then by English plural name
// (FixedStockpileGoodProvider.GetGoods, GetGoodOrder), and is filled to capacity (FixedStockpileInventorySetter)
const names = new Map<string, string>();
for (const line of strFromU8(unzipSync(new Uint8Array(readFileSync(join(MODDING, "Localizations.zip"))))["enUS.csv"]).split(/\r?\n/)) {
  const m = /^Good\.([A-Za-z]+)\.PluralDisplayName,("[^"]*"|[^,]*)/.exec(line);
  if (m) names.set(m[1], m[2].replace(/^"|"$/g, ""));
}
out.defaultGood = Object.fromEntries(Object.entries(goods).map(([t, g]) => [t, [...g.common].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b))[0]]));

/** JSON with the small arrays on one line, as the pinned file is written. */
function pretty(v: unknown): string {
  const text = JSON.stringify(v, null, 2);
  return text.replace(/\[\s*((?:-?[0-9.]+|"[A-Za-z]+"|\[[^\[\]]*\])(?:\s*,\s*(?:-?[0-9.]+|"[A-Za-z]+"|\[[^\[\]]*\]))*)\s*\]/g, (_m, inner: string) => `[${inner.replace(/\s+/g, " ").trim()}]`);
}
const text = pretty(out) + "\n";
if (process.argv.includes("--write")) {
  writeFileSync(OUT, text);
  console.log(`pinned ${OUT} for ${version}`);
} else if (process.argv.includes("--check")) {
  const pinned = JSON.parse(readFileSync(OUT, "utf8"));
  if (JSON.stringify(pinned) !== JSON.stringify(JSON.parse(text))) {
    console.error(`src/core/data/parity-values.json is not what the installed game (${version}) says: rerun tools/export-parity.ts --write`);
    process.exit(1);
  }
  console.log(`src/core/data/parity-values.json matches the game (${version})`);
} else console.log(text);
