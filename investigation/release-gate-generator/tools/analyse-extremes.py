# Do the off/none/count settings hold in the extremes rows? Prints each breach.
import json, collections, sys
rows = [json.loads(l) for l in open('investigation/release-gate-generator/local/extremes-96.jsonl', encoding='utf8')]
print(len(rows), 'rows;', sum(1 for r in rows if r.get('error')), 'errors;', sum(1 for r in rows if r.get('passed') is False), 'failed')
by = collections.defaultdict(list)
for r in rows: by[r['frag'].split('&', 3)[3] if r['frag'].count('&') >= 3 else ''].append(r)
def t(r, k): return (r.get('templates') or {}).get(k, 0)
checks = {
  'rc=0': lambda r: sum(t(r, k) for k in ('SmallRelic', 'MediumRelic', 'LargeRelic')) == 0,
  'gt=0': lambda r: t(r, 'GeothermalField') == 0,
  'tb=0': lambda r: t(r, 'Thorns') == 0,
  'uc=1': lambda r: t(r, 'UnstableCore') > 0,
  'ms=4': lambda r: t(r, 'UndergroundRuins') == 4,
  'bw=0': lambda r: t(r, 'BadwaterSource') == 0,
  'so=n': lambda r: t(r, 'WaterSource') + t(r, 'BadwaterSource') == 0,
  'rv=0': lambda r: r.get('edgeRivers') == 0,
  'rv=3': lambda r: r.get('edgeRivers') == 3,
  'lk=0': lambda r: r.get('lakeFeatures') == 0,
  'wf=0': lambda r: (r.get('hydro') or {}).get('falls') == 0,
  'ht=10': lambda r: r.get('top', 99) <= 10,
  'vt=100&ht=10': lambda r: r.get('top', 99) <= 10,
}
for extra, rs in by.items():
    bad = [r for r in rs if r.get('error') or r.get('passed') is False]
    odd = [r for r in rs if not r.get('error') and (r.get('unfed', {}).get('count') or r.get('waterMismatch') or r.get('revalidateDiff') or r.get('shownDiff') not in (0, None) or r.get('exportSame') is False or r.get('reopenSame') is False or r.get('top', 0) > r.get('ht', 99))]
    chk = checks.get(extra)
    broke = [r for r in rs if chk and 'templates' in r and not chk(r)] if chk else []
    missing = [r for r in rs if chk and 'templates' not in r and not r.get('error')]
    line = f"{extra:38s} n={len(rs):2d} failed={[(r['theme'], r['seed'], r.get('attempts')) for r in bad]}"
    if odd: line += f" odd={[(r['theme'], r['seed']) for r in odd]}"
    if broke: line += f" SETTING NOT HONOURED={[(r['theme'], r['seed'], r.get('templates', {}).get('UndergroundRuins'), r.get('edgeRivers'), r.get('lakeFeatures'), (r.get('hydro') or {}).get('falls'), r.get('top')) for r in broke]}"
    if missing: line += f" (no template counts on {len(missing)})"
    print(line)
