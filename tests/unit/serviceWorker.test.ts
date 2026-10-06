// The site's one service worker (public/sw.js, D367, D397), run in a sandbox with a stand-in cache and network:
// its one fetch handler keeps only the build's content-hashed files, answers a kept file with the same bytes and
// the isolation headers the multi-core water needs, leaves everything else to the network, and works without
// storage. tests/e2e/isolation.spec.ts sees the real worker in a browser.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const code = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const SCOPE = "https://example.test/preview/";
const BYTES = [0, 17, 128, 255];

type Handler = (event: unknown) => void;

function worker({ storage = true, status = 200 } = {}) {
  const listeners = new Map<string, Handler[]>();
  const entries = new Map<string, Response>();
  let fetched = 0;
  let skipped = 0;
  const cache = {
    match: async (r: Request) => entries.get(r.url)?.clone(),
    put: async (r: Request, res: Response) => void entries.set(r.url, res.clone()),
    keys: async () => [...entries.keys()].map((k) => new Request(k)),
    delete: async (r: Request) => entries.delete(r.url),
  };
  const sandbox = {
    URL,
    Request,
    Response,
    Headers,
    caches: {
      open: async () => {
        if (!storage) throw new Error("no storage");
        return cache;
      },
    },
    fetch: async () => {
      fetched++;
      return new Response(new Uint8Array(BYTES), { status });
    },
    self: {
      location: { href: `${SCOPE}sw.js`, origin: "https://example.test" },
      registration: { scope: SCOPE },
      skipWaiting: () => void skipped++,
      clients: { claim: async () => {} },
      addEventListener: (kind: string, h: Handler) => listeners.set(kind, [...(listeners.get(kind) ?? []), h]),
    },
  };
  vm.runInNewContext(code, sandbox);
  /** One request through the fetch handler: its answer (null when left to the browser), once any keeping is done. */
  async function request(path: string, init?: RequestInit): Promise<Response | null> {
    let answer: Promise<Response> | null = null;
    const later: Promise<unknown>[] = [];
    const event = { request: new Request(SCOPE + path, init), respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => later.push(p) };
    listeners.get("fetch")![0](event);
    const res = answer ? await answer : null;
    await Promise.all(later);
    return res;
  }
  return { request, listeners, entries, fetched: () => fetched, skipped: () => skipped };
}

describe("the service worker's cache", () => {
  it("has one fetch handler, never skips waiting, and answers network and cache alike: same bytes, isolated", async () => {
    const w = worker();
    expect(w.listeners.get("fetch")).toHaveLength(1);
    expect(w.listeners.has("install")).toBe(false);
    for (let i = 0; i < 2; i++) {
      const r = (await w.request("assets/core-AbCd1234.wasm"))!;
      expect([...new Uint8Array(await r.arrayBuffer())]).toEqual(BYTES);
      expect(r.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
      expect(r.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
    }
    expect(w.fetched()).toBe(1);
    expect(w.skipped()).toBe(0);
  });

  it("leaves pages, projects, maps, unhashed files, queries and ranges to the network", async () => {
    const w = worker();
    const paths = ["", "index.html", "first-visit/index.json", "project.json", "assets/core-AbCd1234.js?v=2", "assets/core.js", "sounds/water-AbCd1234.ogg"];
    for (const p of paths) {
      await w.request(p);
      await w.request(p);
    }
    await w.request("assets/core-AbCd1234.js", { headers: { range: "bytes=0-5" } });
    expect(w.entries.size).toBe(0);
    expect(w.fetched()).toBe(paths.length * 2 + 1);
  });

  it("keeps no partial answer, and works on without storage", async () => {
    const partial = worker({ status: 206 });
    await partial.request("assets/core-AbCd1234.js");
    expect(partial.entries.size).toBe(0);
    const none = worker({ storage: false });
    for (let i = 0; i < 2; i++) expect((await none.request("assets/core-AbCd1234.js"))!.status).toBe(200);
    expect(none.fetched()).toBe(2);
  });

  it("is bounded, and a preview's worker keeps only its own scope's files", async () => {
    const w = worker();
    for (let i = 0; i < 67; i++) await w.request(`assets/core${i}-AbCd1234.js`);
    expect(w.entries.size).toBe(64);
    expect([...w.entries.keys()].every((k) => k.startsWith(`${SCOPE}assets/`))).toBe(true);
    // the oldest go first
    expect(w.entries.has(`${SCOPE}assets/core0-AbCd1234.js`)).toBe(false);
  });
});
