import json
from pathlib import Path
root=Path('investigation/river-valley-sheets')
sets={mode:json.loads((root/'local'/mode/'measures.json').read_text()) for mode in ['dev','round1','round2']}
assert all(len(ms)==30 for ms in sets.values())
keys=['passed','promise','readable','standout','attempts','shown','changed','exportedChanged','wet','sheet','straight','walk']
rows=[]
for seed in range(1,31):
 row={'seed':seed}
 for mode,ms in sets.items():
  m=next(m for m in ms if m['seed']==seed)
  row[mode]={k:m[k] for k in keys}
 rows.append(row)
summary={mode:{'passed':sum(m['passed'] for m in ms),'promise':sum(m['promise'] for m in ms),'readable':sum(m['readable'] for m in ms),'allThree':sum(m['promise'] and m['readable'] and bool(m['standout']) for m in ms),'firstLandUnchanged':sum(m['shown']==1 and m['changed']==0 for m in ms),'noExportTerrainChanges':sum(m['exportedChanged']==0 for m in ms),'promiseFailures':[m['seed'] for m in ms if not m['promise']],'readableFailures':[m['seed'] for m in ms if not m['readable']]} for mode,ms in sets.items()}
a=json.loads((root/'local/genomes-dev.json').read_text());b=json.loads((root/'local/genomes-round2.json').read_text());assert a==b
summary['otherThemeGenomes']={'seeds':'1-30','attempts':'0-8','size':128,'preset':'Normal','hashes':a}
for seed in [21,22,23]:
 a=json.loads((root/f'local/round1/{seed}.json').read_text());b=json.loads((root/f'local/round2/{seed}.json').read_text())
 assert all(a[k]==b[k] for k in ['heights','water','contamination','features','start']), f'Character/flood control changed: {seed}'
summary['unchangedRound1Fields']=[21,22,23]
summary['visualSheetJudgment']={'dev':[5,12,19,21,22,26],'round1':[19,24],'round2':[19,24]}
(root/'measures-r2.json').write_text(json.dumps({'summary':summary,'maps':rows},indent=2)+'\n')
print(json.dumps(summary,indent=2))
