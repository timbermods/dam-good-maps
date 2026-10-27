"""Per theme: the first maps meeting all three outcomes, the misses and what they miss, attempts and
their reasons, and the lands changed against another run.
    python investigation/canyon-highlands-96/report.py <run> [<against>] [size]"""
import collections, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def rows(name, size):
    p = os.path.join(HERE, 'local', 'measures', f'{name}-{size}.jsonl')
    return [json.loads(l) for l in open(p, encoding='utf-8')]


def met(r):
    return bool(r['ok'] and (r.get('outcomes') or {}).get('met'))


name = sys.argv[1]
against = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].isdigit() else None
size = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 96
lo, hi = (int(x) for x in os.environ.get('SEEDS', '1-20').split('-'))
rs = {(r['theme'], r['seed']): r for r in rows(name, size)}
vs = {(r['theme'], r['seed']): r for r in rows(against, size)} if against else {}
for t in ('canyon', 'highlands'):
    part = sorted([r for k, r in rs.items() if k[0] == t and lo <= k[1] <= hi], key=lambda r: r['seed'])
    if not part:
        continue
    ok = [r['seed'] for r in part if met(r)]
    miss = []
    for r in part:
        if r['seed'] in ok:
            continue
        o = r.get('outcomes') or {}
        tag = ('' if r['ok'] else 'A') + ('' if o.get('promise') else 'P') + ('' if o.get('water') else 'W') + ('' if o.get('standout') else 'S')
        miss.append(f"{r['seed']}{tag}")
    fails = collections.Counter(f for r in part for f in r['failures'])
    att = sum(r['attempts'] for r in part)
    line = f"{t} {size}²: all three {len(ok)}/{len(part)}; misses {' '.join(miss)}; attempts {att}; no start {fails['no start']}, promise (planned) {fails['promise (planned)']}, water story (planned) {fails['water story (planned)']}"
    if vs:
        both = [r['seed'] for r in part if (t, r['seed']) in vs]
        changed = [s for s in both if vs[(t, s)]['heights'] != rs[(t, s)]['heights']]
        gained = [s for s in both if met(rs[(t, s)]) and not met(vs[(t, s)])]
        lost = [s for s in both if met(vs[(t, s)]) and not met(rs[(t, s)])]
        line += f"; vs {against}: {sum(1 for s in both if met(vs[(t, s)]))} → {sum(1 for s in both if met(rs[(t, s)]))}, gained {gained}, lost {lost}, lands changed {len(changed)} of {len(both)}"
    print(line)
    failing = [(r['seed'], r.get('failedChecks')) for r in part if not r['ok']]
    if failing:
        print('   failing an absolute:', failing)
