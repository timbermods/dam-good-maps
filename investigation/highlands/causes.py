"""Trace missed water connections and terrain changes on the captured maps, without regenerating."""
from collections import Counter, deque
from pathlib import Path
import json
import math
import sys

HERE = Path(__file__).resolve().parent
phase = sys.argv[1] if len(sys.argv)>1 else 'before'
evidence = []
for file in sorted((HERE / 'local' / phase).glob('*.measure.json')):
    m = json.loads(file.read_text())
    d = json.loads(file.with_name(file.name.replace('.measure', '')).read_text())
    out = m['outcomes'] or d.get('evaluated')
    if out and out.get('met') and m['changed']==0:
        continue
    n = m['size']; h = d['heights']; water = d['water']; c = d['contamination']
    labels = [-1]*len(h); sizes = []; volumes = []
    def neighbors(i):
        x,y = i%n, i//n
        if x: yield i-1
        if x+1<n: yield i+1
        if y: yield i-n
        if y+1<n: yield i+n
    for i in range(len(h)):
        if labels[i]>=0 or water[i]<.05: continue
        q = deque([i]); k = len(sizes); labels[i]=k; total=0; volume=0
        while q:
            j=q.popleft(); total+=1; volume+=water[j]
            for v in neighbors(j):
                if labels[v]<0 and water[v]>=.05: labels[v]=k; q.append(v)
        sizes.append(total)
        volumes.append(volume)
    def nearlabels(x,y):
        found=set()
        for yy in range(max(0,y-1), min(n,y+2)):
            for xx in range(max(0,x-1), min(n,x+2)):
                k=labels[yy*n+xx]
                if k>=0 and c[yy*n+xx]<.5: found.add(k)
        return sorted(found)
    rivers=[]
    for f in d['features']:
        if f['kind']!='river' or f['params']['badwater'] or f['role'] in ('river/startSpring','river/lakeSpring'): continue
        p=f['params']; points=[]
        for a,b in zip(p['path'], p['path'][1:]):
            length=max(1,math.ceil(max(abs(a[0]-b[0]),abs(a[1]-b[1]))))
            for t in range(length):
                x,y=math.floor(a[0]+(b[0]-a[0])*t/length+.5), math.floor(a[1]+(b[1]-a[1])*t/length+.5)
                if 0<=x<n and 0<=y<n and (not points or points[-1]!=(x,y)): points.append((x,y))
        run=longest=0; dry=0
        for x,y in points[2:-2]:
            i=y*n+x
            if water[i]<.05 and all(water[j]<.05 for j in neighbors(i)): run+=1; dry+=1; longest=max(longest,run)
            else: run=0
        ax,ay=p['path'][0]; bx,by=p['path'][-1]
        rivers.append(dict(role=f['role'], entry=p['entry'], exit=p['exit'], start_level=p['bedProfile']['start'], drops=p['bedProfile']['steps'], dry_samples=dry, longest_dry_run=longest, head_systems=nearlabels(math.floor(ax+.5),math.floor(ay+.5)), end_systems=nearlabels(math.floor(bx+.5),math.floor(by+.5)), width=p['width'], flow=p['flow']))
    changed=[]
    if 'shownHeights' in d:
        changed=[i for i,(a,b) in enumerate(zip(d['shownHeights'],h)) if a!=b]
    start=d['start']
    nearstart=sum(abs(i%n-start['x'])<=8 and abs(i//n-start['y'])<=8 for i in changed) if start else 0
    evidence.append(dict(size=n, seed=m['seed'], planned=m['planned'], summary=out['summary'] if out else 'no accepted map', dominant_system=max(range(len(volumes)),key=volumes.__getitem__) if volumes else None, systems=[dict(label=k,tiles=t,volume=volumes[k]) for k,t in enumerate(sizes)], water_surfaces=dict(Counter(round(h[i]+water[i],1) for i in range(len(h)) if water[i]>=.05).most_common(12)), rivers=rivers, changed=m['changed'], captured_changed=len(changed) if 'shownHeights' in d else None, changed_near_start=nearstart, badwater_features=[f['role'] for f in d['features'] if f['kind']=='setPiece' and f['params']['kind']=='badwaterBasin']))
(HERE/'local'/phase/'causes.json').write_text(json.dumps(evidence, indent=2))
for e in evidence:
    if 'water:' in e['summary']:
        print(e['size'], e['seed'], e['summary'])
        for r in e['rivers']:
            print(' ', r['role'], 'dry run',r['longest_dry_run'], 'head/end systems',r['head_systems'],r['end_systems'], 'exit',r['exit'])
