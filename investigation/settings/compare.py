"""Paired first-map outcomes against the committed, unchanged M9b base (seeds 1–5)."""
import csv,gzip,json,math,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parent
THEMES=['any','riverValley','canyon','highlands','lakeBasin','delta','islands']
def pct(a,p):return sorted(a)[min(len(a)-1,math.ceil(p*len(a))-1)]
def times(rows,field,cpu=False):
 values=[r['cpu'][field] if cpu else (r['landMs'] if field=='land' else r['timings']['firstWater']) for r in rows]
 values=[v for v in values if v>=0]
 return [round(pct(values,p)) if values else '' for p in [.5,.9]]
def rates(rows,baseline=False):
 def o(r):return r.get('outcomes') or {}
 return [sum(bool(r.get('ok' if baseline else 'passed')) for r in rows),
         sum(bool(o(r).get('water') if baseline else o(r).get('story',{}).get('readable')) for r in rows),
         sum(bool(o(r).get('promise')) for r in rows),sum(bool(o(r).get('standout')) for r in rows),sum(bool(o(r).get('met')) for r in rows)]
summary=[];pairs=[]
for size in [96,128,256]:
 path=ROOT.parent/'m9b'/'baseline'/f'13d1f1a2-{size}.jsonl.gz'
 with gzip.open(path,'rt')as f:baseline=[json.loads(l)for l in f if l.strip()]
 baseline=[r for r in baseline if r['seed'] in range(1,6)]
 for variant in ['verticality','lakes']:
  folder=ROOT/'local'/f'r2-default-{variant}-{size}'
  rows=json.loads((folder/'summary.json').read_text())
  if len(rows)!=35:raise RuntimeError(f'{folder}: {len(rows)}/35 maps')
  expected=json.loads((ROOT/'local'/f'{variant}-build.json').read_text())
  if any(r.get('build')!=expected for r in rows):raise RuntimeError(f'{folder}: stale or mixed generator builds')
  for theme in THEMES:
   a=sorted((r for r in baseline if r['theme']==theme),key=lambda r:r['seed'])
   b=sorted((r for r in rows if r['theme']==theme),key=lambda r:r['seed'])
   if len(a)!=5 or len(b)!=5:raise RuntimeError('Unmatched seed group')
   ra,rb=rates(a,True),rates(b)
   gained=sum(not bool((x.get('outcomes')or{}).get('met')) and bool((y.get('outcomes')or{}).get('met')) for x,y in zip(a,b))
   lost=sum(bool((x.get('outcomes')or{}).get('met')) and not bool((y.get('outcomes')or{}).get('met')) for x,y in zip(a,b))
   raw=[r.get('timings',{}).get('final',r['ms']) for r in b]
   cp=[r['cpu']['final'] for r in b]
   summary.append([variant,size,theme,5,*ra,*rb,gained,lost,round(pct(raw,.5)),round(pct(raw,.9)),round(pct(cp,.5)),round(pct(cp,.9)),*times(b,'land'),*times(b,'water'),*times(b,'land',True),*times(b,'water',True)])
   for x,y in zip(a,b):
    pairs.append({'variant':variant,'size':size,'theme':theme,'seed':y['seed'],'baseValid':x['ok'],'valid':y['passed'],'baseAllThree':bool((x.get('outcomes')or{}).get('met')),'allThree':bool((y.get('outcomes')or{}).get('met')),'baseOutcomes':x.get('outcomes'),'outcomes':y.get('outcomes'),'changed':y.get('landChanged'),'landCalls':y.get('landCalls')})
with (ROOT/'OUTCOMES.csv').open('w',newline='')as f:
 w=csv.writer(f);w.writerow(['variant','size','theme','maps','baseline_valid','baseline_water','baseline_promise','baseline_standout','baseline_all_three','valid','water','promise','standout','all_three','gained','lost','median_raw_final_ms','p90_raw_final_ms','median_cpu_estimated_final_ms','p90_cpu_estimated_final_ms','median_raw_land_ms','p90_raw_land_ms','median_raw_first_water_ms','p90_raw_first_water_ms','median_cpu_estimated_land_ms','p90_cpu_estimated_land_ms','median_cpu_estimated_first_water_ms','p90_cpu_estimated_first_water_ms']);w.writerows(summary)
(ROOT/'local'/'r2-outcome-pairs.json').write_text(json.dumps(pairs,indent=2))
result={'maps':len(pairs),'valid':sum(p['valid']for p in pairs),'baseAllThree':sum(p['baseAllThree']for p in pairs),'allThree':sum(p['allThree']for p in pairs),'newAbsoluteFailures':[p for p in pairs if p['baseValid'] and not p['valid']],'regressedGroups':[r[:3]+[r[8],r[13]]for r in summary if r[13]<r[8]],'outcomeRegressions':[{'variant':r[0],'size':r[1],'theme':r[2],'outcome':key,'baseline':r[5+i],'prototype':r[10+i]} for r in summary for i,key in enumerate(['water','promise','standout','all_three']) if r[10+i]<r[5+i]]}
(ROOT/'local'/'r2-outcome-summary.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
