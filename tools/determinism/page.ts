// The browser page's entry: the cases, for run.ts to call through Playwright.
import { cases, dump, runCase } from "./cases";

Object.assign(window, {
  determinism: { cases, dump, runCase: (c: Parameters<typeof runCase>[0]) => runCase(c, (s) => console.info(`DETERMINISM_PROGRESS ${s}`)) },
});
