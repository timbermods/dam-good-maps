import sys, glob
# usage: hcmp.py <dev.tsv> <fix tsv glob>
def load(paths):
    rows = {}
    for p in paths:
        for l in open(p):
            f = l.rstrip('\n').split('\t')
            if len(f) < 4: continue
            rows[tuple(f[:3])] = f[3:]
    return rows
a = load([sys.argv[1]])
b = load(glob.glob(sys.argv[2]))
cols = ['surface', 'water', 'objects', 'timber', 'project', 'checks']
moved = []
for k in sorted(set(a) & set(b)):
    d = [cols[i] for i in range(min(len(a[k]), len(b[k]))) if a[k][i] != b[k][i]]
    if d: moved.append((k, d))
print(f"compared {len(set(a) & set(b))} maps (dev {len(a)}, fix {len(b)}); moved {len(moved)}")
for k, d in moved: print(' ', ' '.join(k), ','.join(d))
