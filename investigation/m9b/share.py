# Per theme and size: first maps meeting all three outcomes (n/20 over seeds 1-20) and the outcome
# missed most. Usage: python investigation/m9b/share.py <name>
import sys
from runs import SIZES, met, rows

tag = sys.argv[1]
themes = ['any', 'riverValley', 'canyon', 'highlands', 'lakeBasin', 'delta', 'islands']
names = {'any': 'Any', 'riverValley': 'River Valley', 'canyon': 'Canyon', 'highlands': 'Highlands', 'lakeBasin': 'Lake Basin', 'delta': 'Delta', 'islands': 'Islands'}
res = {}
for s in SIZES:
    rs = [r for r in rows(tag, s) if 1 <= r['seed'] <= 20]
    tot = 0
    for t in themes:
        part = [r for r in rs if r['theme'] == t]
        n = sum(1 for r in part if met(r))
        miss = {'promise': 0, 'water': 0, 'standout': 0, 'absolute': 0}
        for r in part:
            o = r.get('outcomes')
            if not r['ok'] or not o:
                miss['absolute'] += 1
                continue
            for k in ('promise', 'water', 'standout'):
                if not o.get(k):
                    miss[k] += 1
        top = max(miss, key=lambda k: miss[k])
        res[(t, s)] = (n, len(part), top if miss[top] else '-', miss[top])
        tot += n
    res[('all', s)] = tot
print('| Theme | 96 | 128 | 256 |')
print('|---|---|---|---|')
for t in themes:
    print(f'| {names[t]} | ' + ' | '.join('%d/%d, %s (%d)' % res[(t, s)] for s in SIZES) + ' |')
print('| All | ' + ' | '.join(f"{res[('all', s)]}/140" for s in SIZES) + ' |')
