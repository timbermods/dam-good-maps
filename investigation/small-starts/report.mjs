// Render the short report from the verified complete comparison.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const s = JSON.parse(readFileSync(resolve(here, 'summary.json'), 'utf8'));
const sizes = [96, 128, 256];
const names = { any: 'Any', riverValley: 'River Valley', canyon: 'Canyon', highlands: 'Highlands', lakeBasin: 'Lake Basin', delta: 'Delta', islands: 'Islands' };
const table = Object.entries(names).map(([t, name]) => `| ${name} | ${sizes.map(size => {
  const r = s.sizes[size].themes[t]['40'];
  return `${r.before} → ${r.after}`;
}).join(' | ')} |`).join('\n');
const count = f => sizes.map(size => f(s.sizes[size])).join(' / ');
const losses = sizes.flatMap(size => s.sizes[size].lost.map(map => `${size}² ${map}`));
if (losses.length) throw Error(`all-three regressions need investigation: ${losses.join(', ')}`);
writeFileSync(resolve(here, 'REPORT.md'), `# The 96² start class

Source: feature/m9b at e292cefe; investigation-only PR. M9b adopts [adoption.patch](adoption.patch).

Settled water split the prepared start's land; the fallback had no reachable mine pair.
Room checks also disagreed with placement: ring-corner/centre distances replaced the nearest
5×5 footprint distance, and the settled room mask omitted lake beds, border and square water margin.

The patch shares those rules, retains prepared pads/hollows and cached settles privately, and
shows land after the actual settled start reaches its placed pair. Exhausted hidden land may
redraw. Item 47, bands, pad limits and shaping rules stay unchanged. A discarded early geometric
gate rejected usable land and introduced a Canyon 128² seed 9 failure.

Every theme, default settings, seeds 1–40, sizes 96² / 128² / 256²: **840 maps before and 840 after**.
Blocking failures: **${count(r => r.failures.before.length)} → ${count(r => r.failures.after.length)}**.
Any 96² seed 31 and Islands 96² seed 4 now pass with two reachable mine sites.
All-three totals: **${count(r => r.met.before)} → ${count(r => r.met.after)}** of 280 per size;
no all-three pass is lost. Every final map shows land once and changes zero terrain tiles afterward.

All three outcomes, out of 40 per theme (before → after):

| Theme | 96² | 128² | 256² |
|---|---:|---:|---:|
${table}

The two-thirds audit uses seeds 1–20: Canyon 96² stays **11/20 (55%)**, Highlands **9/20 (45%)**.
Canyon still misses promise on 5 maps and water on 5; Highlands misses promise on 8 and water
on 6 (overlap counts twice). This fix does not explain their remaining outcome deficit.

Tradeoff: first land waits for settle and mine placement; an ordinary pass adds no settle.
Diagnostic timings do not support a speed comparison.

Validation: full source typecheck, 17 focused tests, strict patch application, both complete sweeps.
[INTEGRATION.md](INTEGRATION.md) gives regeneration commands (roughly 1–2 hours).
Large results stay ignored in local/. [summary.json](summary.json) records counts and changed maps.
`);
