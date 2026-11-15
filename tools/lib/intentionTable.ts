// The intention table's count (planning, 2026-11-14, amended 2026-11-15; src/core/land/intentionTable.ts): each
// intention asked of each theme on seeds 1–12 at 128² and at 256², counted where it emerged, on worker threads (one a
// core by default). The tool (tools/intention-table.ts) writes the table, and checks it, a theme and a side a job, in
// Nightly only.

import { cpus } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { generate } from "../../src/core/gen/generate";
import { INTENTIONS, type IntentionId } from "../../src/core/land/intentions";
import { INTENTION_LEAST, INTENTION_SEEDS, INTENTION_SIDES, type IntentionTable, offeredOf, type StyleTheme, STYLE_THEMES } from "../../src/core/land/intentionTable";
import { GENERATOR_VERSION, makeSpec } from "../../src/core/spec/mapspec";

interface Task {
  id: IntentionId;
  theme: StyleTheme;
  seed: number;
  side: number;
}

/** Whether one intention emerged on one map: asked alone of the theme at the side, as generate asks it. */
export function emerged(t: Task): boolean {
  const spec = { ...makeSpec({ seed: t.seed, size: { x: t.side, y: t.side }, theme: t.theme }), intentions: [t.id] };
  try {
    const r = generate(spec);
    return r.report.passed && r.intentions.some((x) => x.id === t.id && x.ok);
  } catch {
    return false;
  }
}

const ROLE = "dgm-intention-table";

if (!isMainThread && (workerData as { role?: string } | null)?.role === ROLE) {
  parentPort!.on("message", (t: Task) => parentPort!.postMessage({ t, ok: emerged(t) }));
}

/** What to count: the themes, the sides and the intentions (all by default). */
export interface Scope {
  themes?: readonly StyleTheme[];
  sides?: readonly number[];
  ids?: readonly IntentionId[];
}

/** Count the intentions in `scope` on its themes and sides, `threads` maps at once (the largest maps first, so the
 *  last to finish are small); `progress` hears each map. Counts outside the scope are 0, and `offered` is read from
 *  every side the table has: the caller merges a partial count into the committed table before reading it. */
export async function computeTable(threads = Math.max(1, cpus().length), progress?: (done: number, of: number) => void, scope: Scope = {}): Promise<IntentionTable> {
  const themes = scope.themes ?? STYLE_THEMES;
  const sides = scope.sides ?? INTENTION_SIDES;
  const ids = scope.ids ?? INTENTIONS;
  const tasks: Task[] = [];
  for (const side of [...sides].sort((a, b) => b - a)) for (const id of ids) for (const theme of themes) for (const seed of INTENTION_SEEDS) tasks.push({ id, theme, seed, side });
  const counts = Object.fromEntries(INTENTIONS.map((id) => [id, Object.fromEntries(STYLE_THEMES.map((t) => [t, Object.fromEntries(INTENTION_SIDES.map((s) => [String(s), 0]))]))])) as IntentionTable["counts"];
  let next = 0;
  let done = 0;
  const fromSource = /\.ts$/.test(new URL(import.meta.url).pathname);
  await Promise.all(
    Array.from({ length: Math.min(threads, tasks.length) }, () => {
      const w = new Worker(new URL(import.meta.url), { workerData: { role: ROLE }, ...(fromSource ? { execArgv: ["--import", "tsx"] } : {}) });
      return new Promise<void>((resolve, reject) => {
        const feed = () => {
          if (next >= tasks.length) return void w.terminate().then(() => resolve());
          w.postMessage(tasks[next++]);
        };
        w.on("message", (m: { t: Task; ok: boolean }) => {
          if (m.ok) counts[m.t.id][m.t.theme][String(m.t.side)]++;
          progress?.(++done, tasks.length);
          feed();
        });
        w.on("error", reject);
        feed();
      });
    }),
  );
  return { generatorVersion: GENERATOR_VERSION, sides: [...INTENTION_SIDES], seeds: [...INTENTION_SEEDS], least: INTENTION_LEAST, counts, offered: offeredOf(counts) };
}
