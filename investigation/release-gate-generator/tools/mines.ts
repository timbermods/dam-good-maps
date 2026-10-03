// Item 47's distances (D278, D325): each mine site's distance from the start (walk, by the analysis's
// chamfer distance over the walk), the nearest badwater, berries near the start.
import { generate } from "../../../src/core/gen/generate";
import { makeSpec, THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
const size = Number(process.argv[2] ?? 96);
const [sf, st] = (process.argv[3] ?? "1-5").split("-").map(Number);
for (const theme of THEMES as ThemeId[])
  for (let seed = sf; seed <= st; seed++) {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const W = r.built.W;
    const start = r.built.entities.find((e) => e.template === "StartingLocation");
    const sd = r.analysis?.startDistance;
    const mines = r.built.entities.filter((e) => e.template === "UndergroundRuins").map((e) => {
      const cheb = start ? Math.max(Math.abs(e.x + 2 - (start.x + 1)), Math.abs(e.y + 2 - (start.y + 1))) : -1;
      const walk = sd ? Math.round(sd[(e.y + 2) * W + e.x + 2] * 10) / 10 : -1;
      return `${cheb}/${walk}`;
    });
    const food = r.report.checks.find((c) => c.id === "start.food");
    const mine = r.report.checks.find((c) => c.id === "resources.mine_site");
    console.log(`${theme} ${size} ${seed} passed=${r.report.passed} mines(cheb/walk)=${mines.join(" ")} mineCheck=${mine?.value}/${mine?.limit} badwater=${r.analysis?.levers?.badwater} food=${food?.value}/${food?.limit}`);
  }
