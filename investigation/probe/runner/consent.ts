// Kyler's rule for every launch (2026-09-25): the game starts only after his explicit yes for that run.
// A run without the flag prints what it would do (maps, checks, time, and that it launches Timberborn),
// writes a one-time code for that plan, and stops. The calling session asks Kyler; after his yes it
// runs again with `--confirmed-launch <code>`. The code is used up by the launch, and it matches only
// the plan it was made for, so an earlier yes never covers a new run. Run from a terminal, the runner
// can instead ask directly and wait for "yes".
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { probePaths } from './paths';

export interface PlanSummary {
  maps: { id: string; title: string; checks: string[]; days: number }[];
  /** The maps the runner wrote for this plan with their groups' writers (writers.ts): the code covers these bytes. */
  written?: { group: string; dir: string; files: { file: string; size: [number, number]; bytes: number; sha256: string; status: 'written' | 'current' }[] }[];
  estimateMinutes: number;
  kind: 'smoke' | 'batch';
  /** Played with the installed mods (no settings changed). */
  keepMods?: boolean;
}

const pendingFile = () => join(probePaths().runner, 'pending-consent.json');

export function planHash(plan: PlanSummary): string {
  // (the maps written count by their bytes, not by whether this run or an earlier one wrote them)
  const written = (plan.written ?? []).map((g) => ({ group: g.group, files: g.files.map((f) => [f.file, f.size, f.sha256]) }));
  return createHash('sha256').update(JSON.stringify(plan.maps)).update(written.length ? JSON.stringify(written) : '').update(plan.kind).update(plan.keepMods ? 'keep-mods' : 'probe-only').digest('hex').slice(0, 16);
}

export function describe(plan: PlanSummary): string {
  const lines = [
    plan.keepMods
      ? `This run LAUNCHES TIMBERBORN through Steam, with your installed mods (each result records which loaded). It changes none of your settings, and DGM Probe leaves your Mods folder afterwards.`
      : `This run LAUNCHES TIMBERBORN through Steam. Only the DGM Probe mod is on during the run: your other mods are switched off and your settings are put back exactly afterwards.`,
    `${plan.kind === 'smoke' ? 'Smoke run' : 'Full batch'}: ${plan.maps.length} map${plan.maps.length === 1 ? '' : 's'}, about ${plan.estimateMinutes} minutes.`,
  ];
  for (const m of plan.maps) lines.push(`  - ${m.title} (${m.days} game days): ${m.checks.join(', ') || 'screenshots and records only'}`);
  for (const g of plan.written ?? []) {
    const n = g.files.filter((f) => f.status === 'written').length;
    lines.push(`Maps written for this plan by the ${g.group} writer, in ${g.dir} (${n ? `${n} written now, the rest already current` : 'all already current'}):`);
    for (const f of g.files) lines.push(`  - ${f.file}  ${f.size[0]}×${f.size[1]}  ${(f.bytes / 1024).toFixed(0)} KB  sha256 ${f.sha256}`);
  }
  lines.push(plan.keepMods ? `It never runs if Timberborn is already open, and cleans up its logs and saves afterwards.` : `It never runs if Timberborn is already open, and puts back your settings, logs and saves afterwards.`);
  return lines.join('\n');
}

/** Without a code: write a fresh one for this plan and return it (the launch must not happen). */
export function requestConsent(plan: PlanSummary): string {
  const code = randomBytes(4).toString('hex');
  mkdirSync(probePaths().runner, { recursive: true });
  writeFileSync(pendingFile(), JSON.stringify({ code, plan: planHash(plan), at: new Date().toISOString() }, null, 1));
  return code;
}

/** True only if `code` is the one written for exactly this plan; the code is used up either way. */
export function consumeConsent(plan: PlanSummary, code: string): boolean {
  if (!existsSync(pendingFile())) return false;
  const pending = JSON.parse(readFileSync(pendingFile(), 'utf8')) as { code: string; plan: string };
  rmSync(pendingFile());
  return pending.code === code && pending.plan === planHash(plan);
}

/** In a terminal: ask and wait for "yes". Anything else is a no. */
export async function askInTerminal(plan: PlanSummary): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  console.log(describe(plan));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((res) => rl.question('Launch Timberborn now? Type yes to continue: ', res));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}
