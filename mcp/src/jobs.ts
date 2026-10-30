// The maps the generator is making (D501): each generate runs in a worker thread of its own, so the server answers
// while a 256² map takes minutes. An MCP client gives up on a call after its own time limit (60 s in the SDK; Claude
// Desktop's limit is fixed, and progress does not reset it), so a call waits for the map at most WAIT_MS. If the map is
// not ready then, the call says so, and the client calls `wait` with the map's handle until the map is ready. Each
// stage of each attempt goes to the client as an MCP progress notification while a call waits.
//
// The worker is this same module, started again with WORKER in its workerData: in the bundle (tools/mcp-build.ts) that
// is the one file server/index.mjs, from the source it is this file under tsx.

import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { generate, type GenerateResult, type GenProgressStage } from "../../src/core/gen/generate";
import { JsonFloat } from "../../src/core/format/json";
import type { MapSpec } from "../../src/core/spec/mapspec";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { openGenerated, Refused, releaseHandle, reserveHandle, specOf, type GenerateInput, type Generated } from "./maps";

const WORKER = "dam-good-maps generator";

type FromWorker = { kind: "stage"; p: GenProgressStage } | { kind: "done"; r: GenerateResult; ms: number };

// --------------------------------------------------------------------------------------- the result's crossing

/** An object's class, marked while it crosses between the threads. */
const CLASS = "__dgmClass";

/** The classes a generate's result holds. Each is data alone (its fields, no hidden state), so an object is its class
 *  again once its prototype is: game JSON's float, which writes a float as the game wrote it, and the voxel terrain of
 *  a map with 3D forms (D488). */
const CROSSING: Record<string, { prototype: object }> = { JsonFloat, ColumnTerrain };

/** Each object in a value, once (typed arrays and buffers are data, with nothing inside to visit). */
function eachObject(root: unknown, visit: (o: object) => void): void {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object" || seen.has(v) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) continue;
    seen.add(v);
    visit(v);
    if (v instanceof Map) for (const [k, x] of v) stack.push(k, x);
    else if (v instanceof Set) for (const x of v) stack.push(x);
    else for (const k of Object.keys(v)) stack.push((v as Record<string, unknown>)[k]);
  }
}

const PLAIN = new Set<unknown>([Object.prototype, Array.prototype, Map.prototype, Set.prototype, null]);

/** A structured clone keeps no classes: the worker marks each object of a class in CROSSING with its class's name, and
 *  the server's thread gives it its class again (afterCrossing), so the map is the map the generator made, byte for
 *  byte. Any other class stops the map with its name, never lost quietly. */
export function markForCrossing(r: GenerateResult): void {
  eachObject(r, (o) => {
    const proto = Object.getPrototypeOf(o);
    if (PLAIN.has(proto)) return;
    const name = Object.keys(CROSSING).find((k) => CROSSING[k].prototype === proto);
    if (!name) throw new Error(`the generator's result holds a ${(proto?.constructor as { name?: string } | undefined)?.name ?? "class"}, which the worker cannot send`);
    (o as Record<string, unknown>)[CLASS] = name;
  });
}

/** The marked objects given their classes again, after the crossing. */
export function afterCrossing(r: GenerateResult): GenerateResult {
  eachObject(r, (o) => {
    const m = o as Record<string, unknown>;
    const name = m[CLASS];
    if (typeof name !== "string") return;
    delete m[CLASS];
    Object.setPrototypeOf(o, CROSSING[name].prototype);
  });
  return r;
}

// ------------------------------------------------------------------------------------------------ the worker

if (!isMainThread && (workerData as { role?: string } | null)?.role === WORKER) {
  const { spec } = workerData as { spec: MapSpec };
  const port = parentPort!;
  const t0 = performance.now();
  const r = generate(spec, { onProgress: (p) => port.postMessage({ kind: "stage", p } satisfies FromWorker) });
  const ms = Math.round(performance.now() - t0);
  markForCrossing(r);
  port.postMessage({ kind: "done", r, ms } satisfies FromWorker);
  // (the worker stays until the server's thread has the map and ends it: an exit of its own could come first)
  port.on("message", () => {});
}

// ------------------------------------------------------------------------------------------------ the jobs

/** How long one call waits for a map before it answers that the map is not ready: well under the 60 s that clients
 *  give a call by default (Claude Desktop's own calls were seen to fail from about 30 s, anthropics/claude-code#22542). */
export const WAIT_MS = 25_000;
let waitMs = WAIT_MS;

/** Set how long a call waits (the tests). */
export function setWaitMs(ms: number): void {
  waitMs = ms;
}

const STAGE_WORDS: Record<string, string> = {
  land: "raising the land",
  water: "running the rivers",
  start: "settling the water and finding a start",
  objects: "placing ruins, relics and other objects",
  resources: "growing forests and berries",
  check: "checking the map",
};

/** One line on a stage: "Attempt 2: running the rivers (attempt 1 failed: the start's water moved)." */
export function stageLine(p: GenProgressStage): string {
  const n = (p.tried ?? p.attempt) + 1;
  const failed = p.failed ? ` (attempt ${n - 1} failed: ${p.failed})` : "";
  return `Attempt ${n}: ${STAGE_WORDS[p.stage] ?? p.stage}${failed}.`;
}

interface Job {
  handle: string;
  started: number;
  /** What the generator does now, in one line. */
  now: string;
  /** The made map, or the refusal. */
  done: Promise<Generated>;
  finished: boolean;
  listeners: Set<(line: string) => void>;
}

/** The jobs by handle, the latest few, finished or not (a finished one answers wait again with its map). */
const MOST_JOBS = 12;
const jobs = new Map<string, Job>();

/** The source runs under tsx, and its worker needs tsx too; the bundle is plain JavaScript. */
function workerOptions(spec: MapSpec): ConstructorParameters<typeof Worker>[1] {
  const fromSource = /\.ts$/.test(new URL(import.meta.url).pathname);
  return { workerData: { role: WORKER, spec }, stdout: true, ...(fromSource ? { execArgv: ["--import", "tsx"] } : {}) };
}

/** Start to make a map. The input is checked here, and a refusal is thrown at once. */
export function startGenerate(input: GenerateInput): Job {
  const { spec, seedWord } = specOf(input);
  const handle = reserveHandle();
  const job: Job = { handle, started: performance.now(), now: "Attempt 1: starting the generator.", done: null!, finished: false, listeners: new Set() };
  job.done = new Promise<Generated>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), workerOptions(spec));
    // (stdout carries the protocol alone: what the worker prints goes to stderr, as index.ts does on this thread)
    worker.stdout.pipe(process.stderr);
    worker.on("message", (m: FromWorker) => {
      if (m.kind === "stage") {
        job.now = stageLine(m.p);
        for (const f of job.listeners) f(job.now);
        return;
      }
      try {
        resolve(openGenerated(afterCrossing(m.r), m.ms, seedWord, handle));
      } catch (e) {
        reject(e);
      }
      void worker.terminate();
    });
    worker.on("error", (e) => {
      releaseHandle(handle);
      reject(e);
    });
    worker.on("exit", (code) => {
      releaseHandle(handle);
      reject(new Error(`the generator stopped (exit code ${code})`));
    });
  });
  job.done.then(
    () => (job.finished = true),
    () => (job.finished = true),
  );
  jobs.set(handle, job);
  while (jobs.size > MOST_JOBS) jobs.delete(jobs.keys().next().value!);
  return job;
}

/** The job with this handle, or the refusal. */
export function jobOf(handle: string): Job {
  const job = jobs.get(handle);
  if (!job) throw new Refused(`There is no map "${handle}" that generate made: call generate first`);
  return job;
}

/** The map, if it is made within WAIT_MS; else null. Each stage meanwhile goes to `progress` (and the stage now, at
 *  once). A refusal of the map is thrown. */
export async function waitFor(job: Job, progress: ((line: string) => void) | null, signal?: AbortSignal): Promise<Generated | null> {
  if (progress && !job.finished) {
    progress(job.now);
    job.listeners.add(progress);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      job.done,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), waitMs);
        onAbort = () => resolve(null);
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    if (progress) job.listeners.delete(progress);
  }
}

/** Seconds since the job started. */
export function secondsOf(job: Job): number {
  return Math.round((performance.now() - job.started) / 1000);
}

export type { Job };
