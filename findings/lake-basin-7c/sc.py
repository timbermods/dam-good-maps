import json, sys, os, re
# usage: sc.py <tag> [basefile-dir]  -- bars of round 7c on seeds 1-12
tag = sys.argv[1]
basedir = '../lbbase/.scratch/out'
def load(path):
    rows = {}
    if not os.path.exists(path): return rows
    for l in open(path):
        if l.startswith('{'):
            j = json.loads(l); rows[int(j['map'].split()[2][1:])] = j
    return rows
rows = load(f'.scratch/out/lb-{tag}.all')
base = {}
for b in ('base', 'base16'):
    base.update(load(f'{basedir}/lb-{b}.all'))
grp = {1: [0, 0, 0], 2: [0, 0, 0]}
fails = []
for s in sorted(rows):
    j = rows[s]; L = j['land']
    m = re.match(r'(\d+) \((\d+)\)(?: @(\d+))?', L.get('rim', L['face3'])); fl, fd, fdist = (int(m.group(1)), int(m.group(2)), int(m.group(3) or -1)) if m else (0, 0, -1)
    b = base.get(s)
    worse = sorted(set(j['missed']) - set(b['missed'])) if b else ['?']
    bars = {'room': j['room'] >= 400, 'easy': not worse, 'bad': j['badView'] == 0, 'reach': j['reach'] >= 8721,
            'moist': j['moist'] <= 21, 'reg': L['regional'] >= 6.7, 'rim': fl >= 55 and fd >= 4 and 0 <= fdist <= 30, 'pass': j['passed']}
    miss = [k for k, v in bars.items() if not v]
    g = 1 if s <= 6 else 2
    grp[g][0] += j['attempts']; grp[g][1] += j['cpu']; grp[g][2] += b['cpu'] if b else 0
    print(f"s{s:<2} att {j['attempts']:<2} cpu {j['cpu']:<5} room {j['room']:<4} reach {j['reach']:<5} easy-worse {','.join(worse) or '-':<12} bad {j['badView']:<3} moist {j['moist']:<4} reg {L['regional']:<4} rim {fl}({fd})@{fdist} com {L['commonest']} spr {L['spread']} rad {L['radial']} | {'OK' if not miss else 'MISS ' + ','.join(miss)}")
    if miss: fails.append(s)
for g in (1, 2):
    print(f"group {g}: attempts {grp[g][0]} cpu {grp[g][1]:.1f} (base {grp[g][2]:.1f})")
print('maps missing a bar:', fails)
