p='src/core/gen/generate.ts'
s=open(p,encoding='utf-8',newline='').read()
a="console.error(`[tr]   leak lake${k}"
assert s.count(a)==1
b="""if (e >= 0) { const ex0 = e % W, ey0 = Math.floor(e / W); const rows: string[] = []; for (let yy = Math.min(H - 1, ey0 + 15); yy >= Math.max(0, ey0 - 15); yy--) { let row = ""; for (let xx = Math.max(0, ex0 - 25); xx <= Math.min(W - 1, ex0 + 25); xx++) { const c = yy * W + xx; const hv = hLand[c]; const ch = hv < 10 ? String(hv) : String.fromCharCode(55 + hv); row += (c === e ? "*" : hy.water[c] === 2 ? (inL.has(c) ? "~" : "=") : hy.water[c] === 1 ? "-" : hy.water[c] === 3 ? "." : " ") + ch; } rows.push(row); } console.error(`[tr]   map around exit x${Math.max(0, ex0 - 25)} y${Math.min(H - 1, ey0 + 15)} down:\n` + rows.join("\n")); } """
s=s.replace(a,b+a)
open(p,'w',encoding='utf-8',newline='').write(s)
