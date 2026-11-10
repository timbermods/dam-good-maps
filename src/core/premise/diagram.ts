// The water-story diagram of a plan (docs/PREMISES.md §2.2, stage 0's output): sources, bodies, links, exits, regions,
// ridges, works and the start with its look, drawn from the plan alone, before any land. `planSvg` is the labelled
// drawing; `planRaster` is the same plan a pixel a tile (RGB, north up) for a quick look. Headless: strings and arrays
// only (`tools/premise-plan.ts` writes them).

import { openingCamera } from "../analysis/opening";
import { sqrt } from "../math/portable";
import { bodyDist, pathDist, pathLength, pointAt, segDist } from "./geom";
import type { Body, Link, Point, PremisePlan, Spine, Work } from "./types";

const WATER_LOW: [number, number, number] = [96, 160, 214];
const WATER_HIGH: [number, number, number] = [28, 70, 140];
const LAND: [number, number, number] = [236, 230, 214];
const BASIN: [number, number, number] = [214, 196, 150];
const POOL: [number, number, number] = [70, 190, 210];
const TARN: [number, number, number] = [64, 160, 150];
const DRY_BED: [number, number, number] = [176, 140, 96];
const BYPASS: [number, number, number] = [196, 120, 60];
const LIP: [number, number, number] = [214, 40, 40];
const START: [number, number, number] = [255, 255, 255];
const RIDGE: [number, number, number] = [150, 146, 136];

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A body's fill: lakes darker the higher they stand, so the stair reads at a glance. */
function bodyColour(b: Body, top: number): [number, number, number] {
  if (b.kind === "pool") return POOL;
  if (b.kind === "basin" || b.dry) return BASIN;
  if (b.kind === "tarn") return TARN;
  return mix(WATER_LOW, WATER_HIGH, Math.min(1, b.sill / Math.max(1, top - 2)));
}

function linkColour(l: Link): [number, number, number] {
  if (l.kind === "bypass") return BYPASS;
  return l.wet ? WATER_LOW : DRY_BED;
}

const WORK_MARK: Record<Work["kind"], string> = { breach: "B", notch: "N", damToPond: "D", levee: "L", leat: "T", raisedSill: "R", bypass: "Y", megadam: "M", canal: "C" };
const RUNG_COLOUR: Record<Work["rung"], string> = { first: "#d62828", small: "#2a9d8f", medium: "#e9a800", large: "#6a4c93" };

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The plan as a labelled SVG, `px` pixels a tile, north up. */
export function planSvg(plan: PremisePlan, px = 4): string {
  const W = plan.W;
  const H = plan.H;
  const legend = 230;
  const X = (x: number) => (x * px).toFixed(1);
  const Y = (y: number) => ((H - y) * px).toFixed(1);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * px + legend}" height="${H * px + 40}" viewBox="0 0 ${W * px + legend} ${H * px + 40}" font-family="sans-serif">`);
  out.push(`<rect x="0" y="0" width="${W * px + legend}" height="${H * px + 40}" fill="#fafaf7"/>`);
  out.push(`<rect x="0" y="0" width="${W * px}" height="${H * px}" fill="${hex(LAND)}" stroke="#888"/>`);
  // ridges under everything
  for (const r of plan.ridges) {
    out.push(`<polyline points="${r.path.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")}" fill="none" stroke="${hex(RIDGE)}" stroke-opacity="0.55" stroke-width="${(2 * r.half * px).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  const capsules = (spine: Spine, fill: string, extra = "") => {
    const parts: string[] = [];
    for (const [x, y, r] of spine) parts.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${(r * px).toFixed(1)}"/>`);
    for (let k = 0; k + 1 < spine.length; k++) {
      const [ax, ay, ar] = spine[k];
      const [bx, by, br] = spine[k + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      parts.push(`<polygon points="${X(ax + nx * ar)},${Y(ay + ny * ar)} ${X(bx + nx * br)},${Y(by + ny * br)} ${X(bx - nx * br)},${Y(by - ny * br)} ${X(ax - nx * ar)},${Y(ay - ny * ar)}"/>`);
    }
    return `<g fill="${fill}" ${extra}>${parts.join("")}</g>`;
  };
  // channels, then bodies over their ends
  for (const l of plan.links) {
    if (!l.path) continue;
    const dash = l.wet ? "" : ` stroke-dasharray="${2 * px},${px}"`;
    const width = Math.max(1, 2 * (l.half ?? 1) * px);
    out.push(`<polyline points="${l.path.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")}" fill="none" stroke="${hex(linkColour(l))}" stroke-width="${width.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`);
  }
  for (const b of plan.bodies) {
    const fill = hex(bodyColour(b, plan.top));
    for (const arm of b.arms) out.push(capsules(arm, fill, b.dry ? `stroke="#8a6d3b" stroke-dasharray="3,2" stroke-width="1"` : ""));
    for (const isl of b.islands ?? []) out.push(capsules(isl, hex(LAND)));
  }
  // gates and rows along channels
  for (const l of plan.links) {
    if (!l.path) continue;
    const mark = (s: number, colour: string, w: number) => {
      const { p, dir } = pointAt(l.path!, Math.min(s, pathLength(l.path!)));
      const h = (l.half ?? 1) + 1;
      out.push(`<line x1="${X(p[0] - dir[1] * h)}" y1="${Y(p[1] + dir[0] * h)}" x2="${X(p[0] + dir[1] * h)}" y2="${Y(p[1] - dir[0] * h)}" stroke="${colour}" stroke-width="${w}"/>`);
    };
    for (const g of l.gates) mark(g, "#111", 3);
    for (const r of l.rows) mark(r, "#f28c28", 2);
  }
  // falls: the lip, red; the landmark's thicker
  for (const l of plan.links) {
    if (!l.fall) continue;
    const [a, b] = l.fall.lip;
    const lm = l.id === plan.frame.landmark;
    out.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${hex(LIP)}" stroke-width="${lm ? 4 : 2.5}" stroke-linecap="round"/>`);
    const m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    out.push(`<text x="${X(m[0])}" y="${Y(m[1] + 2.5)}" font-size="${lm ? 12 : 10}" fill="#7a1010" text-anchor="middle" font-weight="${lm ? "bold" : "normal"}">↓${l.fall.height}${l.fall.breach ? ` breach ${l.fall.breach}` : ""}</text>`);
  }
  // exits and sources
  for (const e of plan.exits) out.push(`<circle cx="${X(e.at[0])}" cy="${Y(e.at[1])}" r="5" fill="none" stroke="#1d3557" stroke-width="2"/>`);
  for (const s of plan.sources) out.push(`<circle cx="${X(s.at[0])}" cy="${Y(s.at[1])}" r="3.5" fill="${s.bad ? "#7b2cbf" : "#fff"}" stroke="#1d3557" stroke-width="1.2"/>`);
  // the start, its 5 × 5 and its look
  const st = plan.frame.start;
  if (st.z >= 0) {
    const cam = openingCamera(st);
    out.push(`<rect x="${X(st.x - 2)}" y="${Y(st.y + 3)}" width="${5 * px}" height="${5 * px}" fill="${hex(START)}" stroke="#000" stroke-width="1.5"/>`);
    const tip: Point = [st.x + 0.5 + cam.look[0] * 9, st.y + 0.5 + cam.look[1] * 9];
    out.push(`<line x1="${X(st.x + 0.5)}" y1="${Y(st.y + 0.5)}" x2="${X(tip[0])}" y2="${Y(tip[1])}" stroke="#000" stroke-width="2"/>`);
    out.push(`<circle cx="${X(tip[0])}" cy="${Y(tip[1])}" r="2.5" fill="#000"/>`);
  }
  // works
  for (const w of plan.works) {
    out.push(`<circle cx="${X(w.at[0])}" cy="${Y(w.at[1])}" r="6" fill="${RUNG_COLOUR[w.rung]}" stroke="#fff" stroke-width="1"/>`);
    out.push(`<text x="${X(w.at[0])}" y="${(Number(Y(w.at[1])) + 3.5).toFixed(1)}" font-size="9" fill="#fff" text-anchor="middle" font-weight="bold">${WORK_MARK[w.kind]}</text>`);
  }
  // names: bodies at their first node, regions at theirs
  for (const b of plan.bodies) {
    const name = plan.names[b.id];
    if (!name) continue;
    const [x, y] = b.arms[0][0];
    out.push(`<text x="${X(x)}" y="${Y(y)}" font-size="10" fill="#0b2545" text-anchor="middle">${esc(name)} (${b.sill})</text>`);
  }
  for (const r of plan.regions) out.push(`<text x="${X(r.at[0])}" y="${Y(r.at[1])}" font-size="13" fill="#5c4d3c" font-style="italic" text-anchor="middle" opacity="0.8">${esc(r.role)}</text>`);
  // the legend
  const lx = W * px + 12;
  const rows: [string, string][] = [
    [hex(WATER_LOW), "lake, low"],
    [hex(WATER_HIGH), "lake, high"],
    [hex(POOL), "springs' pool"],
    [hex(TARN), "spring tarn"],
    [hex(BASIN), "dry basin"],
    [hex(DRY_BED), "dry bed (dashed)"],
    [hex(BYPASS), "bypass"],
    [hex(LIP), "lip (↓ height)"],
    ["#111", "gate"],
    ["#f28c28", "row of Blockages"],
  ];
  rows.forEach(([c, t], k) => {
    out.push(`<rect x="${lx}" y="${14 + k * 18}" width="14" height="12" fill="${c}"/>`);
    out.push(`<text x="${lx + 20}" y="${24 + k * 18}" font-size="11">${esc(t)}</text>`);
  });
  const wy = 14 + rows.length * 18 + 8;
  (Object.keys(RUNG_COLOUR) as Work["rung"][]).forEach((r, k) => {
    out.push(`<circle cx="${lx + 7}" cy="${wy + k * 18}" r="6" fill="${RUNG_COLOUR[r]}"/>`);
    out.push(`<text x="${lx + 20}" y="${wy + 4 + k * 18}" font-size="11">${r} work</text>`);
  });
  out.push(`<text x="${lx}" y="${wy + 4 * 18 + 6}" font-size="10">B breach N notch D dam to pond</text>`);
  out.push(`<text x="${lx}" y="${wy + 4 * 18 + 20}" font-size="10">L levee T leat R raised sill</text>`);
  out.push(`<text x="${lx}" y="${wy + 4 * 18 + 34}" font-size="10">Y bypass M megadam</text>`);
  out.push(`<text x="${lx}" y="${wy + 4 * 18 + 56}" font-size="10">□ start, its look; ○ exit</text>`);
  out.push(`<text x="8" y="${H * px + 26}" font-size="13">${esc(`${plan.premise} · seed ${plan.seed} · ${W}² · ${plan.line}`)}</text>`);
  out.push("</svg>");
  return out.join("\n");
}

/** The plan a pixel a tile (RGB, north up): bodies, channels, lips and the start's 5 × 5. */
export function planRaster(plan: PremisePlan): { rgb: Uint8Array; width: number; height: number } {
  const W = plan.W;
  const H = plan.H;
  const rgb = new Uint8Array(W * H * 3);
  const put = (i: number, j: number, c: [number, number, number]) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return;
    const o = ((H - 1 - j) * W + i) * 3;
    rgb[o] = c[0];
    rgb[o + 1] = c[1];
    rgb[o + 2] = c[2];
  };
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = i + 0.5;
      const y = j + 0.5;
      let c = LAND;
      for (const r of plan.ridges) if (pathDist(x, y, r.path).d < r.half) c = RIDGE;
      for (const l of plan.links) if (l.path && pathDist(x, y, l.path).d < (l.half ?? 1)) c = linkColour(l);
      for (const b of plan.bodies) if (bodyDist(x, y, b) < 0) c = bodyColour(b, plan.top);
      for (const l of plan.links) if (l.fall && segDist(x, y, l.fall.lip[0][0], l.fall.lip[0][1], l.fall.lip[1][0], l.fall.lip[1][1]).d < 0.75) c = LIP;
      put(i, j, c);
    }
  const s = plan.frame.start;
  if (s.z >= 0) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) put(s.x + dx, s.y + dy, START);
  return { rgb, width: W, height: H };
}
