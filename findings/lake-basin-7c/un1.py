p = 'src/core/land/hydro.ts'
s = open(p, encoding='utf-8', newline='').read()
cuts = [
    ("""        // (round 7c: Lake Basin above 128² as well: a lake standing over the river's own bed upstream drowned its head or
        // backed its water out by the edge beside its mouth)
        const lk = hollow(ci, valleyMain || (g.basinWarp && (globalThis as any).process?.env?.LB_CAP) ? Math.min(maxSill, run + 1) : maxSill);""",
     """        const lk = hollow(ci, valleyMain ? Math.min(maxSill, run + 1) : maxSill);"""),
    ("""        // (round 7c: Lake Basin above 128², a lake found here that reaches back over the course already run: the stations
        // from the first in it stand at its outlet's bed at least, and none cuts a channel through its floor below it)
        if (g.basinWarp && inLake >= 0) {
          let q0 = -1;
          for (let q = 0; q < j; q++)
            if (cellAt[q] >= 0 && lakeOf[cellAt[q]] === inLake) {
              q0 = q;
              break;
            }
          if (q0 >= 0)
            for (let q = q0; q < j; q++) {
              if (prof[q] < lakes[inLake].outletBed) prof[q] = lakes[inLake].outletBed;
              if (cellAt[q] >= 0 && lakeOf[cellAt[q]] === inLake) lakeAt[q] = 1;
            }
        }
""", ""),
    ("""      // (round 7c: Lake Basin above 128², a river that meets a planned lake, its own or another's, is in it: its bed there
      // is the lake's outlet, and it cuts no channel through the lake's floor, which drained it)
      if (g.basinWarp && inLake < 0 && isIn && lakeOf[ci] >= 0) inLake = lakeOf[ci];
""", ""),
    ("    const cellAt = new Int32Array(n + 1).fill(-1);\n", ""),
    ("      if (isIn) cellAt[j] = ci;\n", ""),
]
for a, b in cuts:
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
