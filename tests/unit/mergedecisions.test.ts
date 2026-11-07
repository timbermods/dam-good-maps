// tools/mergedecisions.py: resolves a merge whose conflicts are only in docs/decisions/*.md, decision by decision, and
// re-checks such a merge with --check.
//
// Speed (D453): spawning git is slow on some machines (about 0.65 s here), so the merge logic runs in one Python process
// (`--texts`, JSON cases on stdin), the git scenarios are built with one `git fast-import` in one repo, and only a
// few cases run the tool over real git merges. Needs git and python 3: CI has both; a machine without them skips,
// but in CI a missing one fails.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TOOL = resolve(__dirname, "../../tools/mergedecisions.py");
const DECISIONS = "docs/decisions/look.md";
const CODE_FILE = "src/code.txt";
const TAG = "decisions merged by tools/mergedecisions.py";

const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();
const HAS_GIT = !spawnSync("git", ["--version"]).error;
const MISSING = !PY || !HAS_GIT;

// No global or system git settings matter: identity, no line-ending conversion, no signing, no editor.
const ENV = {
  ...process.env,
  GIT_EDITOR: "true",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "core.autocrlf",
  GIT_CONFIG_VALUE_0: "false",
  GIT_CONFIG_KEY_1: "commit.gpgsign",
  GIT_CONFIG_VALUE_1: "false",
};

// ---------------------------------------------------------------------------------------------- the decisions

const d = (n: number, text: string) => `- **D${n}** ${text}`;
const file = (...lines: string[]) => ["### The look", "", ...lines, ""].join("\n");
const BASE = [d(10, "ten"), d(20, "twenty"), d(30, "thirty"), d(40, "forty")];
const lines = (over: Record<number, string>) => BASE.map((l, i) => over[(i + 1) * 10] ?? l);
const swap2030 = [BASE[0], BASE[2], BASE[1], BASE[3]];
const DEV20 = d(20, "twenty, by dev");
const BR30 = d(30, "thirty, by the branch");

interface TextCase {
  name: string;
  base: string;
  ours: string; // the branch
  theirs: string; // dev
  text?: string; // the resolved file
  refused?: string; // a part of the reason
}
const B = file(...BASE);
const TEXT_CASES: TextCase[] = [
  { name: "two amendments to neighbouring decisions", base: B, ours: file(...lines({ 30: BR30 })), theirs: file(...lines({ 20: DEV20 })), text: file(...lines({ 20: DEV20, 30: BR30 })) },
  { name: "both sides on one decision", base: B, ours: file(...lines({ 20: d(20, "by the branch") })), theirs: file(...lines({ 20: d(20, "by dev") })), refused: "both sides changed D20" },
  { name: "identical edits on both sides", base: B, ours: file(...lines({ 20: DEV20 })), theirs: file(...lines({ 20: DEV20 })), text: file(...lines({ 20: DEV20 })) },
  {
    name: "a decision appended on each side, in number order",
    base: B,
    ours: file(...BASE, d(60, "the branch's"), d(80, "the branch's second")),
    theirs: file(...BASE, d(50, "dev's"), d(70, "dev's second")),
    text: file(...BASE, d(50, "dev's"), d(60, "the branch's"), d(70, "dev's second"), d(80, "the branch's second")),
  },
  { name: "an appended decision beside an amendment", base: B, ours: file(...BASE, d(50, "the branch's")), theirs: file(...lines({ 40: d(40, "forty, by dev") })), text: file(...lines({ 40: d(40, "forty, by dev") }), d(50, "the branch's")) },
  { name: "the same number added with different text", base: B, ours: file(...BASE, d(50, "the branch's")), theirs: file(...BASE, d(50, "dev's")), refused: "both sides changed D50" },
  { name: "a decision added after one the other side removed", base: B, ours: file(BASE[0], BASE[1], BASE[2], d(35, "new"), BASE[3]), theirs: file(BASE[0], BASE[1], BASE[3]), refused: "D35 was added after D30, which the other side removed" },
  { name: "a decision the branch removed that dev left alone", base: B, ours: file(BASE[0], BASE[2], BASE[3]), theirs: file(...lines({ 40: d(40, "forty, by dev") })), text: file(BASE[0], BASE[2], d(40, "forty, by dev")) },
  { name: "a decision removed on one side and amended on the other", base: B, ours: file(BASE[0], BASE[2], BASE[3]), theirs: file(...lines({ 20: DEV20 })), refused: "both sides changed D20" },
  {
    name: "headings changed differently by both sides",
    base: B,
    ours: B.replace("### The look", "### The look, by the branch"),
    theirs: B.replace("### The look", "### The look, by dev"),
    refused: "not decisions",
  },
  {
    name: "a heading changed by one side, with both sides' decisions",
    base: B,
    ours: file(...lines({ 30: BR30 })),
    theirs: file(...lines({ 20: DEV20 })).replace("### The look", "### The look, by dev"),
    text: file(...lines({ 20: DEV20, 30: BR30 })).replace("### The look", "### The look, by dev"),
  },
  { name: "a decision the branch reordered", base: B, ours: file(...swap2030), theirs: file(...lines({ 40: d(40, "forty, by dev") })), refused: "moved" },
  { name: "a decision dev moved and the branch amended", base: B, ours: file(...lines({ 20: d(20, "twenty, by the branch") })), theirs: file(...swap2030), refused: "moved on one side and changed on the other" },
  { name: "a decision dev moved, beside the branch's amendment of another", base: B, ours: file(...lines({ 40: d(40, "forty, by the branch") })), theirs: file(...swap2030), text: file(BASE[0], BASE[2], BASE[1], d(40, "forty, by the branch")) },
  { name: "a number twice in one file", base: B, ours: file(...BASE, d(10, "again")), theirs: B, refused: "D10 is in ours twice" },
];

const CODE = "one\ntwo\nthree\n";
const TWO_DEV = "one\nTWO by dev\nthree\n";
const TWO_BRANCH = "one\nTWO by the branch\nthree\n";

// ---------------------------------------------------------------------------------------------- git fixtures

type Files = Record<string, string>;
const files = (decisions: string, code = CODE): Files => ({ [DECISIONS]: decisions, [CODE_FILE]: code });

/** A `git fast-import` stream: whole-tree commits on refs/heads/<ref>, parents by mark. */
class Stream {
  private parts: Buffer[] = [];
  private n = 0;
  private time = 1_700_000_000;
  private push(s: string) {
    this.parts.push(Buffer.from(s));
  }
  commit(ref: string, tree: Files, parents: number[] = []): number {
    const mark = ++this.n;
    this.push(`commit refs/heads/${ref}\nmark :${mark}\ncommitter t <t@example.com> ${this.time++} +0000\ndata ${Buffer.byteLength(ref)}\n${ref}\n`);
    if (parents[0]) this.push(`from :${parents[0]}\n`);
    for (const p of parents.slice(1)) this.push(`merge :${p}\n`);
    this.push("deleteall\n");
    for (const [path, text] of Object.entries(tree)) this.push(`M 644 inline ${path}\ndata ${Buffer.byteLength(text)}\n${text}\n`);
    this.push("\n");
    return mark;
  }
  bytes(): Buffer {
    return Buffer.concat(this.parts);
  }
}

const ADJ_OURS = file(...lines({ 30: BR30 }));
const ADJ_THEIRS = file(...lines({ 20: DEV20 }));
const ADJ_MERGED = file(...lines({ 20: DEV20, 30: BR30 }));

/** Scenarios: <name>/base, /ours (the branch), /theirs (dev) and merge commits <name>/merge-*. */
function buildStream(): Buffer {
  const s = new Stream();
  const scenario = (name: string, base: Files, ours: Files, theirs: Files, merges: Record<string, Files> = {}) => {
    const b = s.commit(`${name}/base`, base);
    const o = s.commit(`${name}/ours`, ours, [b]);
    const t = s.commit(`${name}/theirs`, theirs, [b]);
    for (const [m, tree] of Object.entries(merges)) s.commit(`${name}/merge-${m}`, tree, [o, t]);
  };
  // neighbouring amendments: git conflicts; a tool-made merge, and merges edited by hand
  scenario("adj", files(B), files(ADJ_OURS), files(ADJ_THEIRS), {
    tool: files(ADJ_MERGED),
    hand: files(ADJ_MERGED.replace("ten", "ten, slipped in")),
    outside: files(ADJ_MERGED, CODE + "four\n"),
  });
  // a code file conflicts too
  scenario("codeconf", files(B), files(ADJ_OURS, TWO_BRANCH), files(ADJ_THEIRS, TWO_DEV), { hand: files(ADJ_MERGED, "one\nTWO both\nthree\n") });
  // git merges it alone
  scenario("clean", files(B), files(ADJ_OURS), files(B, "ONE\ntwo\nthree\n"), { git: files(ADJ_OURS, "ONE\ntwo\nthree\n") });
  // a criss-cross: ours and theirs each merged b1 and b2, in the other order
  const a = s.commit("criss/root", files(B));
  const b1 = s.commit("criss/b1", files(B, CODE + "b1\n"), [a]);
  const b2 = s.commit("criss/b2", files(B, "zero\n" + CODE), [a]);
  const both = files(B, "zero\n" + CODE + "b1\n");
  const x = s.commit("criss/x", both, [b1, b2]);
  const y = s.commit("criss/y", both, [b2, b1]);
  const o = s.commit("criss/ours", files(ADJ_OURS, both[CODE_FILE]), [x]);
  const t = s.commit("criss/theirs", files(ADJ_THEIRS, both[CODE_FILE]), [y]);
  s.commit("criss/merge", files(ADJ_MERGED, both[CODE_FILE]), [o, t]);
  return s.bytes();
}

// ---------------------------------------------------------------------------------------------- the tests

if (MISSING && process.env.CI) {
  it("has git and python 3 (CI's runners must)", () => {
    throw new Error(`CI needs ${HAS_GIT ? "" : "git "}${PY ? "" : "python 3"} to test tools/mergedecisions.py`);
  });
}

describe.skipIf(MISSING)("tools/mergedecisions.py", () => {
  let repo = "";
  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  const run = (exe: string, args: string[], input?: string | Buffer) => {
    const r = spawnSync(exe, args, { cwd: repo || undefined, encoding: "utf8", env: ENV, input });
    return { status: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };
  const git = (...args: string[]) => run("git", args);
  const tool = (...args: string[]) => run(PY!, [TOOL, ...args]);
  const read = (path: string) => readFileSync(join(repo, path), "utf8");
  /** Back to a clean checkout of a scenario's branch. */
  const checkout = (ref: string) => {
    git("merge", "--abort");
    const r = git("checkout", "-q", "-f", "--detach", ref);
    expect(r.status, r.out).toBe(0);
  };

  let results: Array<{ text?: string; refused?: string }> = [];
  beforeAll(() => {
    const r = spawnSync(PY!, [TOOL, "--texts"], { encoding: "utf8", input: JSON.stringify(TEXT_CASES.map(({ base, ours, theirs }) => ({ base, ours, theirs }))) });
    expect(r.status, r.stderr).toBe(0);
    results = JSON.parse(r.stdout);

    repo = mkdtempSync(join(tmpdir(), "dgm-mergedec-"));
    expect(git("init", "-q", "-b", "main").status).toBe(0);
    const f = run("git", ["fast-import", "--quiet"], buildStream());
    expect(f.status, f.out).toBe(0);
  });

  describe("the merge of one file's text", () => {
    TEXT_CASES.forEach((c, i) => {
      it(c.name, () => {
        const r = results[i];
        if (c.refused !== undefined) {
          expect(r.text, "should refuse").toBeUndefined();
          expect(r.refused).toContain(c.refused);
        } else {
          expect(r.refused).toBeUndefined();
          expect(r.text).toBe(c.text);
        }
      });
    });
  });

  describe("over real git merges", () => {
    it("resolves a conflicted merge, and --check passes on the commit", () => {
      checkout("adj/ours");
      expect(git("merge", "adj/theirs").status).toBe(1); // git alone cannot do it
      expect(read(DECISIONS)).toContain("<<<<<<<");
      const r = tool();
      expect(r.status, r.out).toBe(0);
      expect(r.out).toContain(TAG);
      expect(read(DECISIONS)).toBe(ADJ_MERGED);
      const c = git("commit", "-q", "--no-edit");
      expect(c.status, c.out).toBe(0);
      expect(git("log", "-1", "--format=%B").out).toContain(TAG);
      const k = tool("--check", "HEAD");
      expect(k.status, k.out).toBe(0);
    });

    it("refuses a conflict in any other file, and writes nothing", () => {
      checkout("codeconf/ours");
      expect(git("merge", "codeconf/theirs").status).toBe(1);
      const before = read(DECISIONS);
      const r = tool();
      expect(r.status).toBe(1);
      expect(r.out).toContain(`${CODE_FILE}: refused: conflict outside docs/decisions/`);
      expect(read(DECISIONS)).toBe(before);
    });

    it("refuses a merge with more than one merge base (a criss-cross), in both modes", () => {
      checkout("criss/ours");
      git("merge", "--no-commit", "criss/theirs");
      const r = tool();
      expect(r.status).toBe(1);
      expect(r.out).toContain("2 merge bases");
      const k = tool("--check", "criss/merge");
      expect(k.status).toBe(1);
      expect(k.out).toContain("2 merge bases");
    });

    it("with explicit refs reports and writes nothing outside a merge, and takes --write", () => {
      checkout("adj/ours");
      const base = git("merge-base", "adj/ours", "adj/theirs").out.trim();
      const before = read(DECISIONS);
      const r = tool("--base", base, "--ours", "adj/ours", "--theirs", "adj/theirs");
      expect(r.status, r.out).toBe(0);
      expect(r.out).toContain(`${DECISIONS}: resolved`);
      expect(read(DECISIONS)).toBe(before);
      expect(tool("--base", base, "--ours", "adj/ours", "--theirs", "adj/theirs", "--write").status).toBe(0);
      expect(read(DECISIONS)).toBe(ADJ_MERGED);
    });
  });

  describe("--check on merge commits", () => {
    it("passes on a tool-made merge", () => {
      const k = tool("--check", "adj/merge-tool");
      expect(k.status, k.out).toBe(0);
    });
    it("passes on a merge git made alone", () => {
      const k = tool("--check", "clean/merge-git");
      expect(k.status, k.out).toBe(0);
    });
    it("fails when the decisions file was edited by hand", () => {
      const k = tool("--check", "adj/merge-hand");
      expect(k.status).toBe(1);
      expect(k.out).toContain(`${DECISIONS}: differs from what the tool makes`);
    });
    it("fails when a file outside docs/decisions/ was changed too", () => {
      const k = tool("--check", "adj/merge-outside");
      expect(k.status).toBe(1);
      expect(k.out).toContain(`outside docs/decisions/: ${CODE_FILE}`);
    });
    it("fails when a code conflict was resolved by hand", () => {
      const k = tool("--check", "codeconf/merge-hand");
      expect(k.status).toBe(1);
      expect(k.out).toContain(CODE_FILE);
    });
  });
});
