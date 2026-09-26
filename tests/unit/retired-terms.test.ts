// Retired features must not come back (Kyler, PLAN.md §20 D188 (3); docs/README.md, "Retired terms").
// tools/retired-terms.json lists their names. This check fails when one reappears in a living
// document, the interface text or the editor code. Deliberate mentions are allowed: PLAN.md §20 (the
// decision log), EDITOR_PLAN.md's "Part 3: superseded", text between the allow markers, and the files
// in `pendingRemoval`, which still hold the old tools on dev until the Live editing work removes them.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

interface Term {
  term: string;
  retired: string;
  instead: string;
}

/** Retired interface text as a regular expression over the normalised text (and an example of it). */
interface Pattern {
  pattern: string;
  retired: string;
  instead: string;
  example: string;
}

interface Config {
  terms: Term[];
  patterns?: Pattern[];
  docs: string[];
  code: { dirs: string[]; files: string[]; extensions: string[] };
  allowedSections: { file: string; heading: string }[];
  markers: { open: string; close: string };
  pendingRemoval: { paths: string[] };
}

const CONFIG: Config = JSON.parse(readFileSync(join(ROOT, "tools/retired-terms.json"), "utf8"));

/** Lower case; `**` and backticks dropped; camelCase split; spaces, hyphens and underscores as one space. */
function normalise(s: string): string {
  return s
    .replace(/[*`]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[\s_-]+/g, " ")
    .toLowerCase();
}

function pattern(term: string): RegExp {
  const words = normalise(term).trim().split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b${words.join(" ")}(?:s|es)?\\b`, "g");
}

const PATTERNS = [
  ...CONFIG.terms.map((t) => ({ ...t, re: pattern(t.term) })),
  // retired interface text, as the config's regular expressions (a message a tool used to show)
  ...(CONFIG.patterns ?? []).map((p) => ({ term: p.pattern, retired: p.retired, instead: p.instead, re: new RegExp(p.pattern, "g") })),
];

/**
 * Which lines may name a retired term: those between the allow markers (the marker lines included),
 * and, in `file`, the sections the config allows (a heading to the next heading of its level or
 * higher, outside fenced code). Problems (an unclosed marker, a missing section) are listed.
 */
function allowedLines(file: string, lines: readonly string[], problems: string[]): boolean[] {
  const allowed = lines.map(() => false);
  let open = -1;
  lines.forEach((line, i) => {
    const opens = line.includes(CONFIG.markers.open);
    const closes = line.includes(CONFIG.markers.close);
    if (opens && open < 0) open = i;
    if (open >= 0) allowed[i] = true;
    if (closes) {
      if (open < 0) problems.push(`${file}:${i + 1}: a closing allow marker without an opening one`);
      open = -1;
    }
  });
  if (open >= 0) problems.push(`${file}:${open + 1}: an allow marker that is never closed`);
  for (const s of CONFIG.allowedSections.filter((a) => a.file === file)) {
    const level = /^#+/.exec(s.heading)![0].length;
    let fenced = false;
    let inside = false;
    let found = false;
    lines.forEach((line, i) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      const heading = !fenced && /^(#+) /.exec(line);
      if (heading && heading[1].length <= level) inside = line.trim() === s.heading;
      if (inside) {
        allowed[i] = true;
        found = true;
      }
    });
    if (!found) problems.push(`${file}: the allowed section "${s.heading}" is missing (renamed? update tools/retired-terms.json)`);
  }
  return allowed;
}

interface Hit {
  file: string;
  line: number;
  term: Term;
}

/** Every retired term in `text`, outside the allowed lines. A term may run across a line break. */
function scan(file: string, text: string, problems: string[] = []): Hit[] {
  const lines = text.split(/\r?\n/);
  const allowed = allowedLines(file, lines, problems);
  const hits: Hit[] = [];
  let i = 0;
  while (i < lines.length) {
    if (allowed[i]) {
      i++;
      continue;
    }
    // one run of lines that aren't allowed, joined, with the offset where each line starts (a blank
    // line leaves two spaces, so no term runs across a paragraph break)
    const starts: number[] = [];
    let joined = "";
    for (; i < lines.length && !allowed[i]; i++) {
      starts.push(joined.length);
      joined += normalise(lines[i]).trim() + " ";
    }
    const first = i - starts.length;
    for (const p of PATTERNS) {
      for (const m of joined.matchAll(p.re)) {
        let k = starts.length - 1;
        while (starts[k] > m.index!) k--;
        hits.push({ file, line: first + k + 1, term: p });
      }
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

function codeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...codeFiles(path));
    else if (CONFIG.code.extensions.includes(extname(e.name))) out.push(path);
  }
  return out;
}

function scanned(): string[] {
  const code = CONFIG.code.dirs.flatMap((d) => codeFiles(join(ROOT, d))).map((f) => relative(ROOT, f).split("\\").join("/"));
  return [...CONFIG.docs, ...CONFIG.code.files, ...code];
}

const show = (h: Hit) => `${h.file}:${h.line}: "${h.term.term}" (retired by ${h.term.retired}; instead: ${h.term.instead})`;

describe("retired terms stay retired (D188)", () => {
  it("no living document, interface text or editor code names a retired feature", () => {
    const files = scanned();
    expect(files.length).toBeGreaterThan(50);
    const problems: string[] = [];
    const hits: string[] = [];
    for (const file of files) {
      if (CONFIG.pendingRemoval.paths.includes(file)) continue;
      hits.push(...scan(file, readFileSync(join(ROOT, file), "utf8"), problems).map(show));
    }
    expect(problems).toEqual([]);
    expect(hits).toEqual([]);
  });

  it("every file waiting for removal exists and still holds a retired term (the list only shrinks)", () => {
    for (const file of CONFIG.pendingRemoval.paths) {
      expect(existsSync(join(ROOT, file)), `${file} is gone: remove it from pendingRemoval`).toBe(true);
      const hits = scan(file, readFileSync(join(ROOT, file), "utf8"));
      expect(hits.length, `${file} holds no retired term now: remove it from pendingRemoval`).toBeGreaterThan(0);
    }
  });

  it("catches a planted term, in every form it can take", () => {
    const text = [
      "Pick the river tool.", // 1: as written
      "Use the **River** tool, then the lake", // 2: bold, and a term split across a line break
      "tool to fill it.", // 3
      "const landformTools = [];", // 4: camelCase and a plural
      "RIVER_TOOL; .plant-brushes {}", // 5: snake case, hyphens, a plural in -es
      "A riverside tool shed; deliver tools; a Lake tooltip.", // 6: near misses, not terms
    ].join("\n");
    const hits = scan("docs/planted.md", text).map((h) => `${h.line} ${h.term.term}`);
    expect(hits).toEqual(["1 river tool", "2 river tool", "2 lake tool", "4 landform tool", "5 river tool", "5 Plant brush"]);
  });

  it("catches retired interface text: a planted message from an old tool, and every pattern's example", () => {
    // the message Kyler saw on the preview (the Hill tool's limit, D182)
    const planted = "Hill: reaches level 13 here, not 15: its edge climbs 1 level every 3 tiles…";
    const hits = scan("src/editor/planted.ts", planted).map((h) => h.term.term);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((t) => t.includes("reaches level"))).toBe(true);
    expect(hits.some((t) => t.includes("its edge"))).toBe(true);
    for (const p of CONFIG.patterns ?? []) expect(scan("src/editor/planted.ts", p.example).map((h) => h.term.term), p.example).toContain(p.pattern);
    // and plain words stay plain
    expect(scan("src/editor/planted.ts", "The water reaches level 7 here; a hill of our own.")).toEqual([]);
  });

  it("allows deliberate mentions between the markers and in the allowed sections", () => {
    const marked = ["Kept: Raise.", "<!-- retired-terms:allow -->", "**Removed:** the Channel tool;", "the river tool.", "<!-- /retired-terms:allow -->", "Then the Channel tool."].join("\n");
    expect(scan("ROADMAP.md", marked).map((h) => h.line)).toEqual([6]);

    const plan = ["## 19. Shared foundations", "The river tool.", "## 20. Editor decisions", "| D184 | the river tool and the lake tool |", "## Changes from audit", "the lake tool"].join("\n");
    expect(scan("PLAN.md", plan).map((h) => `${h.line} ${h.term.term}`)).toEqual(["2 river tool", "6 lake tool"]);

    const editor = ["# Part 2: the technical reference", "```sh", "# Part 3: superseded", "```", "the Show dropdown", "# Part 3: superseded", "| the Show dropdown |", "## A subsection", "the Advanced checkbox"].join("\n");
    expect(scan("EDITOR_PLAN.md", editor).map((h) => h.line)).toEqual([5]);

    const problems: string[] = [];
    scan("ROADMAP.md", "<!-- retired-terms:allow -->\nthe river tool", problems);
    expect(problems).toHaveLength(1);
  });
});
