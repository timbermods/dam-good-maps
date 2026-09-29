// Run every request's reference solution through MapSession with the real validators, and check it
// against its pass criteria: the expectations of every goal on the combined result, the goals that
// must be reported unmet, the trade-offs that must be named, and the checks on tool results.
//
//   npx tsx investigation/claude/bin/reference.ts [--only S01,C01] [--kind compound] [--out file]
//
// Writes out/reference-results.json and out/REFERENCE.md.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openSetup } from "../lib/fixtures";
import { ClaudeTools } from "../lib/tools";
import { runCheck, substitute, type Corpus, type RequestCase } from "../lib/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
export const corpus = JSON.parse(readFileSync(join(root, "requests.json"), "utf8")) as Corpus;

const argv = process.argv.slice(2);
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = opt("--only")?.split(",");
const kind = opt("--kind");
const outFile = opt("--out") ?? join(root, "out", "reference-results.json");

export interface CaseResult {
  id: string;
  kind: string;
  pass: boolean;
  failures: string[];
  calls: number;
  ms: number;
  summaryBytes: number;
  maxResultBytes: number;
  accepted?: boolean;
  notMet?: string[];
  tradeoffs?: string[];
  draft?: string;
}

export function runCase(r: RequestCase): CaseResult {
  const t0 = Date.now();
  const failures: string[] = [];
  const res: CaseResult = { id: r.id, kind: r.kind, pass: false, failures, calls: 0, ms: 0, summaryBytes: 0, maxResultBytes: 0 };
  let opened;
  try {
    opened = openSetup(corpus.setups, r.setup);
  } catch (e) {
    failures.push(`setup: ${e instanceof Error ? e.message : String(e)}`);
    res.ms = Date.now() - t0;
    return res;
  }
  const tools = new ClaudeTools(opened.session, opened.conv);
  const summary = tools.summary();
  res.summaryBytes = summary.length;
  if (summary.length > 16 * 1024) failures.push(`the summary is ${summary.length} bytes, over 16 KB`);
  const results: unknown[] = [];
  const sources: Record<string, unknown> = { summary: JSON.parse(summary) };
  for (const [k, c] of r.reference.calls.entries()) {
    const args = substitute(c.args, results) as Record<string, unknown>;
    const call = tools.call(c.tool, args);
    const parsed = JSON.parse(call.result);
    results.push(parsed);
    sources[`call:${k}`] = parsed;
    res.maxResultBytes = Math.max(res.maxResultBytes, call.bytes);
    if (call.bytes > 32 * 1024) failures.push(`call ${k} (${c.tool}) returned ${call.bytes} bytes, over 32 KB`);
  }
  const p = r.reference.proposal;
  if (p) {
    const expectations = p.expectations ?? r.goals.flatMap((g) => g.expect.map((e) => ({ ...e, goal: e.goal ?? g.id })));
    const call = tools.call("propose", { request: r.text, goals: p.goals ?? r.goals.map((g) => ({ id: g.id, text: g.text })), steps: substitute(p.steps, results), expectations, report: "(reference solution)" });
    const out = JSON.parse(call.result) as Record<string, unknown>;
    sources.propose = out;
    res.maxResultBytes = Math.max(res.maxResultBytes, call.bytes);
    if (out.error) failures.push(`propose: ${String(out.error)}`);
    const exp = r.reference.expect ?? {};
    const wantAccepted = exp.accepted ?? true;
    res.accepted = out.accepted as boolean;
    if (out.accepted !== wantAccepted) failures.push(`propose ${out.accepted ? "was accepted" : "was not accepted"}; expected ${wantAccepted ? "accepted" : "not accepted"}${out.errors ? ` (${(out.errors as string[]).join("; ")})` : ""}${(out.steps as { errors?: string[] }[] | undefined)?.some((s) => s.errors) ? `: ${(out.steps as { index: number; errors?: string[] }[]).filter((s) => s.errors).map((s) => `step ${s.index}: ${s.errors!.join("; ")}`).join(" | ")}` : ""}`);
    const unmetWanted = new Set(exp.notMet ?? []);
    const checks = (out.expectations as { goal?: string; subject: string; metric: string; pass: boolean; why?: string; actual: unknown }[]) ?? [];
    for (const c of checks) {
      if (!c.pass && !unmetWanted.has(c.goal ?? "")) failures.push(`expectation ${c.goal ?? ""} ${c.subject} ${c.metric} failed: ${c.why}`);
      if (c.pass && unmetWanted.has(c.goal ?? "") && exp.allExpectations !== false) {
        /* a goal expected unmet may still pass some checks */
      }
    }
    const notMet = ((out.notMet as { goal: string }[]) ?? []).map((n) => n.goal);
    res.notMet = notMet;
    for (const g of unmetWanted) if (!notMet.includes(g)) failures.push(`goal ${g} should be reported unmet`);
    const kinds = (out.tradeoffKinds as string[]) ?? [];
    res.tradeoffs = kinds;
    for (const t of exp.tradeoffs ?? []) if (!kinds.includes(t)) failures.push(`trade-off ${t} should be named (got ${kinds.join(", ") || "none"})`);
    if (wantAccepted && ((out.guardsBroken as unknown[]) ?? []).length) failures.push(`guards broken: ${JSON.stringify(out.guardsBroken)}`);
    res.draft = out.draftReport as string;
  }
  for (const c of r.reference.checks ?? []) {
    const { pass, actual } = runCheck(c, sources);
    if (!pass) failures.push(`check ${c.on} ${c.path} ${c.op} ${c.value !== undefined ? JSON.stringify(c.value) : ""} failed (actual: ${JSON.stringify(actual)?.slice(0, 160)})${c.why ? `: ${c.why}` : ""}`);
  }
  res.calls = r.reference.calls.length + (p ? 1 : 0);
  res.pass = failures.length === 0;
  res.ms = Date.now() - t0;
  return res;
}

function main(): void {
  const cases = corpus.requests.filter((r) => (!only || only.includes(r.id)) && (!kind || r.kind === kind));
  const out: CaseResult[] = [];
  for (const r of cases) {
    const res = runCase(r);
    out.push(res);
    console.log(`${res.pass ? "PASS" : "FAIL"} ${r.id.padEnd(5)} ${r.kind.padEnd(16)} ${String(res.ms).padStart(6)} ms  ${res.pass ? "" : res.failures.join(" || ").slice(0, 600)}`);
  }
  const passed = out.filter((r) => r.pass).length;
  console.log(`\n${passed}/${out.length} reference solutions pass`);
  if (!only && !kind) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify({ ran: new Date().toISOString(), passed, total: out.length, results: out }, null, 1));
    const lines = [
      "# Reference solutions: results",
      "",
      `Every request's reference solution, run through MapSession with the real validators by \`bin/reference.ts\`. ${passed} of ${out.length} pass.`,
      "",
      "| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |",
      "|---|---|---|---|---|---|---|---|",
      ...out.map((r) => `| ${r.id} | ${r.kind} | ${r.pass ? "yes" : "**no**"} | ${r.calls} | ${r.accepted === undefined ? "" : r.accepted ? "yes" : "no"} | ${(r.notMet ?? []).join(", ")} | ${(r.tradeoffs ?? []).filter((t) => t !== "order").join(", ")} | ${r.ms} |`),
      "",
      ...out.filter((r) => !r.pass).map((r) => `- ${r.id}: ${r.failures.join("; ")}`),
    ];
    writeFileSync(join(root, "out", "REFERENCE.md"), lines.join("\n") + "\n");
  }
  if (passed < out.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
