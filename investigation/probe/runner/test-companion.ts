// The companion mode's checks without the game: npm --prefix investigation/probe run test:companion
// The same sandbox as test.ts (a temporary Documents folder and probe folder, a throwaway registry key, a stand-in game
// that is a copy of node.exe named FakeTimberborn.exe), with the stand-in following the in-game test's protocol
// (runner/test/fake-companion.cjs). Kyler's own settings, saves and game are never touched.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'dgm-probe-companion-test-'));
const TEST_KEY = 'HKCU\\Software\\DGMProbeTest\\Timberborn';
process.env.DGM_PROBE_HOME = join(sandbox, 'probe');
process.env.DGM_PROBE_DOCUMENTS = join(sandbox, 'Documents');
process.env.DGM_PROBE_REGISTRY_KEY = TEST_KEY;
process.env.DGM_PROBE_UNITY_LOGS = join(sandbox, 'LocalLow');
process.env.DGM_PROBE_GAME_PROCESS = 'FakeTimberborn';
const fakeExe = join(sandbox, 'FakeTimberborn.exe');
copyFileSync(process.execPath, fakeExe);

/* eslint-disable @typescript-eslint/no-require-imports */
const paths = require('./paths') as typeof import('./paths');
const safety = require('./safety') as typeof import('./safety');
const consent = require('./consent') as typeof import('./consent');
const mods = require('./mods') as typeof import('./mods');
const launch = require('./launch') as typeof import('./launch');
const companionM = require('./companion') as typeof import('./companion');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!ok) failures++;
};

async function main(): Promise<void> {
  if (paths.REGISTRY_KEY !== TEST_KEY || !paths.timberbornDocs().startsWith(sandbox) || !paths.probeHome().startsWith(sandbox)) throw new Error('the sandbox is not in place; refusing to run');
  const docs = paths.timberbornDocs();
  mkdirSync(join(docs, 'Mods/SomeMod/version-1.1'), { recursive: true });
  mkdirSync(paths.unityLogDir(), { recursive: true });
  writeFileSync(join(docs, 'Mods/SomeMod/version-1.1/manifest.json'), JSON.stringify({ Id: 'someone.somemod' }));
  execFileSync('reg.exe', ['add', TEST_KEY, '/v', 'KylerSetting_h7', '/t', 'REG_DWORD', '/d', '5', '/f'], { stdio: 'ignore' });

  // the companion mode (companion.ts): the plan, the mods switched on, the install guard, and a stand-in game that
  // follows the in-game test's protocol (ask/answer files, result.json) driven and judged by the runner
  const cvs = companionM.variantsFrom('named,fresh');
  const csum = companionM.companionSummary(cvs, false);
  const ctext = consent.describe(csum);
  check('companion: the plan names each launch, the maps with their sha256, and that it launches Timberborn', /LAUNCHES TIMBERBORN/.test(ctext) && /Companion check: 2 launches/.test(ctext) && ctext.includes('dgm-river-valley-1-2.timber') && ctext.includes('dgm-broken.timber') && /sha256 [0-9a-f]{64}/.test(ctext), ctext.split('\n').slice(0, 3).join(' | '));
  check('companion: its launch code is its own (not the probe plan\'s, and the variants count)', consent.planHash(csum) !== consent.planHash({ ...csum, companion: undefined }) && consent.planHash(csum) !== consent.planHash(companionM.companionSummary(companionM.variantsFrom('named'), false)));
  check('companion: unknown variants refuse', (() => { try { companionM.variantsFrom('named,nope'); return false; } catch { return true; } })());
  mkdirSync(join(docs, 'Mods/DGMCompanion/version-1.1'), { recursive: true });
  writeFileSync(join(docs, 'Mods/DGMCompanion/version-1.1/manifest.json'), JSON.stringify({ Id: mods.COMPANION_MOD_ID }));
  mkdirSync(join(docs, 'Mods/DGMProbe/version-1.1'), { recursive: true });
  writeFileSync(join(docs, 'Mods/DGMProbe/version-1.1/manifest.json'), JSON.stringify({ Id: mods.PROBE_MOD_ID }));
  check('companion: a companion folder the probe did not put there is never overwritten or removed', (() => { try { companionM.installCompanion(); return false; } catch (e) { return /not put there by the probe/.test((e as Error).message); } })() && existsSync(join(docs, 'Mods/DGMCompanion/version-1.1/manifest.json')));
  const both = mods.probeAndCompanionOnly();
  check('companion: DGM Probe and the companion on for the run, every other mod off', both.on.length === 2 && both.on.some((x) => x.includes(mods.COMPANION_MOD_ID)) && both.off.some((x) => x.includes('someone.somemod')), `on ${both.on.join(', ')}; off ${both.off.join(', ')}`);
  rmSync(join(docs, 'Mods/DGMCompanion'), { recursive: true, force: true });
  rmSync(join(docs, 'Mods/DGMProbe'), { recursive: true, force: true });
  const savedLaunch = process.env.DGM_PROBE_LAUNCH;
  process.env.DGM_PROBE_LAUNCH = JSON.stringify([fakeExe, join(__dirname, 'test', 'fake-companion.cjs')]);
  const cwatch = { startSeconds: 30, launchSeconds: 90, log: (l: string) => console.log(`     ${l}`) };
  const good = await companionM.runCompanion('companion-good', cvs, cwatch);
  const goodJudged = companionM.judgeCompanion('companion-good', cvs, good);
  check('companion: the runner drove the stand-in game through both launches, answering its requests', good.length === 2 && good.every((l) => l.outcome === 'finished') && existsSync(join(companionM.variantDir('companion-good', 'named'), 'answer-2.json')), good.map((l) => l.outcome).join(', '));
  check('companion: a passing game is judged passed, and the companion is seen among the loaded mods', goodJudged.passed && good.every((l) => l.loadedMods.length === 2 && l.otherMods.length === 0), JSON.stringify(goodJudged.verdicts.map((v) => v.problems)));
  check('companion: the maps were written into the scratch folder, the look-alike and broken file first, the -2 re-save last', ['Somewhere Else.timber', 'dgm-broken.timber', 'dgm-lake-basin-3.timber', 'dgm-river-valley-1.timber', 'dgm-river-valley-1-2.timber'].every((f) => existsSync(join(companionM.variantDir('companion-good', 'named'), 'maps', f))) && statSync(join(companionM.variantDir('companion-good', 'named'), 'maps', 'dgm-river-valley-1-2.timber')).mtimeMs > statSync(join(companionM.variantDir('companion-good', 'named'), 'maps', 'dgm-river-valley-1.timber')).mtimeMs);
  const verdictOf = async (what: string) => {
    process.env.FAKE_COMPANION = what;
    const ls = await companionM.runCompanion(`companion-${what.replace(/ /g, '-')}`, [cvs[0]], cwatch);
    return companionM.judgeCompanion(`companion-${what.replace(/ /g, '-')}`, [cvs[0]], ls).verdicts[0];
  };
  const vLook = await verdictOf('lookalike');
  check('companion: a click that started the look-alike instead of the newest Dam Good Maps map fails', !vLook.passed && vLook.problems.some((p) => /expected dgm-river-valley-1\.timber/.test(p)), vLook.problems.join('; '));
  const vFaction = await verdictOf('faction');
  check('companion: a click that ignored the remembered faction fails', !vFaction.passed && vFaction.problems.some((p) => /expected IronTeeth/.test(p)), vFaction.problems.join('; '));
  const vReload = await verdictOf('reload');
  check('companion: a reload that did not use the -2 file fails', !vReload.passed && vReload.problems.some((p) => /expected dgm-river-valley-1-2\.timber/.test(p)), vReload.problems.join('; '));
  const vCheck = await verdictOf('check');
  check("companion: a failure the game's own test recorded is reported", !vCheck.passed && vCheck.problems.includes('the game asks for the settlement name (game2)'), vCheck.problems.join('; '));
  delete process.env.FAKE_COMPANION;
  const rep = companionM.writeCompanionReport('companion-good', cvs, good, false);
  check('companion: the report is written in the run\'s folder', rep.passed && existsSync(join(launch.resultsDir('companion-good'), 'companion.json')) && /PASSED/.test(rep.lines.join('\n')));
  if (savedLaunch) process.env.DGM_PROBE_LAUNCH = savedLaunch;
  check('companion: the game is gone afterwards', !safety.isGameRunning());
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    try {
      execFileSync('reg.exe', ['delete', 'HKCU\\Software\\DGMProbeTest', '/f'], { stdio: 'ignore' });
    } catch {
      // not there
    }
    for (const pid of safety.gameProcessIds()) execFileSync('taskkill.exe', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // a file still held
    }
    console.log(failures ? `${failures} FAILED` : 'all passed');
    process.exitCode = failures ? 1 : 0;
  });
