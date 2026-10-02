# What Kyler needs to do

Things the run can't do itself. Each has the exact steps.

1. **See [STATUS.md](../../STATUS.md)**, "Waiting on Kyler", for the current decisions and approvals.
   (GitHub Pages is on since 2026-09-24: <https://timbermods.github.io/dam-good-maps/>, deployed
   from `main`.)
2. **Play the pending in-game checks** when you're ready. See [ingame-log.md](../ingame-log.md). M2
   adds B1–B4 (files in `out/m2/`): the first time pre-filled water meets the real game. M5 adds
   C1–C3, F1 and the gorge's stair notch (files in `out/m5/`). M6 adds M6-1a to M6-1c: a Canyon
   and a Lake Basin map, their dam sites and their badwater basins (files in `out/m6/`). M7 adds D1–D5: one Lake Basin map with every 1.0 object;
   demolish the spillway's plug and watch the lake drop (files in `out/m7/`). M8 adds M8-1a to
   M8-1c: compare the editor's water with the game on three edited maps (a River Valley map in
   `out/m8/`; Canyon and Cozy Secret Valley made from your own copies with
   `npx tsx tools/ingame-files.ts --milestone m8`, in `out/m8/local/`).
3. **Answer the pending decisions** in [decisions-pending.md](../../decisions-pending.md) when convenient;
   the run went ahead with the defaults listed there.
4. **Run the delivery spike page** (M3). It needs your claude.ai account and your consent, so the
   run leaves it to you. It takes about ten minutes.
   1. Open <https://claude.ai/artifact/Dkm1eoXZ6KvPwjBBc6JiRp> while signed in to claude.ai.
   2. **Check 1** runs by itself. Wait for the **Blob worker** chip to turn green (**Passed**).
   3. **Check 2:** click **Choose a .timber** and pick any map from `Documents\Timberborn\Maps`.
      Also try a map from a workshop folder if you like. The **Open a .timber** chip should turn
      green, and the box below it should describe the map.
   4. **Check 3:** click **Save the .zip**. Claude asks you to confirm the save: accept it.
      `River Valley (4242).zip` should appear in your downloads, with `River Valley (4242).timber`
      inside. Then click **Try a bare .timber** and note the message under the buttons. The
      expected answer is `rejected_extension`.
   5. **Check 4:** click **Ask on the quick tier**. The first time, Claude asks whether this
      artifact may use Claude on your plan: allow it. Wait until the chip turns green or red.
      Then click **Ask on the default tier** and wait again; that one can take a minute or two.
   6. Click **Copy results**. Paste the JSON into [docs/spike-m3.md](../spike-m3.md), in the
      "Kyler's run" section. Fill in that table too: first-text and total times, the number of
      tool calls, and whether each answer was right.
   7. **Sharing.** Open the page's **Share** menu and note every option it offers. If it says a
      public link is unavailable, copy the reason it gives.
      - If someone else is on your plan or in your organization, share the page with them. Ask
        them to open it and wait for check 1. Record whether it opened for them.
      - If **Anyone with the link** is offered, turn it on. Open the link in a private browser
        window where you are not signed in, and record what you see: a sign-in wall, or the
        page with check 1 running. Turn public sharing off again afterwards if you prefer.
   8. Record the sharing results in the same table (rows 5a–5c). If anything fails, the
      page's box for that check says why.
