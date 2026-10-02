import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
for (const size of [128, 256]) {
  const spec = makeSpec({ seed: 4242, size: { x: size, y: size }, designedFor: "normal", archetype: "riverValley" } as any);
  const t0 = performance.now();
  const r = generate(spec);
  const kinds: Record<string, number> = {};
  for (const f of r.features) kinds[(f as any).kind] = (kinds[(f as any).kind] ?? 0) + 1;
  console.log(size, Math.round(performance.now() - t0), "ms", r.report.passed, JSON.stringify(kinds), r.spec.archetype);
  const e = r.built.entities.map((x: any) => x.template ?? x.Template ?? x.kind).filter(Boolean);
  const c: Record<string, number> = {}; for (const t of e) c[t] = (c[t] ?? 0) + 1;
  console.log(Object.entries(c).filter(([k]) => /Water|Source|Bad/i.test(k)));
}
