// Changing Rust feels like changing TypeScript (PLAN §20 D444): while `npm run dev` runs, saving any .rs file
// under rust/ rebuilds the committed Wasm (tools/rust/build.ts), and Vite reloads what imports it, with no
// manual step. Only the dev server, and only where cargo is installed; a failed build shows in the page's
// error overlay and the terminal, and the last good Wasm stays.

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

/** @returns {import("vite").Plugin} */
export function rustWatch() {
  return {
    name: "dgm-rust-watch",
    apply: "serve",
    // Vite watches the whole repository; cargo's output is thousands of files nobody imports
    config: () => ({ server: { watch: { ignored: ["**/rust/target/**"] } } }),
    configureServer(server) {
      // cargo on PATH, or where rustup puts it for the user (a terminal opened before Rust was installed)
      const env = { ...process.env, PATH: `${join(homedir(), ".cargo", "bin")}${delimiter}${process.env.PATH ?? ""}` };
      if (spawnSync("cargo", ["--version"], { cwd: join(ROOT, "rust"), env, windowsHide: true }).status !== 0) return;
      const tsx = createRequire(import.meta.url).resolve("tsx/cli");
      /** @type {ReturnType<typeof setTimeout> | null} */
      let timer = null;
      let running = false;
      let again = false;
      const build = () => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        const started = Date.now();
        let output = "";
        const child = spawn(process.execPath, [tsx, "tools/rust/build.ts"], { cwd: ROOT, env, windowsHide: true });
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (code) => {
          running = false;
          if (code === 0) server.config.logger.info(`rust: rebuilt in ${Date.now() - started} ms`, { timestamp: true });
          else {
            server.config.logger.error(`rust: the build failed\n${output}`, { timestamp: true });
            server.ws.send({ type: "error", err: { message: `The Rust build failed:\n${output.slice(-4000)}`, stack: "" } });
          }
          if (again) {
            again = false;
            build();
          }
        });
      };
      server.watcher.on("change", (file) => {
        if (!file.endsWith(".rs")) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(build, 150);
      });
    },
  };
}
