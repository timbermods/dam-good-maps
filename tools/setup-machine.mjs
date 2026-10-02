// One command to make a fresh clone ready for the milestone session (Kyler, 2026-10-01): `npm run setup:machine`.
// It creates the worktrees the plan uses, installs their dependencies, writes the probe allow rules for this
// machine's own paths into .claude/settings.local.json (keeping any rules already there), checks the tools the
// work needs, and prints what's ready and what isn't. Safe to run again at any time: it only adds what's missing.
//
//   node tools/setup-machine.mjs            everything
//   node tools/setup-machine.mjs --dry-run  say what it would do, change nothing
//   node tools/setup-machine.mjs --all      also the parked and held branches' worktrees
//   node tools/setup-machine.mjs --no-install   worktrees and rules only, no npm ci
//
// Plain Node, no dependencies: it runs before the first `npm ci`.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const ALL = args.has("--all");
const INSTALL = !args.has("--no-install");

/** The worktrees the plan uses: folder suffix, branch. Update this list when a branch starts or is released. */
const WORKTREES = [
  ["m9b", "feature/m9b"],
  ["high", "feature/high-look"],
  ["parity", "feature/parity"],
  ["page", "feature/page"],
  ["weather", "feature/weather-days"],
  ["3d", "feature/terrain3d-a"],
];
/** Parked or held: made only with --all. */
const PARKED = [
  ["places", "feature/real-places-2"],
  ["groups", "feature/source-groups"],
];
/** The dedicated probe folder: detached, checked out to the branch being probed before each batch. */
const PROBE = "probe";

const ready = [];
const missing = [];
const did = [];

function git(cwd, ...a) {
  return execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function tryRun(cmd, a, cwd) {
  try {
    // npm is a .cmd on Windows and needs the shell; its arguments here are fixed words
    if (cmd === "npm") return execSync(`npm ${a.join(" ")}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    return execFileSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}
const slash = (p) => p.replace(/\\/g, "/");

const root = git(process.cwd(), "rev-parse", "--show-toplevel");
// a worktree's own top level is not the main clone: use the main clone, where .claude/agents load
const main = slash(dirname(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir")));
const parent = dirname(main);
const name = basename(main);
const dirOf = (suffix) => slash(join(parent, `${name}-${suffix}`));

console.log(`Dam Good Maps machine setup${DRY ? " (dry run)" : ""}\n  repository: ${main}\n`);

// 1. the branches
if (!DRY) tryRun("git", ["fetch", "--all", "--prune", "--quiet"], main);
const existing = new Map(); // path -> branch
for (const block of git(main, "worktree", "list", "--porcelain").split(/\n\n/)) {
  const path = /^worktree (.+)$/m.exec(block)?.[1];
  if (path) existing.set(slash(path).toLowerCase(), /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "(detached)");
}
const branchAt = new Map([...existing].map(([p, b]) => [b, p]));

function addWorktree(suffix, branch) {
  const dir = dirOf(suffix);
  if (existing.has(dir.toLowerCase())) return ready.push(`worktree ${dir} (${existing.get(dir.toLowerCase())})`), dir;
  if (existsSync(dir)) return missing.push(`worktree ${dir}: the folder exists but is not a worktree of this clone`), null;
  if (branch && branchAt.has(branch)) return ready.push(`branch ${branch} is already checked out at ${branchAt.get(branch)}`), null;
  const remote = branch && tryRun("git", ["rev-parse", "--verify", "--quiet", `origin/${branch}`], main);
  if (branch && !remote) return missing.push(`worktree ${dir}: origin has no branch ${branch} (released or renamed? update tools/setup-machine.mjs)`), null;
  if (DRY) return did.push(`would create ${dir} (${branch ?? "detached at origin/dev"})`), null;
  try {
    if (!branch) git(main, "worktree", "add", "--detach", dir, "origin/dev");
    else if (tryRun("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], main)) git(main, "worktree", "add", dir, branch);
    else git(main, "worktree", "add", "--track", "-b", branch, dir, `origin/${branch}`);
    did.push(`created ${dir} (${branch ?? "detached at origin/dev"})`);
    return dir;
  } catch (e) {
    missing.push(`worktree ${dir}: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
    return null;
  }
}

const dirs = [main];
for (const [suffix, branch] of [...WORKTREES, ...(ALL ? PARKED : [])]) {
  const d = addWorktree(suffix, branch);
  if (d) dirs.push(d);
}
const probeDir = addWorktree(PROBE, null) ?? dirOf(PROBE);
if (existsSync(probeDir)) dirs.push(probeDir);

// 2. their dependencies
function install(dir, label) {
  if (!existsSync(join(dir, "package.json"))) return;
  if (existsSync(join(dir, "node_modules"))) return ready.push(`dependencies in ${label}`);
  if (!INSTALL || DRY) return did.push(`${DRY ? "would run" : "skipped"} npm ci in ${label}`);
  console.log(`  npm ci in ${label} …`);
  const ok = tryRun("npm", ["ci", "--no-audit", "--no-fund"], dir) !== null;
  (ok ? did : missing).push(ok ? `installed dependencies in ${label}` : `npm ci failed in ${label}: run it by hand to see why`);
}
for (const d of [...new Set(dirs)]) {
  install(d, d);
  if (d === probeDir) install(join(d, "investigation", "probe"), `${d}/investigation/probe`);
}

// 3. the probe allow rules, for this machine's own paths
const prefix = `npm --prefix ${probeDir}/investigation/probe run`;
const rules = [
  `Bash(${prefix} build-mod -- --no-install)`,
  `Bash(${prefix} batch -- --backup-settings)`,
  `Bash(${prefix} batch -- --group:*)`,
  `Bash(${prefix} restore)`,
];
const settingsPath = join(main, ".claude", "settings.local.json");
let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    missing.push(`${settingsPath} is not valid JSON: fix or remove it, then run this again`);
    settings = null;
  }
}
if (settings) {
  settings.permissions ??= {};
  settings.permissions.allow ??= [];
  const add = rules.filter((r) => !settings.permissions.allow.includes(r));
  if (!add.length) ready.push("the four probe allow rules in .claude/settings.local.json");
  else if (DRY) did.push(`would add ${add.length} probe allow rule(s) to .claude/settings.local.json`);
  else {
    settings.permissions.allow.push(...add);
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    did.push(`added ${add.length} probe allow rule(s) to .claude/settings.local.json (restart the session to load them)`);
  }
}

// 4. the tools the work needs
const major = Number(process.versions.node.split(".")[0]);
(major >= 22 ? ready : missing).push(`Node ${process.versions.node}${major >= 22 ? "" : " (the repository needs 22 or newer)"}`);
const gh = tryRun("gh", ["auth", "status"], main);
(gh !== null ? ready : missing).push(gh !== null ? "gh, logged in" : "gh: not installed or not logged in (run `gh auth login`; Kyler creates any token)");
const dotnet = tryRun("dotnet", ["--list-sdks"], main);
(dotnet && /^8\./m.test(dotnet) ? ready : missing).push(dotnet && /^8\./m.test(dotnet) ? "the .NET 8 SDK (the probe's mod)" : "the .NET 8 SDK: not found (only the probe's mod needs it)");
const py = tryRun("python", ["--version"], main);
(py ? ready : missing).push(py ? `${py} (the oracle)` : "python: not found (only `npm run oracle` needs it, with prototype/requirements.txt)");

// Timberborn: found or reported missing; only existence is checked, nothing in these folders is read
const games = [
  "C:/Program Files (x86)/Steam/steamapps/common/Timberborn",
  "C:/Program Files/Steam/steamapps/common/Timberborn",
  "D:/SteamLibrary/steamapps/common/Timberborn",
  "E:/SteamLibrary/steamapps/common/Timberborn",
];
const game = games.find((g) => existsSync(g));
(game ? ready : missing).push(game ? `Timberborn at ${game}` : "Timberborn's install folder: not found in the usual Steam places (probe batches can't run here)");
const docs = [join(homedir(), "Documents", "Timberborn"), join(homedir(), "OneDrive", "Documents", "Timberborn")].find((d) => existsSync(d));
(docs ? ready : missing).push(docs ? `Timberborn's player folder at ${slash(docs)} (never read or written except by the probe runner)` : "Timberborn's player folder (Documents/Timberborn): not found; the game hasn't been run here");
for (const [dir, what] of [
  [join(main, "investigation", "decompiled"), "the decompiled game code (investigation/decompile_all.sh; local only, never committed)"],
  [join(main, "investigation", "raw"), "the official maps (investigation/extract_builtin_maps.py; local only)"],
]) (existsSync(dir) ? ready : missing).push(existsSync(dir) ? what.split(" (")[0] : `${what}: not here yet`);

// 5. the summary
const list = (title, items) => items.length && console.log(`${title}\n${items.map((i) => `  - ${i}`).join("\n")}\n`);
list(DRY ? "Would do" : "Done now", did);
list("Ready", ready);
list("Missing or needs a look", missing);
console.log(
  missing.length
    ? "Some things are missing (above). Only tell Kyler about the ones the next task needs."
    : "Everything is ready. Read docs/HANDOFF.md next.",
);
