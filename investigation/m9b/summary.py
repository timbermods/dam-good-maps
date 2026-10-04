# One measure file after another: the maps that failed and why, the fixes used, the times, all three
# outcomes per theme, tiles changed after the land was shown, pads, worn ways out, settle ticks.
# Usage: python investigation/m9b/summary.py investigation/m9b/local/measures/<name>-<size>.jsonl ...
import json,sys,collections,statistics as st
def q(v,p):
    v=sorted(v); 
    if not v: return float('nan')
    k=(len(v)-1)*p; f=int(k); c=min(f+1,len(v)-1); return v[f]+(v[c]-v[f])*(k-f)
for f in sys.argv[1:]:
    rows=[json.loads(l) for l in (__import__('gzip').open(f,'rt',encoding='utf-8') if f.endswith('.gz') else open(f,encoding='utf-8'))]
    n=len(rows)
    fail=[r for r in rows if not r['ok']]
    shown2=[r for r in rows if (r.get('shown') or 0)>1]
    fx=collections.Counter(x for r in rows for x in (r.get('fixes') or []))
    fxmaps=sum(1 for r in rows if r.get('fixes'))
    print(f'== {f}: {n} maps; not passed {len(fail)}; shown more than once {len(shown2)}; maps with fixes {fxmaps}: {dict(fx)}')
    for r in fail: print('   FAIL',r['theme'],r['seed'],r.get('failedChecks'),'att',r['attempts'],'|',' ; '.join(s['why'][:28] for s in r['spent'][-4:]))
    land=[r['ms']['land'] for r in rows if r['ms']['land']>=0]; water=[r['ms']['water'] for r in rows if r['ms']['water']>=0]; fin=[r['ms']['final'] for r in rows]
    cl=[r['cpu']['land'] for r in rows if r['ms']['land']>=0]; cw=[r['cpu']['water'] for r in rows if r['ms']['water']>=0]; cf=[r['cpu']['final'] for r in rows]
    print(f'   wall land {q(land,.5)/1000:.1f}/{q(land,.9)/1000:.1f} s, water {q(water,.5)/1000:.1f}/{q(water,.9)/1000:.1f}, map {q(fin,.5)/1000:.1f}/{q(fin,.9)/1000:.1f}; cpu-scaled land {q(cl,.5)/1000:.1f}/{q(cl,.9)/1000:.1f}, water {q(cw,.5)/1000:.1f}/{q(cw,.9)/1000:.1f}, map {q(cf,.5)/1000:.1f}/{q(cf,.9)/1000:.1f}')
    by=collections.defaultdict(list)
    for r in rows: by[r['theme']].append(r)
    tot=0
    for t,rs in by.items():
        m=sum(1 for r in rs if r['ok'] and r['outcomes'] and r['outcomes']['met']); tot+=m
        pm=sum(1 for r in rs if r['ok'] and r['outcomes'] and not r['outcomes']['promise']); wm=sum(1 for r in rs if r['ok'] and r['outcomes'] and not r['outcomes']['water'])
        print(f'   {t:12s} all three {m}/{len(rs)} (promise missed {pm}, water missed {wm})')
    print('   total all three',tot,'/',n)
    ch=[r.get('changed',-1) for r in rows if r['ok']]
    print('   tiles changed from the shown land (passed maps): median',q(ch,.5),'max',max(ch) if ch else None)
    pads=[r for r in rows if r.get('pads')]
    print('   mine-site pads:', len(pads), 'maps:', ', '.join(f"{r['theme']} {r['seed']} {r['pads']}" for r in pads))
    worn=[r for r in rows if r.get('worn')]
    print('   worn way out (b):', len(worn), 'maps:', ', '.join(f"{r['theme']} {r['seed']} {r['worn']['cut']} tiles w{r['worn']['width']} shape {r['worn']['shape']}" for r in worn))
    st=[r.get('settleTicks') for r in rows if r.get('settleTicks') is not None]
    if st: print('   final settle ticks: over 4 days (3072)', sum(1 for t in st if t>3072), 'of', len(st), '; max', max(st))
