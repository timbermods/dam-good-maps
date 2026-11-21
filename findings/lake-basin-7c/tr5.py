p = 'src/core/land/hydro.ts'
s = open(p, encoding='utf-8', newline='').read()
# module-level debug store
a = "export function moistCost("
assert s.count(a) == 1
s = s.replace(a, "export const HYDRO_DBG: { on: boolean; at: Map<number, string>; who: string; lk: Uint8Array | null } = { on: !!(globalThis as any).process?.env?.DGM_TR, at: new Map(), who: '', lk: null };\n" + a)
# record in carve
a = """      if (water[i] === 2) {
        if (d < r && h[i] > b) h[i] = b;
        continue;
      }
      if (d < r) {
        if (h[i] > b) h[i] = b;"""
assert s.count(a) == 1
b = """      if (water[i] === 2) {
        if (d < r && h[i] > b) { if (HYDRO_DBG.on) HYDRO_DBG.at.set(i, `LAKE<-${HYDRO_DBG.who} j${j} b${b} was${h[i]} lk${HYDRO_DBG.lk ? HYDRO_DBG.lk[j] : '?'}`); h[i] = b; }
        continue;
      }
      if (d < r) {
        if (HYDRO_DBG.on && h[i] > b) HYDRO_DBG.at.set(i, `${HYDRO_DBG.who} j${j}/${n} b${b} was${h[i]} lk${HYDRO_DBG.lk ? HYDRO_DBG.lk[j] : '?'}`);
        if (h[i] > b) h[i] = b;"""
s = s.replace(a, b)
# set who before carve calls
lines = s.split('\n')
out = []
for ln_no, line in enumerate(lines, 1):
    if 'carve(' in line and 'const carve' not in line:
        ind = line[:len(line) - len(line.lstrip())]
        if 'carve(st, bedOf, L, n, half, floorHalf);' in line:
            out.append(ind + "HYDRO_DBG.who = String(rid); HYDRO_DBG.lk = lakeAt;")
        else:
            out.append(ind + f"HYDRO_DBG.who = 'L{ln_no}'; HYDRO_DBG.lk = null;")
    out.append(line)
s = '\n'.join(out)
a = "export function planHydro(E: Float64Array, h: Uint8Array, g: Genome, seed: number, W: number, H: number, attempt: number, opts: HydroOptions = {}): Hydro {"
assert s.count(a) == 1
s = s.replace(a, a + "\n  HYDRO_DBG.at.clear();")
open(p, 'w', encoding='utf-8', newline='').write(s)

p = 'src/core/gen/generate.ts'
s = open(p, encoding='utf-8', newline='').read()
a = "console.error(`[tr]   leak lake${k}"
assert s.count(a) == 1
s = s.replace(a, "console.error(`[tr]   carved exit: ${e >= 0 ? HYDRO_DBG.at.get(e) : ''} | low: ${HYDRO_DBG.at.get(lt)} | path: ${path.slice(Math.max(0, ex - 2), ex + 4).map((c) => `[${c % W},${Math.floor(c / W)}]h${hLand[c]}w${hy.water[c]}:${HYDRO_DBG.at.get(c) ?? '-'}`).join(' ')}`); " + a)
a = 'import { drainage } from "../land/drainage";'
assert s.count(a) == 1
s = s.replace(a, a + '\nimport { HYDRO_DBG } from "../land/hydro";')
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
