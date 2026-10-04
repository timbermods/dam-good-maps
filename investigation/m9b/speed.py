# Summary of measures.ts's output for D329's measures: time to the map (an editable map: the first
# candidate that passes), the share of first maps meeting all three outcomes, and where failed
# attempts spend their time. python investigation/m9b/speed.py <file.jsonl> [...]
import json, sys, collections
def med(v): v = sorted(v); return v[len(v) // 2] if v else float('nan')
def p90(v): v = sorted(v); return v[min(len(v) - 1, int(0.9 * len(v)))] if v else float('nan')
for f in sys.argv[1:]:
    ms = [json.loads(l) for l in open(f) if l.startswith('{') and 'error' not in l]
    print(f'== {f}: {len(ms)} maps, {sum(m["ok"] for m in ms)} pass')
    themes = sorted(set(m['theme'] for m in ms), key=lambda t: ['any', 'riverValley', 'canyon', 'highlands', 'lakeBasin', 'delta', 'islands'].index(t))
    for t in themes + ['ALL']:
        a = [m for m in ms if t == 'ALL' or m['theme'] == t]
        o = [m for m in a if m.get('outcomes')]
        tt = [m['ms']['final'] / 1000 for m in a]
        land = [m['ms']['land'] / 1000 for m in a if m['ms'].get('land', -1) >= 0]
        water = [m['ms']['water'] / 1000 for m in a if m['ms'].get('water', -1) >= 0]
        lw = f' | land s {med(land):.1f}/{p90(land):.1f}, settled water s {med(water):.1f}/{p90(water):.1f}' if land else ''
        cl = [m['cpu']['land'] / 1000 for m in a if 'cpu' in m and m['cpu']['land'] >= 0]
        cw = [m['cpu']['water'] / 1000 for m in a if 'cpu' in m and m['cpu']['water'] >= 0]
        cf = [m['cpu']['final'] / 1000 for m in a if 'cpu' in m]
        if cl: lw += f' | CPU-scaled land {med(cl):.1f}/{p90(cl):.1f}, water {med(cw):.1f}/{p90(cw):.1f}, map {med(cf):.1f}/{p90(cf):.1f}'
        swapped = sum(1 for m in a if m.get('lands', 1) > 1)
        lw += f' | land swapped {swapped}/{len(a)}'
        print(f'  {t:12s} all three {sum(m["outcomes"]["met"] for m in o)}/{len(o)} (promise {sum(m["outcomes"]["promise"] for m in o)}, water {sum(m["outcomes"]["water"] for m in o)}, standout {sum(m["outcomes"]["standout"] for m in o)}){lw} | to the map s: median {med(tt):.1f}, p90 {p90(tt):.1f}, max {max(tt):.1f} | first attempt {sum(1 for m in a if m["attempts"] == 1)}/{len(a)}')
    spent = collections.defaultdict(lambda: [0, 0.0])
    for m in ms:
        for s in m.get('spent', []):
            k = s['why']
            spent[k][0] += 1
            spent[k][1] += max(0, s['ms']) / 1000
    total = sum(v[1] for v in spent.values())
    alltime = sum(m['ms']['final'] for m in ms) / 1000
    print(f'  failed attempts: {sum(v[0] for v in spent.values())}, {total:.0f} s of {alltime:.0f} s in all')
    for k, (n, s) in sorted(spent.items(), key=lambda kv: -kv[1][1])[:10]:
        print(f'    {s:6.0f} s  {n:3d}x  {k}')
