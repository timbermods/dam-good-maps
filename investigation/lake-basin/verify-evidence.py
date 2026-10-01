"""Export compact seed-37 verification without terrain or raw repair arrays."""
import json
from pathlib import Path
here=Path(__file__).parent
rows=json.loads((here/'local/round2-verify.json').read_text())
assert len(rows)==6
summary=[]
for size in [96,128,256]:
    a=[r for r in rows if r['size']==size]
    assert len(a)==2 and a[0]['sha256']==a[1]['sha256']
    summary.append({'size':size,'seed':37,'repeats':2,'deterministic':True,
      'sha256':a[0]['sha256'],'absolutesPass':all(r['passed'] for r in a),
      'settled':all(r['settled'] for r in a),'changedTiles':a[0]['changed'],
      'fixes':a[0]['fixes'],'outletWearTiles':len((a[0].get('worn') or {}).get('cut',[]))})
(here/'round2-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
