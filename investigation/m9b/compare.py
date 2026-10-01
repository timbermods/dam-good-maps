# Two measure runs side by side: the maps failing an absolute in each, the maps whose land changed,
# and the maps that gained or lost "all three outcomes".
# Usage: python investigation/m9b/compare.py <before> <after>     (e.g. cc161b3a my-run)
import sys
from runs import SIZES, met, rows

a_name, b_name = sys.argv[1], sys.argv[2]
for s in SIZES:
    a = {(r['theme'], r['seed']): r for r in rows(a_name, s)}
    b = {(r['theme'], r['seed']): r for r in rows(b_name, s)}
    both = [k for k in b if k in a]
    print(f'== {s}: {len(both)} maps in both')
    for name, run in ((a_name, a), (b_name, b)):
        print(f'   {name}: failing', [(k, r.get('failedChecks')) for k, r in run.items() if not r['ok']], '| all three', sum(1 for r in run.values() if met(r)))
    print('   lands changed:', [k for k in both if a[k]['heights'] != b[k]['heights']])
    print('   gained all three:', [k for k in both if met(b[k]) and not met(a[k])])
    print('   lost all three:', [k for k in both if met(a[k]) and not met(b[k])])
