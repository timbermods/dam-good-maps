import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [size, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds) {
  const lines: string[] = [];
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }), { onAttempt: (a) => {
    const rep: any = a.result.report; const fails = (rep?.checks ?? []).filter((c: any) => c.passed === false).map((c: any) => c.id ?? c.name).slice(0, 4);
    const f = (a.result as any).failures ?? [];
    const inf: any = a.result.info; const last = f[f.length - 1];
    lines.push(`  attempt ${a.attempt} ${a.passed ? "passed" : "failed"} layout=${inf?.genome?.seaLayout} ring=${inf?.genome?.seaRing} planned=${JSON.stringify(inf?.planned)} why=${last && last.attempt === a.attempt ? JSON.stringify(last.failed) : "?"}`);
  } } as any);
  console.log("seed", seed, "attempts", r.attempts);
  for (const f of ((r as any).failures ?? []) as { attempt: number; failed: string[] }[]) console.log("  failed", f.attempt, JSON.stringify(f.failed));
  for (const l of lines) console.log(l);
}
