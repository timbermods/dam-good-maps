"""Small, regenerable shared-cost evidence; raw observations stay ignored."""
import json
from collections import Counter
from pathlib import Path
here=Path(__file__).parent
local=here/'local'
events=json.loads((local/'round2-cost-7.json').read_text())
cut=next(i for i,e in enumerate(events) if e['name']=='onLand')
before=events[:cut]
rows=[e for e in before if e['name']=='droughtStorage']
counts=Counter(e['input'] for e in rows)
observed=json.loads((local/'round2-cost/256-7.json').read_text())
canonical=json.loads((local/'round2-prototype/256-7.json').read_text())
assert observed['sha256']==canonical['sha256'], 'Observer changed the map'
summary={
 'core':'e292cefe30469033a922650f0455f87297c051d5', 'size':256,'seed':7,
 'observerMatchesCanonicalBytes':True,'phaseCpu':observed['phaseCpu'],
 'beforeFirstLand':{
   name:{'calls':sum(e['name']==name for e in before),
         'cpuMs':sum(e['cpuMs'] for e in before if e['name']==name)}
   for name in sorted({e['name'] for e in before})},
 'droughtStorageBeforeLand':{
   'calls':len(rows),'uniqueCompleteInputs':len(counts),
   'groups':[{'sha256':key,'calls':n,'cpuMs':sum(e['cpuMs'] for e in rows if e['input']==key)} for key,n in sorted(counts.items())],
   'inputFields':['W','H','days','emitters','floor','dam','depth'],
 },
 'interpretation':'Repeated analytic drought inputs are a shared reuse opportunity; measured cost does not explain or resolve the whole speed gap. PickStart calls serve distinct prepared starts and must preserve their results.',
 'regeneration':'README.md: Shared-cost observation',
}
(here/'round2-shared-evidence.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
