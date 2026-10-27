// The page each browser of the session tests (D486) runs: the real generator worker (with the session layer in it) and the real
// client, driven by the test through `window.session`, not through a UI. Built by localStack.ts `buildSessionPage` the way the
// app is built. The page keeps every event the client fires, so the test can wait for them.
import { wrap, type Remote } from "comlink";
import { CollabClient } from "../../src/collab/client";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import type { GeneratorApi } from "../../src/worker/generator.worker";

interface Logged {
  type: string;
  [key: string]: unknown;
}

const worker = new Worker(new URL("../../src/worker/generator.worker.ts", import.meta.url), { type: "module" });
const api: Remote<GeneratorApi> = wrap<GeneratorApi>(worker);
let client: CollabClient | null = null;
let log: Logged[] = [];
let updates = 0;
let opens = 0;

/** An event as plain data for the test: bytes become their length, the bulky parts go. */
function plain(type: string, e: Record<string, unknown>): Logged {
  const out: Logged = { type };
  for (const [k, v] of Object.entries(e)) {
    if (k === "type") continue;
    if (v instanceof Uint8Array) out[`${k}Bytes`] = v.length;
    else if (k === "note" && v && typeof v === "object") out[k] = { ...(v as object), runs: undefined };
    else out[k] = v;
  }
  return out;
}

const EVENTS = ["state", "joined", "resumed", "paused", "presence", "stroke", "presence-cleared", "claims", "note", "applied", "refused", "opening", "new-map", "keep", "desync", "settled", "error", "code", "unavailable", "failed"] as const;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const session = {
  init(baseUrl: string, transport: Record<string, number> = {}) {
    client = new CollabClient(api.collab, { baseUrl, transport });
    log = [];
    for (const t of EVENTS) (client as unknown as { on(t: string, f: (e: Record<string, unknown>) => void): void }).on(t, (e) => log.push(plain(t, e)));
    client.on("update", () => void updates++);
    client.on("open", () => void opens++);
  },

  /** Generate a map in the worker and open it in the editor, as the page does. */
  async generate(seed: number, theme: ThemeId, size: number) {
    await api.generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const open = await api.refine();
    return { W: open.info.W, H: open.info.H, name: open.info.name };
  },

  /** Open a project (the bytes of a map the test made in Node). */
  async openProject(bytes: number[]) {
    const open = await api.openProject(new Uint8Array(bytes));
    return { W: open.info.W, H: open.info.H, name: open.info.name };
  },

  /** Any client method by name (the arguments are JSON). */
  async call(method: string, ...args: unknown[]) {
    const f = (client as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    return await f.apply(client, args);
  },

  /** The session's map as a project (what the page would keep in Your maps), as plain numbers. */
  async projectBytes() {
    const bytes = await client!.project();
    return bytes ? Array.from(bytes) : null;
  },

  events(type?: string): Logged[] {
    return type ? log.filter((e) => e.type === type) : log.slice();
  },
  clearEvents() {
    log = [];
  },
  counts: () => ({ updates, opens }),

  /** What the map is here: the session's state, and the SHA-256 of the .timber the game would load from it. */
  async fingerprint() {
    const state = await api.collab.state();
    // (an export refuses when the map changed while it was checked, e.g. the water settling: ask again)
    let out = await api.exportTimber(true);
    for (let tries = 0; !out.ok && tries < 8; tries++) out = await api.exportTimber(true);
    const info = await api.sessionInfo();
    return { state, timber: out.ok ? await sha256Hex(out.bytes) : `refused: ${out.errors.join("; ")}`, edits: info?.edits ?? -1, W: info?.W ?? 0 };
  },

  /** A raise stroke centred on tile (x, y), as an edit command. */
  raise(x: number, y: number, size = 4) {
    return { kind: "edit", label: "Raise", ops: [{ op: "brush", params: { tool: "raise", size, strength: 10, dabs: [x * 4, y * 4, (x + 3) * 4, y * 4] } }] };
  },
};

export type SessionPage = Omit<typeof session, "raise"> & { raise(x: number, y: number, size?: number): unknown };
(window as unknown as { session: typeof session }).session = session;
