import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const TOOLS = [[null,"Select"],["1","Raise"],["3","Flatten"],["4","Smooth"],["7","Carve"],["8","Craterize"],["0","Erupt"],[null,"Rift"],["9","Quake"],["-","Glaciate"],[null,"Deposit"]];
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto("http://localhost:5173/#s=4242&z=128&d=n&t=riverValley");
await p.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120000 });
await p.evaluate(() => window.dgmEditor.idle());
for (const [k, name] of TOOLS) {
  if (name !== "Select") { if (k) await p.keyboard.press(k); else await p.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name, exact: true }).click(); }
  await p.waitForTimeout(120);
  const r = await p.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll(".tool-settings .set-group")) {
      const gr = g.getBoundingClientRect();
      for (const e of g.querySelectorAll("*")) { const q = e.getBoundingClientRect(); if (q.height && (q.top < gr.top - 0.5 || q.bottom > gr.bottom + 0.5)) out.push((e.className || e.tagName) + " " + (g.textContent || "").slice(0, 14)); }
      if (g.scrollHeight > g.clientHeight + 0.5) out.push("scroll " + (g.textContent || "").slice(0, 14));
    }
    const rows = [...new Set([...document.querySelectorAll(".tool-settings .set-group")].map((g) => Math.round(g.getBoundingClientRect().height)))];
    return { out: [...new Set(out)].slice(0, 6), rows };
  });
  console.log(name, "group heights", r.rows.join(","), r.out.length ? "OUT: " + r.out.join(" | ") : "fits");
  await p.keyboard.press("Escape");
}
const g = await p.evaluate(async () => { document.querySelector("header.editor-bar").querySelectorAll("button").forEach((b) => b.textContent.trim() === "Map Generator" && b.click()); await new Promise((r) => setTimeout(r, 600)); const e = document.querySelector(".gen"); return [e.clientHeight, e.scrollHeight]; });
console.log("generator client/scroll", g);
await b.close();
