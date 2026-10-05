// Investigation/page-hunt (#303): exercise the actual page handlers with deferred worker replies.
// No sleeps, speed gates, generated maps or copies of the implementation.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { createRequire } from "node:module";
import * as ts from "typescript";
import { test, expect } from "vitest";

const sourceRoot = process.env.DGM_PAGE_SOURCE_ROOT ?? process.cwd();
const source = (p: string) => readFileSync(join(sourceRoot, p), "utf8");
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const compile = (code: string) => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function functions(file: string, names: string[]) {
  const text = source(file);
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text))
      found.set(node.name.text, node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return names.map((n) => {
    if (!found.has(n)) throw new Error(`Missing production handler ${n}`);
    return found.get(n)!;
  }).join("\n");
}

test("Cancel while the recovery snapshot is pending restores a live editor worker", async () => {
  const recovery = deferred<{ entry: { id: string }; project: Uint8Array }>();
  const old = { api: {}, stopped: false, stop() { this.stopped = true; } };
  const opened: number[][] = [];
  let making: unknown;
  let generated = 0;
  const env = createContext({
    runId: { current: 0 }, back: { current: null }, backReady: { current: null },
    cancelling: { current: false }, session: { kind: "import" }, entry: { current: { id: "old" } }, kept: { current: true },
    gen: old, generator: { generate: async () => { generated++; throw new Error("stale generation"); } },
    createGeneratorWorker: () => ({ api: { openProject: async (b: Uint8Array) => { opened.push([...b]); return {}; } } }),
    snapshot: () => recovery.promise, saver: { changed() {}, flush: async () => {} },
    stopBackground() {}, setBusy() {}, setError() {}, setProgress() {}, setSeedText() {},
    setMaking: (v: unknown) => { making = v; }, performance: { mark() {} },
    enterEditor() {}, words: (e: unknown) => String(e), seedText: "4242", proxy: (v: unknown) => v,
    keeping: { current: true }, discardAllowed: { current: false }, saveState: "", setSaveState() {},
  });
  runInContext(compile(functions("src/ui/App.tsx", ["run", "cancelMaking"])), env);
  const run = env.run({ seed: 4242 });
  const cancelled = env.cancelMaking();
  // The old worker is still serving the only recovery project. It must survive until that reply.
  const aliveWhilePending = !old.stopped;
  const overlayHeld = making === "back";
  recovery.resolve({ entry: { id: "old" }, project: new Uint8Array([4, 2]) });
  await Promise.all([run, cancelled]);
  expect(aliveWhilePending).toBe(true);
  expect(overlayHeld).toBe(true);
  expect(opened).toEqual([[4, 2]]);
  expect(old.stopped).toBe(true);
  expect(generated).toBe(0);
  expect(making).toBe(null);
});

test("Save project captures the map after already queued edits", async () => {
  const pendingEdit = deferred<void>();
  let revision = 0;
  let queue: Promise<unknown> = pendingEdit.promise.then(() => { revision = 1; });
  const downloads: number[][] = [];
  const module = { exports: {} as Record<string, any> };
  const env = createContext({
    exports: module.exports, module,
    require: (id: string) => {
      if (id === "comlink") return { proxy: (v: unknown) => v };
      if (id === "../../platform") return { saveFile: (b: Uint8Array) => downloads.push([...b]) };
      if (id === "../panels") return { plain: (v: unknown) => v };
      return createRequire(join(process.cwd(), "package.json"))(id);
    },
  });
  runInContext(compile(source("src/editor/save/useSave.ts")), env);
  const save = module.exports.useSave({
    api: { project: async () => ({ bytes: new Uint8Array([revision]), fileName: "map.json.gz" }) },
    info: {}, enqueue: (fn: () => Promise<unknown>) => { queue = queue.then(fn); return queue; },
    forcer: { current: null },
  });
  const exporting = save.exportProject();
  await Promise.resolve();
  const exportedBeforeEdit = downloads.length;
  pendingEdit.resolve();
  await exporting;
  expect(exportedBeforeEdit).toBe(0);
  expect(downloads).toEqual([[1]]);
});
