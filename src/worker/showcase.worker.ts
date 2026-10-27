// Showcase mode's worker (D488 (2)): the search (core/gen/showcase.ts `showcaseSearch`) runs here, in a
// worker of its own like D329's background search, so the editor never slows while it runs for minutes.
// Its messages are showcaseApi.ts's; the page starts it with platform/index.ts `createShowcase`. Its
// water stays on one thread (no helpers are installed here).

import { showcaseSearch, type ShowcaseCandidate } from "../core/gen/showcase";
import type { GenerateResult } from "../core/gen/generate";
import { responseOfResult } from "./api";
import type { ShowcaseMessage, ShowcasePickView, ShowcasePreview, ShowcaseRequest, ShowcaseView } from "./showcaseApi";

const post = (m: ShowcaseMessage, buffers: Transferable[] = []) => (self as unknown as Worker).postMessage(m, buffers);

function viewOf(c: ShowcaseCandidate): ShowcaseView {
  return { index: c.index, variation: c.variation, spec: c.spec, passed: c.passed, arc: c.arc, score: c.score, note: c.note, ...(c.name ? { name: c.name } : {}) };
}

function previewOf(r: GenerateResult): ShowcasePreview {
  const b = r.built;
  const water = new Uint8Array(b.W * b.H);
  for (let i = 0; i < water.length; i++) if (b.water[i] >= 0.1) water[i] = 1;
  return { W: b.W, H: b.H, heights: b.heights.slice(), water };
}

let running: AbortController | null = null;

async function run(m: Extract<ShowcaseRequest, { kind: "start" }>): Promise<void> {
  running?.abort();
  const ctl = new AbortController();
  running = ctl;
  const t0 = performance.now();
  try {
    const res = await showcaseSearch(m.spec, {
      budgetMs: m.budgetMs,
      ...(m.tries !== undefined ? { tries: m.tries } : {}),
      signal: ctl.signal,
      onCandidate: (c, best, tried) => {
        const made = best.find((p) => p.index === c.index)?.result ?? null;
        const preview = c.passed && made ? previewOf(made) : null;
        post({ kind: "candidate", tried, elapsedMs: Math.round(performance.now() - t0), candidate: viewOf(c), preview, best: best.map(viewOf) }, preview ? [preview.heights.buffer, preview.water.buffer] : []);
      },
    });
    if (running !== ctl) return;
    const picks: ShowcasePickView[] = [];
    for (const p of res.best) picks.push({ ...viewOf(p), response: await responseOfResult(p.result, 0) });
    const buffers = picks.flatMap((p) => [p.response.heights, p.response.water, p.response.contamination, p.response.moisture, p.response.soilContamination, p.response.reach, p.response.timber, p.response.project].map((a) => a.buffer as Transferable));
    post({ kind: "done", tried: res.tried, elapsedMs: Math.round(performance.now() - t0), stopped: res.stopped, best: picks }, buffers);
  } catch (e) {
    post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    if (running === ctl) running = null;
  }
}

self.onmessage = (e: MessageEvent<ShowcaseRequest>) => {
  const m = e.data;
  if (m.kind === "stop") running?.abort();
  else if (m.kind === "start") void run(m);
};
