"""Summarize the entire requested sweep, retaining failures and step reversals."""
import json, math, heapq, statistics, sys, csv
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
import os
PREFIX=os.environ.get('SETTINGS_SWEEP_PREFIX','sweep')
THEMES=['any','riverValley','canyon','highlands','lakeBasin','delta','islands']
VALUES=[0,25,50,75,100]
def standing(m):
 h=m['heights']; wet=m['water']; c=m['contamination']; n=128
 spill=[math.inf]*len(h); heap=[]
 for y in range(n):
  for x in range(n):
   i=y*n+x
   if x in (0,n-1) or y in (0,n-1): spill[i]=h[i];heapq.heappush(heap,(h[i],i))
 while heap:
  level,i=heapq.heappop(heap);x=i%n;y=i//n
  for j in ([i-1] if x else [])+([i+1] if x<n-1 else [])+([i-n] if y else [])+([i+n] if y<n-1 else []):
   if spill[j]==math.inf:spill[j]=max(level,h[j]);heapq.heappush(heap,(spill[j],j))
 seen=set();basins=[]
 for i in range(len(h)):
  if i in seen or spill[i]<=h[i]:continue
  q=[i];seen.add(i)
  for a in q:
   x=a%n;y=a//n
   for j in ([a-1] if x else [])+([a+1] if x<n-1 else [])+([a-n] if y else [])+([a+n] if y<n-1 else []):
    if j not in seen and spill[j]>h[j]:seen.add(j);q.append(j)
  if len(q)>=20:
   w=sum(wet[j]>=.1 and c[j]<.3 for j in q)
   basins.append({'area':len(q),'wet':w,'fill':w/len(q),'volume':sum(wet[j] for j in q if c[j]<.3)})
 return sorted(basins,key=lambda b:-b['area'])
def pct(a,p):return sorted(a)[min(len(a)-1,math.ceil(p*len(a))-1)]
data=[]
for control in ['verticality','lakes']:
 folder=ROOT/'local'/f'{PREFIX}-{control}'
 rows=[]
 for theme in THEMES:
  for seed in range(1,6):
   for value in VALUES:
    ident=f'{control}-{theme}-{seed}-{value}';path=folder/f'{ident}.json'
    if not path.exists():continue
    r=json.loads(path.read_text());m=json.loads((folder/f'{ident}.map.json').read_text());bs=standing(m)
    r['control']=control;r['value']=value;r['standingTiles']=sum(b['wet'] for b in bs)
    r['standingBasins']=sum(b['fill']>=.8 for b in bs);r['basinWater']=bs
    rows.append(r)
 data+=rows
 if len(rows)!=175 and '--partial' not in sys.argv:raise RuntimeError(f'{control}: {len(rows)}/175 maps')
 table=[];reversals=[]
 for theme in THEMES:
  block=[]
  for value in VALUES:
   rs=[r for r in rows if r['theme']==theme and r['value']==value]
   if not rs:continue
   avg=lambda k:round(statistics.mean(r[k] for r in rs),3)
   block.append({'value':value,'n':len(rs),'relief':avg('relief'),'cliffs':avg('cliffs'),'waterPercent':round(avg('water')*100,2),'standingTiles':avg('standingTiles'),'basins':avg('basins'),'passed':sum(r['passed'] for r in rs),'allThree':sum(bool(r.get('outcomes',{}).get('met')) for r in rs)})
  table.append({'theme':theme,'steps':block})
  key='relief' if control=='verticality' else 'standingTiles'
  for seed in range(1,6):
   rs=sorted((r for r in rows if r['theme']==theme and r['seed']==seed),key=lambda r:r['value'])
   for a,b in zip(rs,rs[1:]):
    if b[key]<=a[key]:reversals.append({'theme':theme,'seed':seed,'from':a['value'],'to':b['value'],'before':a[key],'after':b[key]})
 summary={'maps':len(rows),'valid':sum(r['passed'] for r in rows),'settled':sum(r['settled'] for r in rows),'bedFloor':min((r['min'] for r in rows),default=0),'cap':max((r['max'] for r in rows),default=0),'allThree':sum(bool(r.get('outcomes',{}).get('met')) for r in rows),'medianMs':pct([r['ms'] for r in rows],.5) if rows else 0,'p90Ms':pct([r['ms'] for r in rows],.9) if rows else 0,'landMedianMs':pct([r['landMs'] for r in rows],.5) if rows else 0,'landP90Ms':pct([r['landMs'] for r in rows],.9) if rows else 0,'table':table,'nonIncreasingPairs':reversals,'failures':[{'id':r['id'],'checks':r['checks'],'stage':r.get('stage')} for r in rows if not r['passed']]}
 (ROOT/'local'/f'{control}-analysis.json').write_text(json.dumps(summary,indent=2))
 print(json.dumps({k:v for k,v in summary.items() if k not in ['table','nonIncreasingPairs','failures']}))
 if '--partial' in sys.argv:continue
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12)
 bold=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',14)
 sheet=Image.new('RGB',(880,6050),'#f7f6f1');draw=ImageDraw.Draw(sheet)
 draw.text((12,10),f'{control.upper()} | 128 x 128 | seeds 1-5 | each row uses one seed',font=bold,fill='#17352c')
 draw.text((12,32),'Independent adoption patch. Relief: p95-p5 levels. Water: wet tiles. Red border: validation failed.',font=font,fill='#17352c')
 for ti,theme in enumerate(THEMES):
  for seed in range(1,6):
   y=66+(ti*5+seed-1)*170
   draw.text((8,y+45),theme,font=bold,fill='#17352c');draw.text((8,y+66),f'seed {seed}',font=font,fill='#17352c')
   for vi,value in enumerate(VALUES):
    r=next(r for r in rows if r['theme']==theme and r['seed']==seed and r['value']==value)
    x=136+vi*148
    draw.text((x,y),f'{value} | R {r["relief"]} | B {r["basins"]}',font=font,fill='#17352c')
    im=Image.open(folder/f'{r["id"]}.png');sheet.paste(im,(x,y+18))
    draw.rectangle((x-1,y+17,x+128,y+146),outline='#55705e' if r['passed'] else '#c92828',width=1)
    draw.text((x,y+149),f'water {r["water"]*100:.1f}% | {r["standingTiles"]} held',font=font,fill='#17352c')
 sheet=sheet.crop((0,0,880,6020)).quantize(colors=80)
 sheet.save(ROOT/f'{control}-contact.png',optimize=True)
 sheet.crop((0,60,880,66+5*170)).save(ROOT/'local'/f'{control}-detail.png')
(ROOT/'local'/'sweep-measures.json').write_text(json.dumps(data))
if '--partial' not in sys.argv:
 with (ROOT/'MEASURES.csv').open('w',newline='') as f:
  writer=csv.writer(f);writer.writerow(['setting','theme','value','maps','valid','all_three','mean_relief_levels','mean_cliff_share','mean_wet_share','mean_clean_held_tiles','mean_basins20','max_height','bed_floor','median_land_ms','median_first_water_ms','p90_first_water_ms'])
  for control in ['verticality','lakes']:
   for theme in THEMES:
    for value in VALUES:
     rs=[r for r in data if r['control']==control and r['theme']==theme and r['value']==value]
     avg=lambda k:round(statistics.mean(r[k] for r in rs),4)
     water_times=[r.get('timings',{}).get('firstWater',-1) for r in rs];water_times=[v for v in water_times if v>=0]
     writer.writerow([control,theme,value,len(rs),sum(r['passed'] for r in rs),sum(bool(r.get('outcomes',{}).get('met')) for r in rs),avg('relief'),avg('cliffs'),avg('water'),avg('standingTiles'),avg('basins'),max(r['max'] for r in rs),min(r['min'] for r in rs),round(pct([r['landMs'] for r in rs],.5)),round(pct(water_times,.5)) if water_times else '',round(pct(water_times,.9)) if water_times else ''])
