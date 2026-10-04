import json
from pathlib import Path
root=Path('investigation/river-valley-sheets')
dev=json.loads((root/'local/dev/measures.json').read_text());after=json.loads((root/'local/after/measures.json').read_text())
assert len(dev)==len(after)==30
rows=[]
for a,b in zip(dev,after):
 assert a['seed']==b['seed']
 rows.append({k:v for k,v in {'seed':a['seed'],'dev':{k:a[k] for k in ['passed','promise','readable','standout','attempts','shown','changed','exportedChanged','wet','sheet','straight','walk']},'after':{k:b[k] for k in ['passed','promise','readable','standout','attempts','shown','changed','exportedChanged','wet','sheet','straight','walk']}}.items()})
summary={mode:{'passed':sum(m['passed'] for m in ms),'promise':sum(m['promise'] for m in ms),'readable':sum(m['readable'] for m in ms),'firstLandUnchanged':sum(m['shown']==1 and m['changed']==0 for m in ms),'noExportTerrainChanges':sum(m['exportedChanged']==0 for m in ms),'promiseFailures':[m['seed'] for m in ms if not m['promise']],'readableFailures':[m['seed'] for m in ms if not m['readable']]} for mode,ms in [('dev',dev),('after',after)]}
a=json.loads((root/'local/genomes-dev.json').read_text());b=json.loads((root/'local/genomes-after.json').read_text());assert a==b
summary['otherThemeGenomes']={'seeds':'1-30','attempts':'0-8','size':128,'preset':'Normal','hashes':a}
(root/'measures.json').write_text(json.dumps({'summary':summary,'maps':rows},indent=2)+'\n')
print(json.dumps(summary,indent=2))
