// Builds of the app to compare: a git ref (or the working tree) built once, kept in local/builds/<id>/,
// and served statically on a port of its own.

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

export const ROOT = resolve(import.meta.dirname, "../..");
export const LOCAL = resolve(import.meta.dirname, "local");

export interface Build {
  /** The ref as given ("origin/dev", "worktree"). */
  ref: string;
  /** The commit it is (or "worktree-<hash of the changed files>"), plus a hash of the build's env when it has one. */
  id: string;
  /** The variables the build was made with (vite reads VITE_* into import.meta.env). */
  env: Record<string, string>;
  dist: string;
}

/** Same ref, different env, is a different build. */
function envSuffix(env: Record<string, string>): string {
  const keys = Object.keys(env).sort();
  return keys.length ? `-env${createHash("sha1").update(keys.map((k) => `${k}=${env[k]}`).join(";")).digest("hex").slice(0, 8)}` : "";
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).trim();

/** The working tree's identity: HEAD plus a hash of everything that differs from it (so an edit to src/ makes a new build). */
function worktreeId(): string {
  const h = createHash("sha1");
  h.update(git("rev-parse", "HEAD"));
  h.update(git("diff", "HEAD", "--", "src", "index.html", "real-places", "public", "package.json", "package-lock.json", "vite.config.ts"));
  for (const f of git("ls-files", "--others", "--exclude-standard", "--", "src", "public").split("\n").filter(Boolean)) {
    h.update(f);
    h.update(readFileSync(join(ROOT, f)));
  }
  return `worktree-${h.digest("hex").slice(0, 10)}`;
}

/** Where the current branch left origin/dev: dev at the branch point. */
export function branchPoint(): string {
  return git("merge-base", "origin/dev", "HEAD");
}

export function resolveRef(ref: string): { id: string; worktree: boolean } {
  if (ref === "worktree") return { id: worktreeId(), worktree: true };
  return { id: git("rev-parse", "--verify", `${ref}^{commit}`), worktree: false };
}

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env }, shell: process.platform === "win32" });
}

/** Build `ref` unless local/builds/<id>/dist is already there. A ref is exported with `git archive` and built with the
 *  working tree's node_modules (a junction), unless its lockfile differs, then it gets its own `npm ci`. */
export function ensureBuild(ref: string, env: Record<string, string> = {}): Build {
  const resolved = resolveRef(ref);
  const worktree = resolved.worktree;
  const id = resolved.id + envSuffix(env);
  const dir = join(LOCAL, "builds", id);
  const dist = join(dir, "dist");
  if (existsSync(join(dist, "index.html"))) return { ref, id, env, dist };
  console.log(`building ${ref} (${id.slice(0, 18)}${Object.keys(env).length ? ", " + Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ") : ""}) ...`);
  let src = ROOT;
  if (!worktree) {
    src = join(dir, "src");
    rmSync(src, { recursive: true, force: true });
    mkdirSync(src, { recursive: true });
    // (relative paths with cwd: GNU tar reads "C:" as a host)
    execFileSync("git", ["archive", "--format=tar", "-o", join(dir, "src.tar"), id], { cwd: ROOT });
    execFileSync("tar", ["-xf", "src.tar", "-C", "src"], { cwd: dir });
    rmSync(join(dir, "src.tar"));
    const same = readFileSync(join(src, "package-lock.json"), "utf8") === readFileSync(join(ROOT, "package-lock.json"), "utf8");
    if (same) symlinkSync(join(ROOT, "node_modules"), join(src, "node_modules"), "junction");
    else run("npm", ["ci", "--no-audit", "--no-fund"], src);
  }
  // base "/" so the build is served from a port's root; production mode, as the site is built
  run("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], src, { ...env, DGM_BASE: "/" });
  if (!worktree) {
    const nm = join(src, "node_modules");
    if (lstatSync(nm).isSymbolicLink()) unlinkSync(nm); // the junction only, never the target's files
    rmSync(src, { recursive: true, force: true });
  }
  writeFileSync(join(dir, "build.json"), JSON.stringify({ ref, id, env, builtAt: new Date().toISOString() }));
  return { ref, id, env, dist };
}

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".wasm": "application/wasm", ".map": "application/json",
  ".woff2": "font/woff2", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain",
};

/** Serve a build's folder on a free port of 127.0.0.1 (never another process's server). */
export function serve(dist: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = resolve(dist);
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      ok({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) });
    });
  });
}
