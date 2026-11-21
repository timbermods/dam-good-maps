p = 'src/core/land/hydro.ts'
s = open(p, encoding='utf-8', newline='').read()
reps = [
    ("    let leftLake = -1;\n", "    let leftLake = -1;\n    let leftAt = -1;\n"),
    ("        leftLake = inLake;\n", "        leftLake = inLake;\n        leftAt = j;\n"),
    ("""      let beside = Infinity;
      const R = r + 1.6;
""", """      let beside = Infinity;
      // (round 7c: Lake Basin above 128², the lake this river left, within reach of its channel)
      let byOwn = false;
      const R = r + 1.6;
"""),
    ("""          if (floorOthers && water[i] === 3 && st.d[i] >= r) {""",
     """          if (g.basinWarp && leftLake >= 0 && lakeOf[i] === leftLake && (x - px) * (x - px) + (y - py) * (y - py) <= R * R) byOwn = true;
          if (floorOthers && water[i] === 3 && st.d[i] >= r) {"""),
    ("""      if (run < BED_FLOOR) run = BED_FLOOR;
      prof[j] = Math.round(run);
    }
    return { st, prof, L, n, lakeAt };""",
     """      if (run < BED_FLOOR) run = BED_FLOOR;
      // (round 7c: Lake Basin above 128², a river that left its lake runs at the lake's outlet bed while its channel is
      // within reach of the lake, and from where it left: below it, beside its own lake, it drained the lake into its
      // channel there, Lake Basin 256² seeds 5, 8 and 12)
      if (byOwn && run < lakes[leftLake].outletBed) {
        run = lakes[leftLake].outletBed;
        for (let q = leftAt; q < j; q++) if (prof[q] < run) prof[q] = run;
      }
      prof[j] = Math.round(run);
    }
    return { st, prof, L, n, lakeAt };"""),
]
for a, b in reps:
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
