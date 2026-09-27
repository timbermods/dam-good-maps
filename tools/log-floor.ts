// The starting-logs floor (PLAN §20 D224), computed from the installed game's own blueprints.
//
//   npx tsx tools/log-floor.ts            prints the computation for the installed game
//   npx tsx tools/log-floor.ts --write    also pins it in src/core/data/log-floor.json
//   npx tsx tools/log-floor.ts --check    fails if the pinned file is for another game version or differs
//
// Every map needs enough logs reachable on foot from the start to reach a Forester by the worst still-viable
// route, plus the first essentials, plus a margin: without a Forester the game is over. For each faction:
//   - the route: the science building (the Forester costs science), a plank mill, the cheapest power that
//     runs the mill (without flowing water: a beaver-powered wheel; with it, also a water wheel), and the
//     Forester itself (its logs, and its planks at the plank recipe's logs per plank);
//   - the essentials: the cheapest water pump and the cheapest dwelling available at the start.
// The floor is the worst faction's route and essentials, plus 10%, and never below 120 logs.
// Rerun it whenever the game's version changes (docs/HANDOFF.md §9); the pinned file records the version.
// It also pins each tree's log yield and whether a dead tree keeps its logs (the Succulent's
// DeadCuttableYieldRemover is the only one that removes them), which the start's wood count uses.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const GAME = process.env.DGM_GAME_DIR ?? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Timberborn";
const OUT = join(import.meta.dirname, "..", "src", "core", "data", "log-floor.json");
const MINIMUM = 120;
const MARGIN = 0.1;
const FACTIONS = ["Folktails", "IronTeeth"] as const;

type Blueprint = Record<string, any>;
const zip = unzipSync(new Uint8Array(readFileSync(join(GAME, "Timberborn_Data", "StreamingAssets", "Modding", "Blueprints.zip"))));
const version = readFileSync(join(GAME, "Timberborn_Data", "StreamingAssets", "Version.txt"), "utf8").trim();
const blueprints = new Map<string, Blueprint>();
for (const [path, bytes] of Object.entries(zip)) {
  if (!path.endsWith(".blueprint.json")) continue;
  blueprints.set(path.replace(/\\/g, "/"), JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, "")));
}

interface Building { name: string; path: string; logs: number; planks: number; other: number; science: number; bp: Blueprint }
const buildings = (dir: string, faction: string): Building[] =>
  [...blueprints]
    .filter(([p]) => p.startsWith(`Buildings/${dir}/`))
    .filter(([p]) => p.endsWith(`.${faction}.blueprint.json`))
    .map(([p, bp]) => {
      const cost: Record<string, number> = {};
      for (const c of bp.BuildingSpec?.BuildingCost ?? []) cost[c.Id] = (cost[c.Id] ?? 0) + c.Amount;
      const other = Object.entries(cost).filter(([g]) => g !== "Log" && g !== "Plank").reduce((s, [, a]) => s + a, 0);
      return { name: p.split("/").pop()!.replace(".blueprint.json", ""), path: p, logs: cost.Log ?? 0, planks: cost.Plank ?? 0, other, science: bp.BuildingSpec?.ScienceCost ?? 0, bp };
    });

const plankRecipe = blueprints.get("Recipes/Recipe.Plank.blueprint.json")?.RecipeSpec;
if (!plankRecipe) throw new Error("no plank recipe in the blueprints");
const logsPerPlank = plankRecipe.Ingredients.find((i: any) => i.Id === "Log").Amount / plankRecipe.Products.find((p: any) => p.Id === "Plank").Amount;
const logCost = (b: Building) => b.logs + b.planks * logsPerPlank;
const cheapest = (list: Building[], what: string) => {
  const usable = list.filter((b) => b.other === 0).sort((a, b) => logCost(a) - logCost(b));
  if (!usable.length) throw new Error(`no ${what}`);
  return usable[0];
};
const atStart = (b: Building) => b.science === 0;
const one = (list: Building[], what: string) => {
  if (list.length !== 1) throw new Error(`expected one ${what}, found ${list.map((b) => b.name).join(", ") || "none"}`);
  return list[0];
};

interface Item { what: string; building: string; logs: number }
function factionFloor(faction: string) {
  const forester = one(buildings("Wood", faction).filter((b) => b.name.startsWith("Forester.")), "Forester");
  const science = cheapest(buildings("Science", faction).filter(atStart).filter((b) => JSON.stringify(b.bp).includes("SciencePoints")), "science building");
  const mill = cheapest(buildings("Wood", faction).filter(atStart).filter((b) => JSON.stringify(b.bp).includes('"Plank"') && b.bp.MechanicalNodeSpec), "plank mill");
  const need = mill.bp.MechanicalNodeSpec.PowerInput;
  const power = buildings("Power", faction).filter(atStart).filter((b) => (b.bp.MechanicalNodeSpec?.PowerOutput ?? 0) >= need);
  const walker = cheapest(power.filter((b) => b.bp.WalkerPoweredGeneratorSpec), "beaver-powered wheel");
  const water = power.filter((b) => b.bp.WaterPoweredGeneratorSpec);
  const flowing = water.length ? cheapest([walker, ...water], "power") : walker;
  const pump = cheapest(buildings("Water", faction).filter(atStart).filter((b) => /(^|[^d])WaterPump\./.test(b.name) || /^DeepWaterPump\./.test(b.name)), "water pump");
  const dwelling = cheapest(buildings("Housing", faction).filter(atStart).filter((b) => b.bp.DwellingSpec), "dwelling");
  const route = (p: Building): Item[] => [
    { what: "science (the Forester costs " + forester.science + " science)", building: science.name, logs: logCost(science) },
    { what: "plank mill (" + need + " power)", building: mill.name, logs: logCost(mill) },
    { what: "power", building: p.name, logs: logCost(p) },
    { what: `Forester (${forester.logs} logs and ${forester.planks} planks)`, building: forester.name, logs: logCost(forester) },
  ];
  const sum = (items: Item[]) => items.reduce((s, i) => s + i.logs, 0);
  const noFlow = route(walker);
  const withFlow = route(flowing);
  const worstRoute = sum(noFlow) >= sum(withFlow) ? { water: "without flowing water", items: noFlow } : { water: "with flowing water", items: withFlow };
  const essentials: Item[] = [
    { what: "water pump", building: pump.name, logs: logCost(pump) },
    { what: "dwelling", building: dwelling.name, logs: logCost(dwelling) },
  ];
  return { faction, route: worstRoute, routeLogs: sum(worstRoute.items), otherRouteLogs: Math.min(sum(noFlow), sum(withFlow)), essentials, essentialsLogs: sum(essentials), total: sum(worstRoute.items) + sum(essentials) };
}

const perFaction = FACTIONS.map(factionFloor);
const worst = perFaction.reduce((a, b) => (b.total > a.total ? b : a));
const computed = Math.ceil(worst.total * (1 + MARGIN));
const floor = Math.max(MINIMUM, computed);

const logsPerTree: Record<string, number> = {};
const deadKeepsLogs: Record<string, boolean> = {};
for (const [p, bp] of blueprints) {
  if (!p.startsWith("NaturalResources/Trees/")) continue;
  const y = bp.CuttableSpec?.Yielder?.Yield;
  if (!y || y.Id !== "Log") continue;
  const name = p.split("/").pop()!.replace(".blueprint.json", "");
  logsPerTree[name] = y.Amount;
  deadKeepsLogs[name] = !bp.DeadCuttableYieldRemoverSpec;
}

const result = {
  gameVersion: version,
  floor,
  minimum: MINIMUM,
  margin: MARGIN,
  computed,
  worst: { faction: worst.faction, route: worst.route, essentials: worst.essentials, total: worst.total },
  byFaction: Object.fromEntries(perFaction.map((f) => [f.faction, { worstRoute: f.routeLogs, cheapestRoute: f.otherRouteLogs, essentials: f.essentialsLogs, total: f.total }])),
  logsPerPlank,
  logsPerTree,
  deadTreesKeepLogs: deadKeepsLogs,
  saplingsCount: false,
  source: "Timberborn_Data/StreamingAssets/Modding/Blueprints.zip (tools/log-floor.ts)",
};

for (const f of perFaction) {
  console.log(`${f.faction}: worst route ${f.routeLogs} logs (${f.route.water}; ${f.route.items.map((i) => `${i.building} ${i.logs}`).join(", ")}), essentials ${f.essentialsLogs} (${f.essentials.map((i) => `${i.building} ${i.logs}`).join(", ")}), total ${f.total}`);
}
console.log(`game ${version}: worst ${worst.faction} ${worst.total} logs; +${MARGIN * 100}% = ${computed}; floor ${floor} (never below ${MINIMUM})`);
console.log(`logs per tree: ${Object.entries(logsPerTree).map(([k, v]) => `${k} ${v}${deadKeepsLogs[k] ? "" : " (none when dead)"}`).join(", ")}`);

const text = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--write")) {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
}
if (process.argv.includes("--check")) {
  const pinned = readFileSync(OUT, "utf8");
  if (pinned !== text) {
    console.error(`src/core/data/log-floor.json differs from the installed game (${version}): run with --write, and record the new floor in PLAN §20`);
    process.exit(1);
  }
  console.log("the pinned floor matches the installed game");
}
