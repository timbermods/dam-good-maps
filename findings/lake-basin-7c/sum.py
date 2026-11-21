import json,sys
tag=sys.argv[1]
rows=[json.loads(l) for l in open(f'.scratch/out/lb-{tag}.all')]
rows.sort(key=lambda j:j['map'])
tot={'att':0,'cpu':0}
for j in rows:
    L=j['land']; tot['att']+=j['attempts']; tot['cpu']+=j['cpu']
    print(j['map'].split()[2],'P' if j['passed'] else 'F',j['attempts'],j['cpu'],'room',j['room'],'reach',j['reach'],'miss',len(j['missed']),'bad',j['badView'],'moist',j['moist'],'| water',L['water'],'reg',L['regional'],'one',L['oneLevel'],'com',L['commonest'],'spr',L['spread'],'rad',L['radial'],'rel',L['reliefP5P95'],'b2',L['beside2'],'fail',','.join(j['failures']))
print('attempts',tot['att'],'cpu',round(tot['cpu'],1))
