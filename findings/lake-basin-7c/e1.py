p='src/core/land/field.ts'
s=open(p,encoding='utf-8',newline='').read()
a="          h += bwk.lin * portable.pow(clamp((q + 1) / 2, 0, 1.25), bwk.pow);\n"
assert s.count(a)==1
b="""          const prof = (qq: number) => bwk.lin * portable.pow(clamp((qq + 1) / 2, 0, 1.25), bwk.pow);
          const ql = -(((2 * g.focus[0] - 1) * fx + (2 * g.focus[1] - 1) * fy) / n1);
          h += bwk.lip !== undefined ? Math.max(prof(q), prof(ql) - bwk.lip) : prof(q);
"""
s=s.replace(a,b)
open(p,'w',encoding='utf-8',newline='').write(s)
p='src/core/land/genome.ts'
s=open(p,encoding='utf-8',newline='').read()
a="basinWarp?: { amp: number; cell: number; lin: number; pow: number; side: number; sideLin: number };"
assert s.count(a)==1
s=s.replace(a,"basinWarp?: { amp: number; cell: number; lin: number; pow: number; side: number; sideLin: number; lip?: number };")
open(p,'w',encoding='utf-8',newline='').write(s)
p='src/core/land/lakeBasin.ts'
s=open(p,encoding='utf-8',newline='').read()
a="side: two ? sideSign : 0, sideLin: two ? lin * 0.7 : 0 };"
assert s.count(a)==1
s=s.replace(a,"side: two ? sideSign : 0, sideLin: two ? lin * 0.7 : 0, ...((globalThis as any).process?.env?.LB_LIP ? { lip: Number((globalThis as any).process.env.LB_LIP) } : {}) };")
open(p,'w',encoding='utf-8',newline='').write(s)
