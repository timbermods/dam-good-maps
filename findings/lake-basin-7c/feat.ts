import { generate } from "../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
const [theme, seed, size] = process.argv.slice(2);
const spec = makeSpec({ seed: Number(seed), theme: theme as ThemeId, size: { x: Number(size), y: Number(size) }, designedFor: "normal" as never });
const r = generate(spec);
for (const f of r.features as any[]) {
  const pts = f.path ?? f.points ?? f.line ?? null;
  console.log(f.kind ?? f.type, f.role ?? "", f.id, pts ? `${pts.length} pts from ${JSON.stringify(pts[0])} to ${JSON.stringify(pts[pts.length - 1])}` : Object.keys(f).join(","));
}
