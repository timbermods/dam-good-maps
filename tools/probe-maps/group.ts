// A probe group's map writer (PLAN §20 D357 (9)): the maps a DGM Probe group plays when they are made outside the
// repository, built in memory by one module and written to the probe's own folder (C:\dgm-probe\<group>, never the
// repository, D195). The runner calls a group's writer itself before it plans (`batch --group <name>`), so nothing is
// run by hand first; each `tools/probe-<group>.ts` is a thin wrapper over the same module, to run it by hand.
//
// A writer is deterministic: the same checkout builds the same bytes. `writeGroup` builds every map, compares each with
// the file on disk by its sha256, rewrites only what differs (a stale or missing map is never planned), and writes the
// manifest the catalog reads (<group>.json: every map's file, size and sha256, and what the probe watches on it).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The probe's own folder (Kyler's decision #54): outside his Timberborn folders. */
export const PROBE_HOME = "C:\\dgm-probe";

/** One map as a writer builds it: its file name, its bytes, its size and its manifest entry. */
export interface BuiltMap {
  file: string;
  bytes: Uint8Array;
  size: [number, number];
  /** What the probe watches on it (written into the manifest with the file, size and sha256). */
  entry: Record<string, unknown>;
}

export interface GroupWriter {
  /** The catalog's group name, as `--group` takes it. */
  group: string;
  /** The game ids its maps get (so `--only` finds the group to write). */
  ids: readonly string[];
  /** The standalone wrapper that runs the same writer by hand. */
  tool: string;
  /** The folder under C:\dgm-probe, and the environment variable that moves it. */
  folder: string;
  env: string;
  /** The manifest's file name in that folder. */
  manifest: string;
  /** Builds every map in memory; throws with a plain reason when a map cannot be made. */
  build(log?: (line: string) => void): { maps: BuiltMap[]; manifest: Record<string, unknown> };
}

/** A file of the repository, found from where the command runs (the runner runs in investigation/probe, the tools at
 *  the root): the nearest folder upwards holding src/core and public. */
export function repoFile(...parts: string[]): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "src", "core")) && existsSync(join(dir, "public"))) return join(dir, ...parts);
    const up = dirname(dir);
    if (up === dir) throw new Error(`not inside the repository (from ${process.cwd()}): cannot find ${parts.join("/")}`);
    dir = up;
  }
}

/** Where a group's maps live: its environment variable, else C:\dgm-probe\<folder>. */
export function groupDir(w: Pick<GroupWriter, "folder" | "env">): string {
  return resolve(process.env[w.env] ?? join(PROBE_HOME, w.folder));
}

export interface WrittenFile {
  file: string;
  size: [number, number];
  bytes: number;
  sha256: string;
  /** written: missing or different on disk, so written now; current: the file on disk was already these bytes. */
  status: "written" | "current";
}

export interface GroupWrite {
  group: string;
  dir: string;
  files: WrittenFile[];
  manifest: { file: string; status: "written" | "current" };
  seconds: number;
}

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/**
 * Builds a group's maps and brings its folder up to date: every map whose file is missing or differs from the bytes
 * built now is written, and the manifest too. With `check`, nothing is written; the result says what would be.
 */
export function writeGroup(w: GroupWriter, opts: { dir?: string; check?: boolean; log?: (line: string) => void } = {}): GroupWrite {
  const t0 = Date.now();
  const dir = opts.dir ?? groupDir(w);
  const { maps, manifest } = w.build(opts.log);
  if (!maps.length) throw new Error(`the ${w.group} writer built no maps`);
  if (!opts.check) mkdirSync(dir, { recursive: true });
  const files: WrittenFile[] = [];
  const entries: Record<string, unknown>[] = [];
  for (const m of maps) {
    const sum = sha256(m.bytes);
    const path = join(dir, m.file);
    const same = existsSync(path) && sha256(new Uint8Array(readFileSync(path))) === sum;
    if (!same && !opts.check) writeFileSync(path, m.bytes);
    files.push({ file: m.file, size: m.size, bytes: m.bytes.length, sha256: sum, status: same ? "current" : "written" });
    entries.push({ ...m.entry, file: m.file, bytes: m.bytes.length, sha256: sum, size: m.size });
  }
  const text = JSON.stringify({ ...manifest, maps: entries }, null, 1);
  const mpath = join(dir, w.manifest);
  const mSame = existsSync(mpath) && readFileSync(mpath, "utf8") === text;
  if (!mSame && !opts.check) writeFileSync(mpath, text);
  return { group: w.group, dir, files, manifest: { file: w.manifest, status: mSame ? "current" : "written" }, seconds: (Date.now() - t0) / 1000 };
}

/** The maps written, one line each, as the plan prints them. */
export function describeWrite(g: GroupWrite): string[] {
  const n = g.files.filter((f) => f.status === "written").length;
  const lines = [`${g.group}: ${g.files.length} maps in ${g.dir} (${n ? `${n} written now` : "all current"}, built in ${g.seconds.toFixed(0)} s):`];
  for (const f of g.files) lines.push(`  - ${f.file}  ${f.size[0]}×${f.size[1]}  ${(f.bytes / 1024).toFixed(0)} KB  sha256 ${f.sha256.slice(0, 16)}  ${f.status}`);
  return lines;
}
