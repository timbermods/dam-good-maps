// tools/mergedecisions.py: resolves a merge whose conflicts are only in docs/decisions/*.md, decision by decision, and
// re-checks such a merge with --check. The tests build small throwaway git repos and run the real tool in them.
// Needs git and python 3 (CI's runners have both; a machine without them skips).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const TOOL = resolve(__dirname, "../../tools/mergedecisions.py");
const DECISIONS = "docs/decisions/look.md";

const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();
const HAS_GIT = !spawnSync("git", ["--version"]).error;

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const ENV = { ...process.env, GIT_EDITOR: "true", GIT_TERMINAL_PROMPT: "0" };

function git(cwd: string, ...args: string[]): { status: number; out: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
  return { status: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function mustGit(cwd: string, ...args: string[]): string {
  const r = git(cwd, ...args);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.out}`);
  return r.out;
}
function tool(cwd: string, ...args: string[]): { status: number; out: string } {
  const r = spawnSync(PY!, [TOOL, ...args], { cwd, encoding: "utf8", env: ENV });
  return { status: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const read = (cwd: string, path: string) => readFileSync(join(cwd, path), "utf8");
function write(cwd: string, path: string, text: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), text);
}
const commit = (cwd: string, message: string) => {
  mustGit(cwd, "add", "-A");
  mustGit(cwd, "commit", "-q", "-m", message);
};

const d = (n: number, text: string) => `- **D${n}** ${text}`;
const file = (...lines: string[]) => ["### The look", "", ...lines, ""].join("\n");
const BASE = [d(10, "ten"), d(20, "twenty"), d(30, "thirty"), d(40, "forty")];
const lines = (...over: Record<number, string>[]) => {
  const m = Object.assign({}, ...over) as Record<number, string>;
  return BASE.map((l, i) => m[(i + 1) * 10] ?? l);
};

/** A repo on branch `feature` whose base commit has the decisions file and a code file; `dev` is the other side. */
function scenario(dev: (cwd: string) => void, feature: (cwd: string) => void): string {
  const cwd = mkdtempSync(join(tmpdir(), "dgm-mergedec-"));
  roots.push(cwd);
  mustGit(cwd, "init", "-q", "-b", "main");
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) mustGit(cwd, "config", k, v);
  write(cwd, DECISIONS, file(...BASE));
  write(cwd, "src/code.txt", "one\ntwo\nthree\n");
  commit(cwd, "base");
  mustGit(cwd, "branch", "dev");
  mustGit(cwd, "checkout", "-q", "-b", "feature");
  feature(cwd);
  commit(cwd, "feature");
  mustGit(cwd, "checkout", "-q", "dev");
  dev(cwd);
  commit(cwd, "dev");
  mustGit(cwd, "checkout", "-q", "feature");
  return cwd;
}
const edit = (path: string, text: string) => (cwd: string) => write(cwd, path, text);

describe.skipIf(!PY || !HAS_GIT)("tools/mergedecisions.py", () => {
  it("resolves two amendments to neighbouring decisions, and --check passes on the merge", () => {
    const cwd = scenario(edit(DECISIONS, file(...lines({ 20: d(20, "twenty, by dev") }))), edit(DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") }))));
    expect(git(cwd, "merge", "dev").status).toBe(1); // git alone cannot do it
    expect(read(cwd, DECISIONS)).toContain("<<<<<<<");
    const r = tool(cwd);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("decisions merged by tools/mergedecisions.py");
    expect(read(cwd, DECISIONS)).toBe(file(...lines({ 20: d(20, "twenty, by dev"), 30: d(30, "thirty, by the branch") })));
    mustGit(cwd, "commit", "-q", "--no-edit");
    expect(mustGit(cwd, "log", "-1", "--format=%B")).toContain("decisions merged by tools/mergedecisions.py");
    const c = tool(cwd, "--check", "HEAD");
    expect(c.status, c.out).toBe(0);
  });

  it("refuses when both sides changed the same decision, and writes nothing", () => {
    const cwd = scenario(edit(DECISIONS, file(...lines({ 20: d(20, "by dev") }))), edit(DECISIONS, file(...lines({ 20: d(20, "by the branch") }))));
    git(cwd, "merge", "dev");
    const before = read(cwd, DECISIONS);
    const r = tool(cwd);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`${DECISIONS}: refused: both sides changed D20`);
    expect(read(cwd, DECISIONS)).toBe(before);
  });

  it("keeps a decision appended on each side, in number order", () => {
    const cwd = scenario(
      edit(DECISIONS, file(...BASE, d(50, "dev's"), d(70, "dev's second"))),
      edit(DECISIONS, file(...BASE, d(60, "the branch's"), d(80, "the branch's second"))),
    );
    expect(git(cwd, "merge", "dev").status).toBe(1);
    const r = tool(cwd);
    expect(r.status, r.out).toBe(0);
    expect(read(cwd, DECISIONS)).toBe(file(...BASE, d(50, "dev's"), d(60, "the branch's"), d(70, "dev's second"), d(80, "the branch's second")));
    mustGit(cwd, "commit", "-q", "--no-edit");
    expect(tool(cwd, "--check", "HEAD").status).toBe(0);
  });

  it("brings in a decision the branch appended beside an amendment dev made", () => {
    const cwd = scenario(edit(DECISIONS, file(...lines({ 40: d(40, "forty, by dev") }))), edit(DECISIONS, file(...BASE, d(50, "the branch's"))));
    expect(git(cwd, "merge", "dev").status).toBe(1);
    expect(tool(cwd).status).toBe(0);
    expect(read(cwd, DECISIONS)).toBe(file(...lines({ 40: d(40, "forty, by dev") }), d(50, "the branch's")));
  });

  it("refuses a branch decision added after one dev removed", () => {
    const cwd = scenario(
      edit(DECISIONS, file(BASE[0], BASE[1], BASE[3])),
      edit(DECISIONS, file(BASE[0], BASE[1], BASE[2], d(35, "new"), BASE[3])),
    );
    git(cwd, "merge", "dev");
    const r = tool(cwd);
    expect(r.status).toBe(1);
    expect(r.out).toContain("D35 was added after D30, which the other side removed");
  });

  it("refuses when the lines that are not decisions were changed differently by both sides", () => {
    const cwd = scenario(
      edit(DECISIONS, file(...BASE).replace("### The look", "### The look, by dev")),
      edit(DECISIONS, file(...BASE).replace("### The look", "### The look, by the branch")),
    );
    git(cwd, "merge", "dev");
    const r = tool(cwd);
    expect(r.status).toBe(1);
    expect(r.out).toContain("not decisions");
  });

  it("keeps a heading one side changed, with both sides' decisions", () => {
    const cwd = scenario(
      edit(DECISIONS, file(...lines({ 20: d(20, "twenty, by dev") })).replace("### The look", "### The look, by dev")),
      edit(DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") }))),
    );
    expect(git(cwd, "merge", "dev").status).toBe(1);
    const r = tool(cwd);
    expect(r.status, r.out).toBe(0);
    expect(read(cwd, DECISIONS)).toBe(file(...lines({ 20: d(20, "twenty, by dev"), 30: d(30, "thirty, by the branch") })).replace("### The look", "### The look, by dev"));
  });

  it("refuses a conflict in any other file, and writes nothing", () => {
    const cwd = scenario(
      (c) => {
        write(c, DECISIONS, file(...lines({ 20: d(20, "twenty, by dev") })));
        write(c, "src/code.txt", "one\nTWO by dev\nthree\n");
      },
      (c) => {
        write(c, DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") })));
        write(c, "src/code.txt", "one\nTWO by the branch\nthree\n");
      },
    );
    expect(git(cwd, "merge", "dev").status).toBe(1);
    const before = read(cwd, DECISIONS);
    const r = tool(cwd);
    expect(r.status).toBe(1);
    expect(r.out).toContain("src/code.txt: refused: conflict outside docs/decisions/");
    expect(read(cwd, DECISIONS)).toBe(before);
  });

  it("--check fails on a merge whose decisions file was edited by hand", () => {
    const cwd = scenario(edit(DECISIONS, file(...lines({ 20: d(20, "twenty, by dev") }))), edit(DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") }))));
    git(cwd, "merge", "dev");
    expect(tool(cwd).status).toBe(0);
    write(cwd, DECISIONS, read(cwd, DECISIONS).replace("ten", "ten, slipped in"));
    mustGit(cwd, "add", DECISIONS);
    mustGit(cwd, "commit", "-q", "--no-edit");
    const c = tool(cwd, "--check", "HEAD");
    expect(c.status).toBe(1);
    expect(c.out).toContain(`${DECISIONS}: differs from what the tool makes`);
  });

  it("--check fails on a merge that also changed a file outside docs/decisions/", () => {
    const cwd = scenario(edit(DECISIONS, file(...lines({ 20: d(20, "twenty, by dev") }))), edit(DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") }))));
    git(cwd, "merge", "dev");
    expect(tool(cwd).status).toBe(0);
    write(cwd, "src/code.txt", "one\ntwo\nthree\nfour\n");
    mustGit(cwd, "add", "src/code.txt");
    mustGit(cwd, "commit", "-q", "--no-edit");
    const c = tool(cwd, "--check", "HEAD");
    expect(c.status).toBe(1);
    expect(c.out).toContain("outside docs/decisions/: src/code.txt");
  });

  it("--check fails on a merge hand-resolved in a code file", () => {
    const cwd = scenario(
      (c) => write(c, "src/code.txt", "one\nTWO by dev\nthree\n"),
      (c) => write(c, "src/code.txt", "one\nTWO by the branch\nthree\n"),
    );
    expect(git(cwd, "merge", "dev").status).toBe(1);
    write(cwd, "src/code.txt", "one\nTWO both\nthree\n");
    mustGit(cwd, "add", "src/code.txt");
    mustGit(cwd, "commit", "-q", "--no-edit");
    expect(tool(cwd, "--check", "HEAD").status).toBe(1);
  });

  it("--check passes on a merge git made alone", () => {
    const cwd = scenario(edit("src/code.txt", "ONE\ntwo\nthree\n"), edit(DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") }))));
    expect(git(cwd, "merge", "dev").status).toBe(0);
    expect(tool(cwd, "--check", "HEAD").status).toBe(0);
  });

  it("with explicit refs it reports and writes nothing outside a merge, and takes --write", () => {
    const cwd = scenario(edit(DECISIONS, file(...lines({ 20: d(20, "twenty, by dev") }))), edit(DECISIONS, file(...lines({ 30: d(30, "thirty, by the branch") }))));
    const base = mustGit(cwd, "merge-base", "feature", "dev").trim();
    const before = read(cwd, DECISIONS);
    const r = tool(cwd, "--base", base, "--ours", "feature", "--theirs", "dev");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`${DECISIONS}: resolved`);
    expect(read(cwd, DECISIONS)).toBe(before);
    expect(tool(cwd, "--base", base, "--ours", "feature", "--theirs", "dev", "--write").status).toBe(0);
    expect(read(cwd, DECISIONS)).toBe(file(...lines({ 20: d(20, "twenty, by dev"), 30: d(30, "thirty, by the branch") })));
  });
});
