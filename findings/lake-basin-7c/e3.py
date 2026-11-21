p = 'src/core/land/hydro.ts'
s = open(p, encoding='utf-8', newline='').read()
a = """        // A flat valley's trunk stays below its upstream bed when it crosses a hollow.
        const lk = hollow(ci, valleyMain ? Math.min(maxSill, run + 1) : maxSill);"""
assert s.count(a) == 1
a2 = """          lakes.push({ tiles: lk.tiles.slice(), outletBed: lk.sill - 1, river: rid });
          inLake = id;
        }
      }
"""
assert s.count(a2) == 1
b2 = """          lakes.push({ tiles: lk.tiles.slice(), outletBed: lk.sill - 1, river: rid });
          inLake = id;
        }
        // (round 7c: Lake Basin above 128², a lake found here that reaches back over the course already run: the stations
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
      }
"""
s = s.replace(a2, b2)
# station cells
a3 = "    const lakeAt = new Uint8Array(n + 1);\n"
assert s.count(a3) == 1
s = s.replace(a3, a3 + "    const cellAt = new Int32Array(n + 1).fill(-1);\n")
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
