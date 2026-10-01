import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { fullMap, plainEntities } from "../../src/core/forces/force";
mkdirSync("maps", { recursive: true });
for (const [name, theme, seed] of [["highlands", "highlands", 5], ["canyon", "canyon", 2], ["lake", "lakeBasin", 4]] as const) {
  const t = performance.now(), spec = makeSpec({ theme, seed, size: { x: 128, y: 128 } });
  if(name === "canyon") spec.settings.hazards.badwater = "off";
  const g = generate(spec); if (!g.report.passed) throw Error("Generator failed");
  const b = g.built;
  const m = fullMap({ W: b.W, H: b.H, maxHeight: 22, heights: b.heights, entities: plainEntities(b.entities), water: { depth: b.water, contamination: b.contamination } });
  const json = { source: `src/core/gen/generate.ts · ${theme} · seed ${seed} · 128² · base 9e14f189`, spec,
    ...m, heights: [...m.heights], lava: [...m.lava], water: { depth: [...m.water.depth], contamination: [...m.water.contamination] } };
  const bytes = gzipSync(JSON.stringify(json), { level: 9 }); writeFileSync(`maps/${name}.json.gz`, bytes);
  console.log(name, bytes.length, "bytes", Math.round(performance.now() - t), "ms");
}
