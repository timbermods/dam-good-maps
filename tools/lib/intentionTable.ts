// The intention table's count (planning, 2026-11-14; src/core/land/intentionTable.ts): each intention asked of each
// theme on seeds 1–12 at 128², counted where it emerged, on worker threads (one a core). The tool
// (tools/intention-table.ts) writes the table, and checks it, a theme a job, in Nightly only.

import { cpus } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { generate } from "../../src/core/gen/generate";
import { INTENTIONS, type IntentionId } from "../../src/core/land/intentions";
import { INTENTION_LEAST, INTENTION_SEEDS, INTENTION_SIDE, type IntentionTable, type StyleTheme, STYLE_THEMES } from "../../src/core/land/intentionTable";
import { GENERATOR_VERSION, makeSpec } from "../../src/core/spec/mapspec";

interface Task {
  id: IntentionId;
  theme: StyleTheme;
  seed: number;
}

/** Whether one intention emerged on one map: asked alone of the theme at the table's size, as generate asks it. */
export function emerged(t: Task): boolean {
  const spec = { ...makeSpec({ seed: t.seed, size: { x: INTENTION_SIDE, y: INTENTION_SIDE }, theme: t.theme }), intentions: [t.id] };
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

/** Count every intention on every theme, `threads` maps at once; `progress` hears each map. */
export async function computeTable(threads = Math.max(1, cpus().length), progress?: (done: number, of: number) => void, themes: readonly StyleTheme[] = STYLE_THEMES): Promise<IntentionTable> {
  const tasks: Task[] = [];
  for (const id of INTENTIONS) for (const theme of themes) for (const seed of INTENTION_SEEDS) tasks.push({ id, theme, seed });
  const counts = Object.fromEntries(INTENTIONS.map((id) => [id, Object.fromEntries(STYLE_THEMES.map((t) => [t, 0]))])) as IntentionTable["counts"];
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
          if (m.ok) counts[m.t.id][m.t.theme]++;
          progress?.(++done, tasks.length);
          feed();
        });
        w.on("error", reject);
        feed();
      });
    }),
  );
  const offered = Object.fromEntries(INTENTIONS.map((id) => [id, STYLE_THEMES.filter((t) => counts[id][t] >= INTENTION_LEAST)])) as IntentionTable["offered"];
  return { generatorVersion: GENERATOR_VERSION, side: INTENTION_SIDE, seeds: [...INTENTION_SEEDS], least: INTENTION_LEAST, counts, offered };
}
