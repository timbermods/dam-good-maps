// The real path, on this machine: the room-code function (collab-worker, run by `wrangler dev`) and a TURN relay
// (node-turn) that stand in for Cloudflare's, plus a tiny web server for the harness page that runs in each browser.
// The browsers connect through the relay only (relay-only policy); nothing is mocked.
import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { createSocket } from "node:dgram";
import { createServer as createTcpServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const workerDir = path.join(root, "collab-worker");

export const TURN_USER = "dgm";
export const TURN_PASSWORD = "dgm-local";

const freeTcpPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createTcpServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });

const freeUdpPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createSocket("udp4");
    s.bind(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });

/** Ends a process and everything it started (wrangler starts workerd). */
export function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/** Whether the worker's own dependencies are installed (CI runs `npm ci --prefix collab-worker`). */
export const workerInstalled = (): boolean => existsSync(path.join(workerDir, "node_modules", "wrangler", "bin", "wrangler.js"));

export interface Stack {
  /** The room-code function. */
  workerUrl: string;
  /** The page the harness runs on (an origin the function accepts). */
  pageUrl: string;
  turnPort: number;
  /** The relay, to be taken away and brought back (a network drop). */
  relay: { stop(): void; start(): void };
  /** The session page (the real worker, the real client; tests/collab/sessionPage.ts), when asked for with `sessionPage`. */
  sessionUrl: string;
  /** The app itself, built the way the site is (the editor with its Together panel), when asked for with `app`. */
  appUrl: string;
  stop(): Promise<void>;
}

/** The session page built the way the app is (the real worker, bundled by Vite), into a temp folder. */
export async function buildSessionPage(outDir: string): Promise<void> {
  await build({
    root: here,
    configFile: false,
    logLevel: "silent",
    base: "./",
    worker: { format: "es" },
    build: { outDir, emptyOutDir: true, target: "es2022", minify: false, rollupOptions: { input: path.join(here, "session.html") } },
  });
}

/** The app built the way the site is (the e2e build, which shows the forces), into a folder, to be served from any path. */
export async function buildApp(outDir: string): Promise<void> {
  await build({ root, mode: "e2e", logLevel: "silent", base: "./", build: { outDir, emptyOutDir: true, sourcemap: false } });
}

/** The harness page's script, bundled from tests/collab/harness.ts (and src/collab). */
export async function bundleHarness(): Promise<string> {
  const out = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    build: { write: false, minify: false, target: "es2022", lib: { entry: path.join(here, "harness.ts"), formats: ["iife"], name: "collabHarness", fileName: "harness" } },
  })) as { output: { type: string; code?: string }[] } | { output: { type: string; code?: string }[] }[];
  const first = Array.isArray(out) ? out[0] : out;
  const chunk = first.output.find((o) => o.type === "chunk");
  if (!chunk?.code) throw new Error("the harness did not bundle");
  return chunk.code;
}

export interface StackOptions {
  /** How long the relay's login lasts (seconds); short, to see it renewed. */
  turnTtlSeconds?: number;
  /** More settings of the function (MAX_DAILY_MINTS and the like). */
  vars?: Record<string, string>;
  /** Build and serve the session page (the real worker); takes a little longer to start. */
  sessionPage?: boolean;
  /** Build and serve the app (the page's own Together panel on the real function and relay); takes a minute to build. */
  app?: boolean;
}

export async function startStack(options: StackOptions = {}): Promise<Stack> {
  const cleanups: (() => void | Promise<void>)[] = [];
  const stop = async () => {
    for (const c of cleanups.reverse()) await c();
  };
  try {
    // the relay
    const turnPort = await freeUdpPort();
    const require = createRequire(import.meta.url);
    const Turn = require("node-turn") as new (o: object) => { start(): void; stop(): void };
    const turn = new Turn({
      listeningPort: turnPort,
      listeningIps: ["127.0.0.1"],
      relayIps: ["127.0.0.1"],
      externalIps: "127.0.0.1",
      minPort: 51000,
      maxPort: 52000,
      authMech: "long-term",
      credentials: { [TURN_USER]: TURN_PASSWORD },
      realm: "dgm.local",
      debugLevel: "OFF",
    });
    turn.start();
    let relayUp = true;
    const relay = {
      stop: () => {
        if (relayUp) {
          try {
            turn.stop();
          } catch {
            /* already stopped */
          }
        }
        relayUp = false;
      },
      start: () => {
        if (!relayUp) turn.start();
        relayUp = true;
      },
    };
    cleanups.push(() => relay.stop());

    // the function
    const workerPort = await freeTcpPort();
    const inspectorPort = await freeTcpPort();
    const state = mkdtempSync(path.join(tmpdir(), "dgm-collab-"));
    cleanups.push(() => {
      // a temp folder: if Windows still holds a file of the just-killed worker, the system clears it later
      try {
        rmSync(state, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        /* left to the system's temp cleanup */
      }
    });
    const wrangler = spawn(
      process.execPath,
      [
        path.join(workerDir, "node_modules", "wrangler", "bin", "wrangler.js"),
        "dev",
        "--ip", "127.0.0.1",
        "--port", String(workerPort),
        "--inspector-port", String(inspectorPort),
        "--persist-to", state,
        "--var", "ALLOW_LOCAL_ORIGINS:1",
        ...Object.entries(options.vars ?? {}).flatMap(([k, v]) => ["--var", `${k}:${v}`]),
        "--var", `LOCAL_TURN_URLS:turn:127.0.0.1:${turnPort}?transport=udp`,
        ...(options.turnTtlSeconds ? ["--var", `TURN_TTL_SECONDS:${options.turnTtlSeconds}`] : []),
        "--var", `LOCAL_TURN_USERNAME:${TURN_USER}`,
        "--var", `LOCAL_TURN_CREDENTIAL:${TURN_PASSWORD}`,
      ],
      { cwd: workerDir, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" } },
    );
    cleanups.push(() => killTree(wrangler));
    let log = "";
    const ready = new Promise<void>((resolve, reject) => {
      const onData = (d: Buffer) => {
        log += d.toString();
        if (log.includes("Ready on")) resolve();
      };
      wrangler.stdout!.on("data", onData);
      wrangler.stderr!.on("data", onData);
      wrangler.on("exit", (code) => reject(new Error(`wrangler dev exited (${code}):\n${log}`)));
      setTimeout(() => reject(new Error(`wrangler dev did not start in 180 s:\n${log}`)), 180_000);
    });
    await ready;

    // the page
    const bundle = await bundleHarness();
    let sessionDir: string | null = null;
    if (options.sessionPage) {
      sessionDir = mkdtempSync(path.join(tmpdir(), "dgm-collab-page-"));
      const dir = sessionDir;
      cleanups.push(() => {
        try {
          rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        } catch {
          /* left to the system's temp cleanup */
        }
      });
      await buildSessionPage(sessionDir);
    }
    let appDir: string | null = null;
    if (options.app) {
      appDir = mkdtempSync(path.join(tmpdir(), "dgm-collab-app-"));
      const dir = appDir;
      cleanups.push(() => {
        try {
          rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        } catch {
          /* left to the system's temp cleanup */
        }
      });
      await buildApp(appDir);
    }
    const TYPES: Record<string, string> = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".wasm": "application/wasm", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav" };
    const page = createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (appDir && url.startsWith("/app/")) {
        // (the site's own headers: the water's threads need the page cross-origin isolated)
        const rel = path.normalize(url.slice("/app/".length) || "index.html");
        let file = path.join(appDir, rel.endsWith(path.sep) || rel === "." ? path.join(rel, "index.html") : rel);
        if (!file.startsWith(appDir)) return void res.writeHead(403).end();
        if (!existsSync(file)) return void res.writeHead(404).end();
        res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" }).end(readFileSync(file));
      } else if (sessionDir && url.startsWith("/session/")) {
        const file = path.join(sessionDir, path.normalize(url.slice("/session/".length) || "session.html"));
        if (file.startsWith(sessionDir) && existsSync(file)) res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
        else res.writeHead(404).end();
      } else if (url === "/harness.js") res.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
      else res.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><title>collab harness</title><script src="/harness.js"></script>');
    });
    const pagePort = await freeTcpPort();
    await new Promise<void>((resolve) => page.listen(pagePort, "127.0.0.1", resolve));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          (page as Server).close(() => resolve());
          page.closeAllConnections();
        }),
    );

    return { workerUrl: `http://127.0.0.1:${workerPort}`, pageUrl: `http://127.0.0.1:${pagePort}/`, sessionUrl: `http://127.0.0.1:${pagePort}/session/session.html`, appUrl: `http://127.0.0.1:${pagePort}/app/`, turnPort, relay, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
