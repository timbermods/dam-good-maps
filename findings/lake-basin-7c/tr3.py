p='src/core/gen/generate.ts'
s=open(p,encoding='utf-8',newline='').read()
a="console.error(`[tr] a${attempt} drowned ${drowned.join(\",\")}`);"
assert s.count(a)==1
b="""{ const fl = drainage(h, W, H, { eight: false }).filled; console.error(`[tr] a${attempt} drowned ${drowned.map((id) => { const r = hy.rivers.find((q) => q.id === id)!; const [mx, my] = r.params.path[0]; const cx = Math.max(0, Math.min(W - 1, Math.round(mx))), cy = Math.max(0, Math.min(H - 1, Math.round(my))); const p1 = r.params.path[Math.min(r.params.path.length - 1, 6)]; const c1 = Math.round(p1[1]) * W + Math.round(p1[0]); return `${r.role}@[${cx},${cy}] h${h[cy * W + cx]} fill${fl[cy * W + cx].toFixed(1)} in6 h${h[c1]} end ${JSON.stringify(r.params.path[r.params.path.length - 1].map((v) => Math.round(v)))} endh ${h[Math.round(r.params.path[r.params.path.length - 1][1]) * W + Math.round(r.params.path[r.params.path.length - 1][0])]}`; }).join(" ; ")} lakes ${hy.lakes.map((l) => l.tiles.length + "@" + l.outletBed).join(",")}`); }"""
s=s.replace(a,b)
open(p,'w',encoding='utf-8',newline='').write(s)
