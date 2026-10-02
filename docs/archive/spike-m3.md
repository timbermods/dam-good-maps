# Delivery spike (roadmap M3)

The spike EDITOR_PLAN §7 asks for, run on 2026-09-24. It answers two questions for decisions D8
and D10 (PLAN §20):

- **Route A, the Claude artifact edition.** Can the editor ship as a Claude artifact, with Claude
  calls paid by each viewer's own plan?
- **Route B, bring your own key.** Can the standalone site call the Messages API straight from
  the browser?

## What was built

- **The artifact test page** (`spike/artifact/`, built by `npm run build:spike`), published
  privately at <https://claude.ai/artifact/Dkm1eoXZ6KvPwjBBc6JiRp>.
  - It is one self-contained 209 KB page. It declares only the `sample` and `downloads`
    capabilities.
  - The real Dam Good Maps core runs inside it, in a Web Worker made from a `blob:` URL: the
    generator, the reader, import normalization and a `MapSession`. The core is 189 KB minified.
  - The build is the shape `vite build --mode artifact` will take in M12: two builds, with the
    worker's code inlined as a string that the page turns into a blob.
  - Five checks run on the page:
    1. generate River Valley 96², seed 4242, in the blob worker;
    2. open a local `.timber` through a file input and FileReader, then parse and normalize it
       in the worker;
    3. offer the map as a `.zip` through `downloads.save`, and record how a bare `.timber` is
       answered;
    4. ask Claude on the quick and on the default tier, with three page functions offered as
       tools (`map_facts`, `find_start`, `height_at`), timing each run and checking the answer
       against the map;
    5. probe what the page can reach.

    A **Copy results** button gives everything as JSON.
- **The CORS page** (`spike/cors/index.html`). It sends two requests to
  `https://api.anthropic.com/v1/messages` from a web page, with an obviously fake key. One has
  `anthropic-dangerous-direct-browser-access: true`, the other does not. No real key was used or
  looked for.
- **The local checks** (`npm run spike:check`, results in
  [out/spike/checks.json](../../out/spike/checks.json)). They run in the installed Chrome through
  Playwright:
  - the built page, served over https with an emulation of the artifact's content security
    policy as a response header: scripts inline or from the four CDNs, styles and fonts from
    Google Fonts, `connect-src 'self'`, `worker-src blob:`;
  - the same page with a stand-in for the Claude runtime. It follows the published `downloads`
    and `sample` contracts (contract 0.2.54): the downloads allowlist, and a scripted model that
    calls the page's tools;
  - the CORS page against the real API. The Chrome DevTools protocol records the preflight too.
- **A CI test** (`tests/e2e/spike.spec.ts`). It keeps the worker and file-input checks green on
  every push.

## Answers

| # | Question (EDITOR_PLAN §7) | Answer | Evidence | Status |
|---|---|---|---|---|
| 1 | Does a blob Web Worker run? | **Yes.** | The platform's page contract says Web Workers work from `blob:` URLs. Under the emulated artifact CSP, the blob worker started in 45 ms. It generated River Valley 96² in 203 ms, and its file is byte-identical to Node's (sha256 `450f0299…`). No CSP violation came from the worker. | Answered. The live viewer run is in "Kyler's run" (needs Kyler: opening a private artifact needs his sign-in). |
| 2 | Does a file input read a local `.timber`? | **Yes.** | The page contract says file inputs, drag and drop and FileReader work. Locally, the file input read four maps; the worker parsed and normalized each in 20–63 ms: a generated map (21 load checks pass, nothing to normalize), the official Diorama (version restamp only), the 0.7 Cozy Secret Valley (migrator halving, 3,230 water tokens, metadata) and the 0.6 Meander Multiplayer (heightmap to voxels plus 12 other migrations, 3 starts kept). | Answered. The live file picker is in "Kyler's run" (needs Kyler). |
| 3 | Does `downloads.save` save a `.zip`? | **Yes for `.zip`; `.timber` is refused.** | The downloads contract (0.2.54) lists the allowed extensions: `gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip`. Anything else rejects with `rejected_extension`. Locally, the page offered an 85 KB `River Valley (4242).zip` whose single entry is the generated `.timber`, byte for byte. The stand-in refused the bare `.timber` with `rejected_extension`, and the page reported it. Project files can be saved as `.json`. | Answered for the format. The save dialog itself needs Kyler's confirmation (needs Kyler). |
| 4 | Does `sample` work with page tools on the quick and default tiers, and how fast? | **The contract says yes; the timings need a live run.** | The contract takes `tools: [{name, description, inputSchema, execute}]` with a `modelTier` of quick, default or complex. It caps a tool's schema at 4 KB, a result at 32 KB and the input at 64 KiB. Tools are only offered where `sample.limits()` reports them. Calls with tools are never cached. The documented timing is about one second per round on quick, and 30–90 s for a three-round call on default. Locally the page's tools answered a scripted model correctly (size 96x96, start height 10, 513 Pines). | **Needs Kyler.** A real call spends his plan's usage and asks for his consent first. |
| 5 | Who can open it on Kyler's plan, including by public link? | **Partly known.** | The artifact is private and requires sign-in: the built-in browser showed "Sign in to view this page". The artifact service reports that Kyler's plan and organization allow "anyone with the link" and email invites outside the organization. It also says "a public link can still be unavailable for what this page uses", with the reason in the Share menu. The capability rules name `db`, `assets`, `mcp` and full `comments` as organization-internal, and do not name `sample` or `downloads`. Each viewer's first `sample` call asks for their own consent, on their own plan. | **Needs Kyler.** Changing sharing, and asking someone else to open it, are his. |
| 6 | Can a browser call the Messages API directly (route B)? | **Yes, with the header.** | From a page at `http://cors.dam-good-maps.test` in Chrome, the request with `anthropic-dangerous-direct-browser-access: true` went through a preflight: OPTIONS returned 204, allowing that origin, POST, and the headers `anthropic-dangerous-direct-browser-access, anthropic-version, content-type, x-api-key`. The POST returned 401 with `access-control-allow-origin: *`, and the page read its body (`authentication_error`, "API key is invalid."). Without the header the preflight still passed, but the 401 had no allow-origin header. Chrome blocked it (`MissingAllowOriginHeader`) and the page saw `TypeError: Failed to fetch`. | Answered. |

Further findings:

- **An artifact cannot call the Messages API itself.** Under the emulated policy, the page's
  fetch to `api.anthropic.com` was refused by `connect-src 'self'` (two CSP violations, both from
  that probe). Claude calls from the artifact go through `sample`. This matches EDITOR_PLAN §7.
- **The whole core fits comfortably.** 189 KB of 16 MiB, with no `eval`. The emulated policy
  had no `unsafe-eval`, and the D16 schema checker needs none.
- **Browser storage works there too.** `localStorage` and IndexedDB were usable. Autosave can use
  them as planned, guarded against failure.
- **The runtime appears late.** `window.claude.use()` resolves after the page's first run. The
  page must render without it and switch features on when it resolves. The spike page does that:
  its checks 1 and 2 need no runtime.

## Kyler's run

To fill in after the steps in [What Kyler needs to do](progress/kyler-todo.md), item 4.
Paste the page's **Copy results** JSON below the table.

| Check | Result | Notes |
|---|---|---|
| 1 Blob worker (chip green?) | | |
| 2 Open a .timber from Documents\Timberborn\Maps | | |
| 3 Save the .zip (did the file arrive?) / bare .timber message | | |
| 4 Quick tier: first text, total time, tool calls, answer correct? | | |
| 4 Default tier: first text, total time, tool calls, answer correct? | | |
| 5a Share menu: options offered, and any reason public links are unavailable | | |
| 5b Someone else on your plan opens it | | |
| 5c Public link in a private window: opens? runs checks 1–2? sign-in wall? | | |

```json
(paste here)
```

## What this decides

- **D10 (the `.zip` download) is confirmed** by the platform's own contract: `.timber` is not
  on the allowlist, and `.zip` is.
- **D8 stands, with route B confirmed.** The Messages API accepts browser calls with the header.
  The bring-your-own-key adapter is built first, as planned. Route A's building blocks all work
  under the artifact's rules: workers, file open, the `.zip` download and page tools for
  `sample`. Two things wait for Kyler's run: `sample`'s latency, and who can open the artifact.
  The artifact edition is still built after the API adapter (M12). If question 5 shows that
  artifacts using `sample` cannot be shared publicly on his plan, the artifact edition is for
  signed-in viewers he shares it with, and the website stays the public route.
