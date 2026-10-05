import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const TOOLS = [[null,"Select"],["1","Raise"],["3","Flatten"],["7","Carve"],["8","Craterize"],["0","Erupt"],[null,"Rift"],["9","Quake"],["-","Glaciate"],[null,"Deposit"]];
const PIECES = [".tool-settings", ".tool-bar", ".objects-menu", ".editor-view .minimap", ".coords", ".readout", ".gen", ".legend-panel", ".first-run", ".working-note"];
for (const [w, h] of process.argv.slice(2).map((s) => s.split("x").map(Number))) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:5173/#s=4242&z=128&d=n&t=riverValley");
  await p.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120000 });
  await p.evaluate(() => window.dgmEditor.idle());
  const out = [];
  for (const [k, name] of TOOLS) {
    if (name !== "Select") { if (k) await p.keyboard.press(k); else await p.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name, exact: true }).click(); }
    await p.waitForTimeout(150);
    const r = await p.evaluate((PIECES) => {
      const LONGEST = { Wander: "Meandering", Level: "Ground", "River depth": "Off", Banks: "None", Size: "180", Power: "100" };
      const cut = [];
      for (const set of document.querySelectorAll(".tool-settings .set")) {
        const label = set.querySelector(".set-label"), value = set.querySelector(".set-value");
        const was = value?.textContent;
        if (value) value.textContent = LONGEST[label?.textContent] ?? "188";
        for (const e of set.querySelectorAll(".set-label, .set-seg button, .set-button, .set-words, .set-head")) if (e.scrollWidth > e.clientWidth + 0.5) cut.push(`${label?.textContent}: ${e.textContent.trim().slice(0, 20)}`);
        if (value) value.textContent = was;
      }
      // a long readout, to see it never meets the settings
      const ro = document.querySelector(".readout"); if (ro) ro.textContent = "Water 0.45 deep, bed level 7, moist soil, contaminated by badwater nearby, two trees and a berry bush";
      const bs = [];
      for (const s of PIECES) document.querySelectorAll(s).forEach((e) => { const q = e.getBoundingClientRect(); if (q.width && q.height) bs.push([s, q.left, q.top, q.right, q.bottom]); });
      const ov = [];
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], c = bs[j]; if (a[1] < c[3] - 0.5 && c[1] < a[3] - 0.5 && a[2] < c[4] - 0.5 && c[2] < a[4] - 0.5) ov.push(a[0] + "×" + c[0]); }
      const set = document.querySelector(".tool-settings").getBoundingClientRect();
      return { cut, ov, top: set.top, h: set.height };
    }, PIECES);
    if (r.cut.length || r.ov.length) out.push(`  ${name}: cut [${r.cut.join("; ")}] overlap [${r.ov.join(", ")}]`);
    if (name === "Carve") out.unshift(`  settings top ${r.top} height ${r.h}`);
    await p.keyboard.press("Escape");
  }
  console.log(`${w}x${h}\n${out.join("\n") || "  all fit, nothing overlaps"}`);
  await p.close();
}
await b.close();
