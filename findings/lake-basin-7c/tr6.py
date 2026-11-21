p = 'src/core/gen/generate.ts'
s = open(p, encoding='utf-8', newline='').read()
a = "      if (drowned.length) return fail(\"a river's head under a lake\", null, true, drowned);"
assert s.count(a) == 1
b = """      if (drowned.length && (globalThis as any).process?.env?.DGM_TR) {
        const sealedM = sealedMouths(hy.rivers, W, H); const sealedF = drainage(h, W, H, { eight: false, outlet: (i) => !sealedM[i] }).filled;
        for (const id of drowned) {
          const r = hy.rivers.find((q) => q.id === id)!;
          const [mx, my] = r.params.path[0];
          const cx = Math.max(0, Math.min(W - 1, Math.round(mx))), cy = Math.max(0, Math.min(H - 1, Math.round(my)));
          const rows: string[] = [];
          for (let yy = Math.min(H - 1, cy + 8); yy >= Math.max(0, cy - 8); yy--) {
            let row = "";
            for (let xx = Math.max(0, cx - 12); xx <= Math.min(W - 1, cx + 12); xx++) {
              const c = yy * W + xx;
              const d = Math.round(sealedF[c] - h[c]);
              row += (hy.water[c] === 1 ? "-" : hy.water[c] === 2 ? "~" : hy.water[c] === 3 ? "." : " ") + String(h[c]).padStart(2, " ") + (d > 0 ? "+" + d : "  ");
            }
            rows.push(row);
          }
          console.error(`[tr]   mouth ${r.role} at [${cx},${cy}] (x from ${Math.max(0, cx - 12)}, y from ${Math.min(H - 1, cy + 8)} down; +n = water over it, edges open):` + String.fromCharCode(10) + rows.join(String.fromCharCode(10)));
        }
      }
""" + a
s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
