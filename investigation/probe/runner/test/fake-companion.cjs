// A stand-in for Timberborn with the companion mod's in-game test, for the runner's tests: it follows the same
// protocol as mods/companion/src/Game/InGameTest.cs (the scratch folder from -dgmcompanionTest; ask-N.json /
// answer-N.json; result.json at the end) and reports what a passing game would, or, with FAKE_COMPANION=<what>,
// one thing wrong, so the runner's judging can be checked.
const fs = require('node:fs');
const path = require('node:path');

const at = process.argv.indexOf('-dgmcompanionTest');
if (at < 0) process.exit(4);
const dir = process.argv[at + 1];
const maps = path.join(dir, 'maps');
const home = path.join(dir, 'home');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrong = process.env.FAKE_COMPANION || '';
const facts = {};
const failures = [];

// the log the real game writes, with the mods it loaded
fs.writeFileSync(path.join(process.env.DGM_PROBE_UNITY_LOGS, 'Player.log'), ['fake game', 'Modded: true, official', '- DGM Probe (v0.3.0)', '- Dam Good Maps Companion (v0.1.0)', ''].join('\n'));

async function ask(what) {
  const n = fs.readdirSync(dir).filter((f) => /^ask-\d+\.json$/.test(f)).length + 1;
  fs.writeFileSync(path.join(dir, `ask-${n}.json.tmp`), JSON.stringify({ seq: n, what, phase: 'x' }));
  fs.renameSync(path.join(dir, `ask-${n}.json.tmp`), path.join(dir, `ask-${n}.json`));
  const answer = path.join(dir, `answer-${n}.json`);
  for (let k = 0; k < 100 && !fs.existsSync(answer); k++) await sleep(100);
  if (!fs.existsSync(answer)) {
    failures.push(`no answer to ${what}`);
    return {};
  }
  return JSON.parse(fs.readFileSync(answer, 'utf8'));
}

(async () => {
  await sleep(300);
  facts.userMapsDirectory = path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Maps');
  facts.mapsFolder = maps;
  // nothing in the folder is a Dam Good Maps map yet: no entry (it reads the folder only to say what it holds)
  facts.mapsBefore = fs.readdirSync(maps).join(', ');
  const a1 = await ask('maps');
  const files = fs.readdirSync(maps);
  const newest = files.filter((f) => /^dgm-.*\.timber$/.test(f) && f !== 'dgm-broken.timber').map((f) => ({ f, t: fs.statSync(path.join(maps, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
  facts.expectedMap = a1.newest;
  facts.startedMap = path.join(maps, wrong === 'lookalike' ? 'Somewhere Else.timber' : newest);
  const settings = fs.existsSync(path.join(home, 'settings.json')) ? JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')) : {};
  facts.startedFaction = wrong === 'faction' ? 'Folktails' : settings.faction || 'Folktails';
  facts.startedMode = settings.mode || (settings.customMode ? 'custom' : 'Normal');
  facts.options = 'factions: Folktails, IronTeeth; modes: Easy, Normal, Hard';
  facts['game1.faction'] = facts.startedFaction;
  facts['game1.mode'] = facts.startedMode;
  if (wrong !== 'nothing remembered') fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ ...settings, faction: facts.startedFaction }));
  const a2 = await ask('resave');
  const second = path.join(maps, `${a2.resaved}.timber`);
  if (!fs.existsSync(second)) failures.push('the -2 file is not in the Maps folder');
  facts.resaved = a2.resaved;
  facts['game2.map'] = wrong === 'reload' ? facts.startedMap : second;
  if (wrong === 'check') failures.push('the game asks for the settlement name (game2)');
  const result = { passed: failures.length === 0, failures, facts };
  fs.writeFileSync(path.join(dir, 'result.json.tmp'), JSON.stringify(result));
  fs.renameSync(path.join(dir, 'result.json.tmp'), path.join(dir, 'result.json'));
  process.exit(0);
})();
