// A run's summary in Markdown (results/<run>/summary.md, outside the repository): the counts, each
// check's verdict and numbers by group, every error the game logged, and the run itself.
import { writeFileSync } from 'node:fs';
import { type GameVerdicts, Loaded, logProblems } from './compare';
import type { Prepared } from './jobs';
import { cycleMarkdown } from './cycles';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function counts(verdicts: GameVerdicts[]): Record<string, number> {
  const c: Record<string, number> = { passed: 0, failed: 0, 'not measurable': 0, recorded: 0 };
  for (const g of verdicts) for (const x of g.checks) c[x.verdict] = (c[x.verdict] ?? 0) + 1;
  return c;
}

export function writeSummary(file: string, runId: string, prepared: Prepared[], loaded: Map<string, Loaded>, verdicts: GameVerdicts[], otherMods: string[] = [], keepMods = false): void {
  const out: string[] = [];
  const c = counts(verdicts);
  out.push(`# DGM Probe run ${runId}`, '');
  if (keepMods) out.push(`Played with the installed mods (Kyler's choice): ${otherMods.join(', ') || 'none besides DGM Probe'}. The numbers are the game with these mods, not the unmodified game.`, '');
  else if (otherMods.length) out.push(`**Not a clean run:** other mods were loaded (${otherMods.join(', ')}), so the game measured was not the unmodified game.`, '');
  out.push(`${verdicts.length} maps. Checks: ${c.passed} passed, ${c.failed} failed, ${c['not measurable']} not measurable, ${c.recorded} recorded.`, '');
  const groups = [...new Set(verdicts.map((v) => v.group))];
  for (const g of groups) {
    out.push(`## ${g}`, '');
    out.push('| Map | Check | Result | Numbers |', '|---|---|---|---|');
    for (const v of verdicts.filter((x) => x.group === g))
      for (const x of v.checks) out.push(`| ${esc(v.title)} | ${x.id} | ${x.verdict} | ${esc(x.detail)} |`);
    out.push('');
  }
  // a long play (`--cycles`): one table per map and faction, a row per cycle
  const long = verdicts.filter((v) => v.cycles);
  if (long.length) {
    out.push(`## Cycle by cycle`, '', "Each hazard's start, first day and end, as the game played them. Pump tiles: clean water a pump reaches within the start's walk (start.water) at the hazard's checkpoint with the fewest. Start's water: the water left in the bodies start.water counts at the load. Farmland: moist, dry, clean land within 20 tiles' walk. Real min: the real time from the previous cycle's end. The probe plays no colony (its beavers die of thirst around day 8 on every map), so the colony's survival is read from these, not from its beavers.", '');
    for (const v of long) out.push(...cycleMarkdown(v.title, v.cycles!));
  }
  // the maps with frame times (the Sizes group): one row each, to read the practical limits from
  const perf = prepared.filter((p) => loaded.get(p.game.id)?.result?.perf?.phases?.length);
  if (perf.length) {
    const ids = [...new Set(perf.flatMap((p) => loaded.get(p.game.id)!.result!.perf!.phases.map((x) => x.id)))];
    out.push('## Frame times and load', '', 'Median / 95th percentile frame time in ms, and the game speed reached, with a camera pan over the whole map.', '');
    out.push(`| Map | Size | Load s | MB at load | ${ids.map((i) => `${i}: median / p95 ms (speed)`).join(' | ')} | MB at the end |`, `|---|---|---|---|${ids.map(() => '---|').join('')}---|`);
    for (const p of perf) {
      const r = loaded.get(p.game.id)!.result!;
      const ph = r.perf!.phases;
      const cell = (id: string) => ((x) => (x ? `${x.medianMs.toFixed(1)} / ${x.p95Ms.toFixed(1)} (${x.speedReached.toFixed(1)}×)` : ''))(ph.find((x) => x.id === id));
      out.push(`| ${esc(p.game.title)} | ${p.info.W}×${p.info.H} | ${(r.loadSeconds ?? 0).toFixed(1)} | ${(r.workingSetAtLoadMb ?? 0).toFixed(0)} | ${ids.map(cell).join(' | ')} | ${ph.at(-1)!.workingSetMb.toFixed(0)} |`);
    }
    const env = perf.map((p) => loaded.get(p.game.id)!.result!.perf!.environment).find(Boolean);
    if (env) out.push('', `The game's own graphics: ${env.screen}, vsync ${env.vSync}, target ${env.targetFrameRate} fps, quality ${env.qualityLevel}; ${env.gpu}; ${env.cpu}; ${env.memoryMb} MB.`);
    out.push('');
  }
  out.push('## Runs', '', '| Map | Status | Ticks | Real s | Speed | Shots | Loading issues | Log errors | Warnings | Notes |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const p of prepared) {
    const r = loaded.get(p.game.id)?.result;
    if (!r) {
      out.push(`| ${esc(p.game.title)} | no result | | | | | | | | |`);
      continue;
    }
    const lp = logProblems(r);
    out.push(`| ${esc(p.game.title)} | ${r.status}${r.failure ? ': ' + esc(r.failure) : ''} | ${r.ticks ?? ''} | ${Math.round(r.realSeconds ?? 0)} | ${(r.meanSpeed ?? 0).toFixed(1)} | ${(r.shots ?? []).length} | ${(r.loadingIssues ?? []).length} | ${lp.errors.length} | ${lp.warnings} | ${esc((r.notes ?? []).join('; '))} |`);
  }
  out.push('', '## Errors and warnings the game logged', '');
  for (const p of prepared) {
    const r = loaded.get(p.game.id)?.result;
    const lines = (r?.log ?? []).filter((l) => l.type !== 'Log');
    if (!lines.length) continue;
    out.push(`### ${p.game.title}`, '');
    const seen = new Map<string, number>();
    for (const l of lines) {
      const k = `${l.type}: ${l.message.split('\n')[0].slice(0, 240)}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    for (const [k, n] of seen) out.push(`- ${esc(k)}${n > 1 ? ` (${n}×)` : ''}`);
    out.push('');
  }
  writeFileSync(file, out.join('\n') + '\n');
}
