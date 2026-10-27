// The round's measures on today's dev, before -> after its adoption (generator 0.8.4 -> 0.8.5): the
// three outcomes, the largest flood sheet (`info.sheet`) and the cliff splits of the maps that drew one,
// read from batch.ts's local/<mode>/ folders. Run batch.ts with RV_MODE=dev on dev, then with
// RV_MODE=after once the patch is applied, then `npx tsx investigation/river-valley-sheets/compare.ts`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkIntention } from "../../src/core/land/intentions";

const root = join(import.meta.dirname, "local");
const modes = (process.env.RV_MODES || "dev,after").split(",");
for (const mode of modes) {
  const ms = JSON.parse(readFileSync(join(root, mode, "measures.json"), "utf8"));
  const sheets = ms.map((m: any) => m.sheet ?? 0).sort((a: number, b: number) => a - b);
  const splits: string[] = [];
  for (const m of ms) {
    const r = JSON.parse(readFileSync(join(root, mode, `${m.seed}.json`), "utf8"));
    if (!r.intentions.some((i: any) => (i.id ?? i) === "upper-lower" || (i.id ?? i) === "under-cliff")) continue;
    const c = checkIntention("upper-lower", { W: r.W, H: r.H, h: r.heights, start: r.start } as any);
    splits.push(`${m.seed} ${/spans (\d+)%/.exec(c.note ?? "")?.[1] ?? "?"}%`);
  }
  console.log(JSON.stringify({
    mode,
    passed: ms.filter((m: any) => m.passed).length,
    promise: ms.filter((m: any) => m.promise).length,
    readable: ms.filter((m: any) => m.readable).length,
    allThree: ms.filter((m: any) => m.promise && m.readable && m.standout).length,
    promiseFailures: ms.filter((m: any) => !m.promise).map((m: any) => m.seed),
    readableFailures: ms.filter((m: any) => !m.readable).map((m: any) => m.seed),
    sheetMedian: sheets[Math.floor(sheets.length / 2)],
    sheetsOver10pc: ms.filter((m: any) => (m.sheet ?? 0) > 0.1).map((m: any) => m.seed),
    cliffSplits: splits,
  }));
}
