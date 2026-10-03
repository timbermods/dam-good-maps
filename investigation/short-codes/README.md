# Short join codes

Standalone adaptation of `collab-spike`, based on dev `0f4a978b`. Product and original spike untouched.
Two codes, direct WebRTC, optional public STUN address lookup. No server, relay, signaling service or CDN.

From the repository root, Node 22+:

```sh
npm ci --prefix investigation/short-codes
npm run build --prefix investigation/short-codes
npx --prefix investigation/short-codes playwright install chromium firefox webkit
npm run matrix --prefix investigation/short-codes
npm run codec-check --prefix investigation/short-codes
npm run typecheck --prefix investigation/short-codes
npm run check --prefix investigation/short-codes
```

Open `local/demo.html` directly from disk on both peers. Host **Host · Invite**, guest **Join a map**.
Exchange Invite, then Reply. Try edits and **Drop connection**, then exchange fresh codes to rejoin.
Choose the alphabet before making a code. The alphabet selector offers base64url, base85, base58 and base32. Default: base64url, all candidates.
The original spike's README describes map editing, hash checking and session lifetime.

`matrix.mjs` compares long/short codes on all available engine pairs, and exercises all alphabets.
`CHECK_STUN=1` adds public-STUN gathering comparisons (a timeout makes this optional matrix fail).
`CHECK_FIREFOX=1` adds the spike's map replay/editing check with a Firefox guest.
Environment variables are set with `$env:CHECK_FIREFOX='1'` in PowerShell, or a command prefix in POSIX shells.
`SPIKE_BATCH` controls mixed-edit batches; default 15. `PLAYWRIGHT_MODULE` can select another module.
All generated HTML, SDP/credentials, screenshots, operation logs and detailed JSON stay gitignored in `local/`.

## Two physical devices (remaining validation)

Copy the same `local/demo.html` to both devices by file transfer; open local copies without a web server.
Use the same LAN, with STUN off. Repeat in Chromium, Firefox and a WebRTC-enabled Safari/WebKit browser.
For each engine pair, run the short-code exchange, edit from both sides, drop/rejoin and save both results.
Repeat with the original spike's built HTML as the long-code control. Do not substitute two tabs for two devices.
Record both browser versions, network/isolation settings, code lengths, selected candidates and outcomes.
For different networks, repeat with STUN enabled; there is never a relay fallback.
Only one Windows machine was accessible for this investigation; these rows remain unverified.

## Adoption patch

```sh
npm run patch --prefix investigation/short-codes
git apply --check investigation/short-codes/adoption.patch
```

The patch is intentionally unapplied. It updates the original spike's codec and demo when adopted later.
See `INTEGRATION.md` for the collaboration milestone and `REPORT.md` for measurements and limits.
