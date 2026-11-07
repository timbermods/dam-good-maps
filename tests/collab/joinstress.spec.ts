// DIAGNOSTIC ONLY (not for merging): the page's Invite and Join, many times over, each on a fresh stack, with every peer
// connection, data channel and room message recorded, to catch the join that sometimes never completes on CI.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { buildApp, startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { killPeer, launchPeer } from "./peers";
import type { Kind, Peer } from "./peers";
import { recordRtc, rtcReport } from "./rtcLog";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed");
test.describe.configure({ timeout: 300_000 });

let appDir: string;
test.beforeAll(async () => {
  test.setTimeout(420_000);
  appDir = mkdtempSync(path.join(tmpdir(), "dgm-stress-app-"));
  await buildApp(appDir);
});

const together = (page: Page) => page.locator("header.editor-bar").getByRole("button", { name: /^Together/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Together" });
async function openPanel(page: Page) {
  const button = together(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(panel(page)).toBeVisible();
  return panel(page);
}
const ready = async (page: Page) => {
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d);
  await page.evaluate(() => window.dgmEditor!.idle());
};

const N = Number(process.env.DGM_STRESS_N ?? 16);
for (let i = 0; i < N; i++) {
  test(`join ${i + 1} of ${N}`, async () => {
    const stack: Stack = await startStack({ app: true, appDir });
    const peers: Peer[] = [];
    try {
      const launch = (kind: Kind, fragment: string) =>
        launchPeer(
          kind,
          async (page) => {
            await recordRtc(page);
            await page.addInitScript(
              ([url]) => {
                localStorage.setItem("dgm.collab.function", url);
                localStorage.setItem("dgm.look", "standard");
              },
              [stack.workerUrl],
            );
            page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().includes("GL Driver") && console.log(`[${kind}] ${m.type()}: ${m.text()}`));
            page.on("pageerror", (e) => console.log(`[${kind}] pageerror: ${e}`));
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(`${stack.appUrl}#${fragment}`);
          },
          "dgmEditor",
          true,
        );
      const host = await launch("chromium", "s=4242&z=64&d=n&t=highlands");
      peers.push(host);
      const guest = await launch("other", "s=77&z=48&d=n&t=highlands");
      peers.push(guest);
      await Promise.all([ready(host.page), ready(guest.page)]);
      const hp = await openPanel(host.page);
      await hp.getByLabel("Your name").fill("Ada");
      await hp.getByRole("button", { name: "Invite", exact: true }).click();
      const code = (await hp.getByLabel("Room code", { exact: true }).textContent())!.trim();
      const gp = await openPanel(guest.page);
      await gp.getByLabel("Your name").fill("Bo");
      await gp.getByLabel("Room code to join").fill(code);
      const t0 = Date.now();
      await gp.getByRole("button", { name: "Join", exact: true }).click();
      try {
        await expect(together(guest.page)).toHaveAttribute("aria-label", "Together with Ada", { timeout: 90_000 });
        await expect(together(host.page)).toHaveAttribute("aria-label", "Together with Bo", { timeout: 30_000 });
        console.log(`join ${i + 1}: joined in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      } catch (e) {
        const state = (p: Page) => p.evaluate(() => window.dgmEditor!.worker.collab.state()).catch((x: unknown) => `(${x})`);
        console.log(`JOIN ${i + 1} FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        console.log("GUEST PANEL:", await panel(guest.page).innerText().catch(() => "(none)"), "| HOST PANEL:", await panel(host.page).innerText().catch(() => "(none)"));
        console.log("HOST STATE:", JSON.stringify(await state(host.page)), "| GUEST STATE:", JSON.stringify(await state(guest.page)));
        console.log(`---- HOST RTC\n${await rtcReport(host.page)}`);
        console.log(`---- GUEST RTC\n${await rtcReport(guest.page)}`);
        console.log(`---- RELAY\n${stack.turnReport()}`);
        throw e;
      }
      // (a passing join's record too, for comparison, the first time)
      if (i === 0) {
        console.log(`---- HOST RTC (passing)\n${await rtcReport(host.page)}`);
        console.log(`---- GUEST RTC (passing)\n${await rtcReport(guest.page)}`);
        console.log(`---- RELAY (passing)\n${stack.turnReport()}`);
      }
    } finally {
      for (const p of peers) await killPeer(p).catch(() => undefined);
      await stack.stop();
    }
  });
}
