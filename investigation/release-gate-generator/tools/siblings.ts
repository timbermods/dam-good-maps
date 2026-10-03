// Another like this (D278 (1c)): a sibling keeps the theme, settings and intentions. Lake Basin's
// round-2 shaping (generate.ts: `shapeLakeBasin`, D453, D458) runs only on a spec with no intentions,
// so a sibling (or a candidates-strip version) of a Lake Basin map is shaped by the shared path
// instead. Measures the promise on the map and on its first sibling, per theme.
import { generate } from "../../../src/core/gen/generate";
import { makeSpec, type MapSpec, type ThemeId } from "../../../src/core/spec/mapspec";
const size = Number(process.argv[2] ?? 96);
const [sf, st] = (process.argv[3] ?? "1-10").split("-").map(Number);
for (const theme of (process.argv[4] ?? "lakeBasin,riverValley").split(",") as ThemeId[]) {
  let mapP = 0, sibP = 0, n = 0, mapMet = 0, sibMet = 0;
  for (let seed = sf; seed <= st; seed++) {
    const spec = makeSpec({ seed, theme, size: { x: size, y: size } });
    const r = generate(spec);
    const drawn = r.info.genome?.intentions ?? [];
    const sib: MapSpec = { ...spec, variation: 1, intentions: drawn };
    const s = generate(sib);
    n++;
    if (r.outcomes?.promise) mapP++;
    if (s.outcomes?.promise) sibP++;
    if (r.outcomes?.met) mapMet++;
    if (s.outcomes?.met) sibMet++;
    console.log(`${theme} ${size} ${seed} map: ${r.outcomes?.summary} | sibling: ${s.outcomes?.summary} | passed ${r.report.passed}/${s.report.passed} attempts ${r.attempts}/${s.attempts}`);
  }
  console.log(`== ${theme} ${size}: promise kept on ${mapP}/${n} maps, ${sibP}/${n} siblings; all three met ${mapMet}/${n} maps, ${sibMet}/${n} siblings`);
}
