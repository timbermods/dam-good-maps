// The real path, on this machine: the room-code function (collab-worker, run by `wrangler dev`) and a TURN relay
// (node-turn) that stand in for Cloudflare's, plus a tiny web server for the harness page that runs in each browser.
// The browsers connect through the relay only (relay-only policy); nothing is mocked.
import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { createSocket } from "node:dgram";
import { createServer as createTcpServer } from "node:net";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
  stop(): Promise<void>;
}

async function bundleHarness(): Promise<string> {
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

export async function startStack(): Promise<Stack> {
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
    cleanups.push(() => turn.stop());

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
        "--var", `LOCAL_TURN_URLS:turn:127.0.0.1:${turnPort}?transport=udp`,
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
      setTimeout(() => reject(new Error(`wrangler dev did not start in 90 s:\n${log}`)), 90_000);
    });
    await ready;

    // the page
    const bundle = await bundleHarness();
    const page = createServer((req, res) => {
      if (req.url === "/harness.js") res.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
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

    return { workerUrl: `http://127.0.0.1:${workerPort}`, pageUrl: `http://127.0.0.1:${pagePort}/`, turnPort, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
