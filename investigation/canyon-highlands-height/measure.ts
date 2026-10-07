// The round's headline measures on any tree's src/ (a worktree or a snapshot of another branch), one
// JSON line per first map: the outcomes, the absolutes, the attempts, and the main river's walls as
// survey3.ts reads them (the highest ground within 5 tiles of each bank over the water: the median, and
// the share of the course with 5+ on both sides). quick.sh's runner no longer loads today's src/.
//   npx tsx investigation/canyon-highlands-height/measure.ts <root> <theme> <size> [seeds] > local/measures/<name>.jsonl
//   npx tsx investigation/canyon-highlands-height/measure.ts --table <before.jsonl,...> <after.jsonl,...>
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Row = { theme: string; size: number; seed: number; ok: boolean; met: boolean; promise: boolean; water: boolean; standout: boolean; attempts: number; wall: number; deep: number; land: string };
const med = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : NaN);

function table(files: string[]): Map<string, Row[]> {
  const by = new Map<string, Row[]>();
  for (const f of files) for (const line of readFileSync(f, "utf8").split("\n")) if (line.startsWith("{")) { const r = JSON.parse(line) as Row; const k = `${r.theme} ${r.size}`; by.set(k, [...(by.get(k) ?? []), r]); }
  return by;
}

async function main() {
  const a = process.argv.slice(2);
  if (a[0] === "--table") {
    const before = table(a[1].split(","));
    const after = table(a[2].split(","));
    for (const [k, rs] of after) {
      const b = before.get(k) ?? [];
      const line = (v: Row[]) => `${v.filter((r) => r.met).length}/${v.length} met, ${v.filter((r) => !r.ok).length} failing an absolute, attempts ${v.reduce((s, r) => s + r.attempts, 0)}, walls ${med(v.map((r) => r.wall)).toFixed(1)} median of medians (${(v.reduce((s, r) => s + r.wall, 0) / v.length).toFixed(1)} mean), 5+ both sides ${((100 * v.reduce((s, r) => s + r.deep, 0)) / v.length).toFixed(0)}%`;
      const changed = rs.filter((r) => b.find((q) => q.seed === r.seed)?.land !== r.land).length;
      console.log(`${k}²: ${line(b)}  →  ${line(rs)}; lands changed ${changed} of ${rs.length}; misses after: ${rs.filter((r) => !r.met).map((r) => `${r.seed}${r.ok ? "" : "A"}${r.promise ? "" : "P"}${r.water ? "" : "W"}${r.standout ? "" : "S"}`).join(" ")}`);
    }
    return;
  }
  const [root, theme, sizeS, seedsS] = a;
  const { generate } = await import(pathToFileURL(path.resolve(root, "src/core/gen/generate.ts")).href);
  const { makeSpec } = await import(pathToFileURL(path.resolve(root, "src/core/spec/mapspec.ts")).href);
  const size = Number(sizeS);
  const [lo, hi] = (seedsS ?? "1-20").split("-").map(Number);
  for (let seed = lo; seed <= hi; seed++) {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const o = r.outcomes;
    const { W, H, heights: h, water: D } = r.built;
    const wet = (i: number) => D[i] >= 0.05;
    const rivers = (r.features ?? []).filter((f: any) => f.kind === "river" && !f.params.badwater && f.role !== "river/startSpring" && f.role !== "river/lakeSpring") as any[];
    const mainRiver = rivers.find((f) => f.role === "river/main") ?? rivers[0];
    const walls: number[] = [];
    let deep = 0;
    if (mainRiver) {
      const p = mainRiver.params.path as [number, number][];
      for (let k = 0; k + 1 < p.length; k++) {
        const [ax, ay] = p[k]; const [bx, by] = p[k + 1];
        const L = Math.hypot(bx - ax, by - ay); if (L <= 0) continue;
        const dx = (bx - ax) / L, dy = (by - ay) / L;
        const x = Math.round(ax), y = Math.round(ay);
        if (x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;
        let surf = Infinity;
        for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) { if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = yy * W + xx; if (wet(i) && h[i] + D[i] < surf) surf = h[i] + D[i]; }
        if (!Number.isFinite(surf)) continue;
        const side: number[] = [];
        for (const sgn of [-1, 1]) {
          let bank = -1;
          for (let t = 1; t <= 12 && bank < 0; t++) { const xx = Math.round(x - sgn * dy * t), yy = Math.round(y + sgn * dx * t); if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; if (!wet(yy * W + xx)) bank = t; }
          if (bank < 0) { side.push(0); continue; }
          let top = -Infinity;
          for (let t = bank; t <= bank + 4; t++) { const xx = Math.round(x - sgn * dy * t), yy = Math.round(y + sgn * dx * t); if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; top = Math.max(top, h[yy * W + xx]); }
          side.push(Math.max(0, top - surf));
        }
        walls.push(Math.min(side[0], side[1]));
        if (Math.min(side[0], side[1]) >= 5) deep++;
      }
    }
    let land = 0;
    for (let i = 0; i < h.length; i++) land = (Math.imul(land, 31) + h[i]) | 0;
    const row: Row = { theme, size, seed, ok: r.report.passed, met: !!o?.met, promise: !!o?.promise, water: !!o?.story.readable, standout: !!o?.standout, attempts: r.attempts, wall: walls.length ? med(walls) : 0, deep: walls.length ? deep / walls.length : 0, land: String(land) };
    console.log(JSON.stringify(row));
  }
}
void main();
