// The saving review's page half (investigation/saving-review): the page's own handlers, run against stubs, as the page
// hunt's tests do. A save that failed never lets the only edited copy close unasked; a deleted map is never saved back.
// (The store's own cases, two tabs among them, are in tests/contract/yourMaps.test.ts.)
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "@typescript/typescript6";
import { expect, test } from "vitest";

const compile = (code: string) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

/** The page's own functions, by name, from App.tsx. */
function functions(names: string[]) {
  const text = readFileSync("src/ui/App.tsx", "utf8");
  const ast = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) found.set(node.name.text, node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return names
    .map((n) => {
      if (!found.has(n)) throw new Error(`Missing the page's ${n}`);
      return found.get(n)!;
    })
    .join("\n");
}

/** A page whose saves into Your maps fail (storage full) once flushed. */
function failingPage(extra: Record<string, unknown> = {}) {
  const env = createContext({
    keeping: { current: true },
    discardAllowed: { current: false },
    switching: { current: false },
    pendingEdits: { current: null },
    saver: { flush: async () => void (env.keeping.current = false), changed() {} },
    setReplacingMap() {},
    ...extra,
  });
  return env as Record<string, any>;
}

test("a save that failed stops the open map being replaced, unless the player chose to close it", async () => {
  const env = failingPage();
  runInContext(compile(functions(["replacing"])), env);
  let loads = 0;
  await expect(env.replacing(async () => void loads++)).rejects.toThrow("Your map was not saved");
  expect(loads).toBe(0);
  // ("Close it" in the page's question)
  env.discardAllowed.current = true;
  await env.replacing(async () => void loads++);
  expect(loads).toBe(1);
  expect(env.discardAllowed.current).toBe(false);
});

test("Generate makes no map over a kept map whose save just failed", async () => {
  let generated = 0;
  let making: unknown = null;
  const env = failingPage({
    runId: { current: 0 },
    back: { current: null },
    backReady: { current: null },
    session: { kind: "generated" },
    entry: { current: { id: "a" } },
    kept: { current: true },
    snapshot: async () => ({ entry: { id: "a" }, project: new Uint8Array([1]) }),
    generator: { generate: async () => void generated++ },
    stopBackground() {},
    setBusy() {},
    setError() {},
    setProgress() {},
    setMaking: (v: unknown) => void (making = v),
    words: (e: unknown) => String(e instanceof Error ? e.message : e),
    performance: { mark() {} },
    seedText: "",
    proxy: (v: unknown) => v,
  });
  runInContext(compile(functions(["run"])), env);
  expect(await env.run({ seed: 2 })).toBe(null);
  expect(generated).toBe(0);
  expect(making).toEqual({ failed: expect.stringContaining("Your map was not saved") });
});

test("a deleted map's waiting save is dropped before it is removed, so nothing brings it back", async () => {
  const order: string[] = [];
  let onYes: (() => void) | null = null;
  const env = createContext({
    maps: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    entry: { current: { id: "b" } },
    kept: { current: true },
    keeping: { current: false },
    switching: { current: false },
    saver: { discard: async (id: string) => void order.push(`discard ${id}`), flush: async () => void order.push("flush") },
    yourMaps: { remove: async (id: string) => void order.push(`remove ${id}`), list: async () => [{ id: "b", name: "B" }] },
    setConfirm: (c: { onYes(): void }) => void (onYes = c.onYes),
    setMaps() {},
    setSaveState() {},
    openMap: async () => void order.push("open"),
    generate: async () => void order.push("generate"),
  });
  runInContext(compile(functions(["deleteMaps"])), env);
  (env as Record<string, any>).deleteMaps(["a"]);
  onYes!();
  await new Promise((r) => setTimeout(r, 0));
  expect(order).toEqual(["discard a", "remove a"]);
  // the open map deleted: its failed save no longer counts, and the next map opens
  order.length = 0;
  (env as Record<string, any>).deleteMaps(["b"]);
  onYes!();
  await new Promise((r) => setTimeout(r, 0));
  expect(order).toEqual(["discard b", "remove b", "open"]);
  expect((env as Record<string, any>).keeping.current).toBe(true);
});
