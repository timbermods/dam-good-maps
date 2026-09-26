// Report templates: what the player reads after a proposal (EDITOR_PLAN §7 "Loop"). The app drafts
// the facts; Claude writes the report and must say every one of them. Rules:
// - one line per goal: what was built, with measured numbers;
// - every trade-off by name: what gave way, and why;
// - every goal not met: why, and the nearest feasible alternative, offered and not built;
// - the assumptions made; and whether every start requirement still holds.
// Short sentences in plain words (the timbermods writing rule): no ids unless the player needs them.

import type { Proposal, ProposalResult } from "./compound";
import type { Measured } from "./metrics";

const TEMPLATES = {
  built: (what: string, facts: string) => `Built ${what}${facts ? `: ${facts}` : ""}.`,
  notDone: (goal: string, why: string) => `Not done: ${goal}. ${cap(why)}.`,
  offer: (alt: string) => `Nearest I can do: ${alt}. Say "yes" to build that instead.`,
  tradeoff: (text: string) => `Trade-off: ${cap(text)}.`,
  also: (text: string) => `Also: ${text.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, "")}.`,
  assumption: (text: string) => `Assumption: ${text}.`,
  startOk: (list: string) => `Every start rule still holds (${list}).`,
  startBroken: (list: string) => `Warning: ${list}.`,
};

/** The start rules in words, for the report (ids the validator adds later fall back to the id). */
const RULE_WORDS: Record<string, (v: string, l: string) => string> = {
  "start.water": (v, l) => (v === "none" ? `no clean water in reach (needed within ${l} tiles)` : `clean water ${v} tiles away (at most ${l})`),
  "start.badwater": (v, l) => `badwater ${v} tiles away (at least ${l})`,
  "start.reach": (v, l) => `${v} walkable tiles (at least ${l})`,
  "start.reach_water": () => "water reachable without slopes",
  "start.food": (v, l) => `${v} berry bushes nearby (at least ${l})`,
  "start.wood": (v, l) => `${v} logs of wood nearby (at least ${l})`,
  "start.ruins_clear": (v, l) => `${v} ruins in the start area (${l} allowed)`,
  "start.dry": () => "a dry start",
};

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function facts(m: Record<string, unknown>): string {
  const out: string[] = [];
  if (m.where) out.push(`in the ${String(m.where)}`);
  const c = m.course as { river: string; frac: number; bank: string; fromRiver?: number } | undefined;
  // a place far off the river is not "n% of the way down" it in any sense a player would use
  if (c && (c.fromRiver ?? 0) <= 25) out.push(`${Math.round(c.frac * 100)}% of the way down ${c.river}${c.bank && c.bank !== "on the river" ? `, on the ${c.bank}` : ""}`);
  else if (c) out.push(`${c.fromRiver} tiles from ${c.river}, on the ${c.bank}`);
  if (m.lipWidth !== undefined) out.push(`${m.lipWidth} tiles of falling water, a ${m.drop}-level drop, ${m.flow} blocks/s`);
  const res = m.reservoir as { volume: number; area: number; damLength: number } | null | undefined;
  if (res) out.push(`a dam ${res.damLength} tiles long would hold ${res.volume} blocks over ${res.area} tiles`);
  if (m.reservoirClean === false) out.push("its water is contaminated");
  if (m.kind === "badwaterBasin") {
    const o = m.outlet as { to?: string; river?: string; frac?: number } | undefined;
    out.push(`${m.strength} blocks/s of badwater, draining ${o?.river ? `into ${o.river} ${Math.round((o.frac ?? 0) * 100)}% of the way down` : "to the map edge"}`);
  }
  if (m.area !== undefined && (m.kind === "lake" || m.lake === true)) out.push(`${m.kind === "lake" ? "" : "a lake of "}${m.area} tiles at level ${m.level}`);
  if ((m.kind === "source" || m.kind === "badwaterSource") && typeof m.strength === "number") out.push(`${m.strength} blocks/s of ${m.kind === "source" ? "water" : "badwater"}`);
  if (m.trees !== undefined) out.push(`${m.trees} trees`);
  if (m.bushes !== undefined) out.push(`${m.bushes} berry bushes`);
  if (m.scrap !== undefined) out.push(`${m.scrap} scrap`);
  if (m.distanceToStart !== undefined && m.kind !== "start") out.push(`${m.distanceToStart} tiles from the start`);
  return out.join(", ");
}

const NAMES: Record<string, string> = {
  waterfall: "a waterfall",
  damSite: "a dam site",
  gorge: "a gorge",
  terracedCliffs: "terraced cliffs",
  badwaterBasin: "a badwater spring",
  lake: "a lake",
  river: "a river",
  forest: "a forest",
  berryPatch: "a berry patch",
  ruinField: "a ruin field",
  hill: "a hill",
  plateau: "a plateau",
  landform: "a landform",
};

/** The app's draft: every fact the final report must carry. */
export function writeReport(r: ProposalResult, p: Proposal, after: Measured): string {
  const lines: string[] = [];
  for (const st of r.steps) {
    if (!st.ok) continue;
    if (st.op === "changeSettings") {
      const moved = (st.resolved.moved as string[] | undefined) ?? [];
      lines.push(`Changed the map's settings${st.resolved.word ? ` to make it ${String(st.resolved.word)}` : ""}${moved.length ? `: ${moved.join("; ")}` : ""}.`);
      continue;
    }
    if (st.op === "moveStart") {
      const to = st.resolved.to as number[];
      const w = st.resolved.where as string | undefined;
      lines.push(`Moved the start to ${w ? `the ${w}, ` : ""}(${to.join(", ")}).`);
      continue;
    }
    for (const m of st.made) {
      const meas = r.measured.find((x) => x.handle === m.handle) ?? {};
      if (st.op === "moveStart") continue;
      lines.push(TEMPLATES.built(NAMES[String((meas as { kind?: string }).kind ?? m.kind)] ?? m.kind, facts(meas as Record<string, unknown>)));
    }
    if (st.op === "deleteFeature") lines.push(`Removed the ${String(st.resolved.kind ?? "feature")}.`);
    if (st.op === "undoLast") lines.push(`Undid the last change (${st.report.join("; ")}).`);
    if (st.op === "changeSetPiece" || st.op === "changeFeature" || st.op === "moveFeature") {
      const meas = r.measured.find((x) => (x as { id?: string }).id === st.resolved.target) as Record<string, unknown> | undefined;
      const what = NAMES[String(meas?.kind ?? "")]?.replace(/^an? /, "the ") ?? "the feature";
      lines.push(`${st.op === "moveFeature" ? "Moved" : "Changed"} ${what}${meas ? `: now ${facts(meas)}` : ""}${st.op === "changeFeature" && st.report.length ? ` (${st.report.join("; ")})` : ""}.`);
    }
    // a brush says what it moved, by how much, and where its edge slopes; a source, where it is
    // and what its water does
    if (st.op === "brush" || st.op === "addSource") lines.push(`${st.report.join("; ").replace(/^./, (c) => c.toUpperCase())}.`);
  }
  // side effects (what a step cleared or planted) are reported, but they are not trade-offs
  for (const t of r.tradeoffs) if (t.kind !== "order") lines.push(t.kind === "cleared" || (t.kind === "start-moved" && !/regenerated/.test(t.text)) ? TEMPLATES.also(t.text) : TEMPLATES.tradeoff(t.text));
  for (const n of r.notMet) {
    lines.push(TEMPLATES.notDone(n.text, n.why));
    if (n.alternative) lines.push(TEMPLATES.offer(n.alternative));
  }
  const assumptions = new Set<string>();
  for (const st of r.steps) for (const a of (st.resolved.assumptions as string[] | undefined) ?? []) assumptions.add(a);
  // the player reads no ids: an assumption names its feature in words, and its id in brackets for Claude
  const noIds = (t: string) => t.replace(/\s*\((?:f-[a-z0-9]+|[0-9a-f]{8}-[0-9a-f-]{27})\)/g, "");
  for (const a of assumptions) lines.push(TEMPLATES.assumption(noIds(a)));
  const start = r.guards.startRequirements.filter((g) => !["start.clear", "start.count", "start.flat", "start.entrance"].includes(g.id));
  const rule = (g: { id: string; value?: number | string; limit?: number | string }) =>
    RULE_WORDS[g.id]?.(String(g.value ?? "?"), String(g.limit ?? "?")) ?? `${g.id.replace("start.", "")}${g.value !== undefined ? ` ${String(g.value)}` : ""}${g.limit !== undefined ? ` (rule ${String(g.limit)})` : ""}`;
  const broken = start.filter((g) => !g.ok && !g.failedBefore);
  const already = start.filter((g) => !g.ok && g.failedBefore);
  if (broken.length) lines.push(TEMPLATES.startBroken(broken.map(rule).join("; ")));
  if (already.length) lines.push(`These start rules already failed before this change and still fail: ${already.map(rule).join("; ")}.`);
  if (!broken.length && !already.length && start.length) lines.push(TEMPLATES.startOk(start.filter((g) => g.value !== undefined).map(rule).join(", ")));
  else if (!broken.length && already.length) lines.push("Every other start rule still holds.");
  void p;
  void after;
  return lines.join("\n");
}

/** What a report must mention to be accurate (the grading key's report checks). */
export function mustMention(r: ProposalResult): string[] {
  const out: string[] = [];
  for (const t of r.tradeoffs) if (t.kind === "badwater-poisons-reservoir" || t.kind === "less-flow" || t.kind === "guard" || t.kind === "reduced") out.push(t.kind);
  for (const n of r.notMet) out.push(`not met: ${n.goal}`);
  return out;
}
