import { generate } from "../../../src/core/gen/generate";
import { decodeSpecFragment } from "../../../src/core/spec/mapspec";
for (const frag of ["s=5&t=riverValley&z=96", "s=5&t=riverValley&z=96&sm=AAAAAA", "s=5&t=riverValley&z=96&sm=AAAAZA", "s=5&t=riverValley&z=96&sm=ZAAAAA", "s=5&t=riverValley&z=96&sm=AAAZAA", "s=5&t=riverValley&z=96&sm=AABkAA", "s=7&t=highlands&z=96&sm=AAAAZA", "s=7&t=highlands&z=96&sm=AAAAZA&d=h"]) {
  const d = decodeSpecFragment(frag)!;
  const r = generate(d.spec);
  const n: Record<string, number> = {};
  for (const e of r.built.entities) if (/^(Pine|Birch|Oak|Succulent)$/.test(e.template)) n[e.template] = (n[e.template] ?? 0) + 1;
  const wood = r.report.checks.find((c) => c.id === "start.wood")!;
  const floor = r.report.checks.find((c) => c.id === "start.wood_floor")!;
  console.log(frag, "mix", JSON.stringify(r.spec.settings.resources.speciesMix), "planted", JSON.stringify(n), "passed", r.report.passed, "| wood", wood.value, "/", wood.limit, "| floor", floor.value, "/", floor.limit, "problems", d.problems.join(";"));
}
