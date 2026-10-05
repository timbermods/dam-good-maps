import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
for (const [w, h] of process.argv.slice(2).map((s) => s.split("x").map(Number))) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:5173/#s=4242&z=128&d=n&t=riverValley");
  await p.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120000 });
  await p.evaluate(() => window.dgmEditor.idle());
  await p.keyboard.press("7");
  await p.locator("header.editor-bar").getByRole("button", { name: "Map Generator", exact: true }).click();
  await p.waitForTimeout(500);
  const at = await p.evaluate(() => window.dgmEditor.tileToClient(110, 40));
  await p.mouse.move(at.x, at.y); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const ro = document.querySelector(".readout");
    const words = ro.querySelector("span") ?? ro;
    words.textContent = "Water 0.05 deep, bed level 3, moist soil";
    const a = ro.getBoundingClientRect(), s = document.querySelector(".tool-settings").getBoundingClientRect();
    const g = document.querySelector(".gen").getBoundingClientRect();
    return { gen: [g.top, g.bottom].map(Math.round), genScroll: document.querySelector(".gen").scrollHeight > document.querySelector(".gen").clientHeight, ro: [a.left, a.top, a.right, a.bottom].map(Math.round), set: [s.left, s.top, s.right, s.bottom].map(Math.round), hidden: ro.hidden };
  });
  console.log(w, JSON.stringify(r), r.ro[2] > r.set[0] && r.ro[3] > r.set[1] ? "OVERLAP settings" : "clear of settings", r.ro[1] < r.gen[1] ? "OVERLAP panel" : "clear of panel");
  await p.close();
}
await b.close();
