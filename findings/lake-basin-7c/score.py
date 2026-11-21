import json,glob,os
baseMiss={1:3,2:3,3:3,4:3,5:2,6:3}
out=[]
for f in sorted(glob.glob('.scratch/out/lb-*.all')):
    tag=os.path.basename(f)[3:-4]
    rows=[json.loads(l) for l in open(f)]
    if len(rows)!=6: continue
    sc={}; att=0; cpu=0
    for j in rows:
        s=int(j['map'].split()[2][1:]); L=j['land']; att+=j['attempts']; cpu+=j['cpu']
        c={'room':j['room']>=400,'easy':len(j['missed'])<=baseMiss[s],'bad':j['badView']==0,'reach':j['reach']>=8721,
           'reg':L['regional']>=8.5,'one':L['oneLevel']<=75,'com':L['commonest']<=20,'spr':L['spread']>=2.7,'rad':L['radial']<=0.15,
           'water':11<=L['water']<=18,'moist':j['moist']<=21.1}
        for k,v in c.items(): sc[k]=sc.get(k,0)+v
    out.append((sum(sc.values()),tag,att,round(cpu),sc))
for t in sorted(out,reverse=True): print(t[0],t[1],'att',t[2],'cpu',t[3],' '.join(f"{k}{v}" for k,v in t[4].items()))
