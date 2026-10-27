# Exploratory coverage sheet

All actions below ran through headed Playwright on the unmodified pinned page, with the real generator/session worker and renderer. Test hooks were used to read state, wait for queue/terrain/water completion and aim the camera. Edits, map choices, Generate/Cancel, keys and file opening used actual UI controls. This sheet distinguishes observed behavior from the three new defect regressions.

| Requested flow | Sequence and evidence | Result |
| --- | --- | --- |
| Generate → Cancel → Generate | Seed 4242, 96² River Valley; Generate, modal keys `1`, Ctrl+Z and Delete; Cancel; compare land/water/entities against the snapshot; then Generate 4243 | Exact cancellation recovery; generation usable again; modal keys made no edit |
| History across Generate | Lower on 4243, generate 4244, Ctrl+Z | F2: new map remains, Undo disabled; patch regression restores every edit/land and redoes replacement |
| History across saved-map switching | Open the edited old map from Your maps; undo its edit then ask to undo the switch; redo | Same missing replacement boundary; patched regression verifies both directions and edit priority |
| History across real place | Lower and undo/redo on 96² 4244, open first real-place tile (Near Thousand Islands Saint Lawrence, 128²), Ctrl+Z | F2: place remains with empty document history; patched regression restores old map and redoes place with its URL |
| Water settling overlaps | Lower stroke; confirm `waterSettled=false`, Ctrl+Z, Ctrl+Y, then replace with real place while the outgoing map is active | History/terrain update; new map opens correctly; no old worker view or exception observed. Saving-review races excluded |
| Force edits and undo | Slow Craterize on the real place; wait for actual craterize playback/steps; tool key then Ctrl+Z | Tool key finishes Slow force as designed; undo restores all original land, force=null |
| Map switch during force | Start Craterize again, wait for playback, Your maps → Twisting Stream | Pointer press finishes Slow force as designed; replacement has its own one-stroke history, no force/tool in hand and correct dimensions |
| File during force | 256² Highlands 4242, Fast Craterize, pause only after real terrain changes, Save project/Download .timber, reopen | F1: 2,219 shown tiles omitted, file matches pre-force map; patched regression passes both save choices |
| Weather overlaps | On 96² edited map, Badtide, type Day 99; observe `.day-label.working`; Lower, undo; switch to a 128² saved place | Edits/undo work; new map has its own history; no held weather/force carried over; no page error |
| Delete open map | Ctrl-select current real-place map in Your maps; Delete, confirm; observe remaining 96² map | Deleted row gone, next map opens with its own saved edit and no force |
| Tool/force at replacement | Replace maps while a brush/Craterize is selected; read force selection and state | New Editor starts with no selected force/old force driver; map tools respond afterward |
| Save project/open | 96² River Valley 4243, real Lower stroke; wait Ready and settled; click Save project and reopen its live download bytes | Heights, water depth/contamination and entity state exactly equal, history contains the stroke |
| Download timber/open | Same edited map, Ready and settled, Download and reopen actual download blob | Terrain identical; entity placements retained (feature owners necessarily become import ownership); F3: 576 depth values differ, max 5.960464477539062e-7. No visible change established |
| Share | Unedited generated 4244 map; open its URL in a fresh storage context | Heights, water depth/contamination and entity state exactly equal. Share carries generation, not edits, as designed |
| Your maps reopening | Reopen 4243 edited saved row after the file round trip | Complete displayed map equals canonical edited snapshot; saved stroke/history restored |
| Minimum size | Custom 48²; Highlands 4243 (“Fork in the Land”); Lower click then Ctrl+Z | 48² loads/draws, edit adds a history step and starts settling, undo restores exact land |
| Maximum size | 256² Highlands 4242 (“Gorge Crossing”); resize/select force and apply Craterize | 256² draws 494,717 triangles in observed frame; changed terrain reaches the renderer; file defects tested at this size |
| Windows/drawer | 256², generator drawer open, Craterize selected; viewport 1440×1000 → 1024×768 → 1680×1050; close drawer and apply force | Dimensions stay 256², force remains selected, view draws and subsequent map input works. Layout aesthetics excluded |

48² River Valley 4242 failed the generator's checks after its normal attempt limit, and the old edited map remained. Closing its failure message then generating 48² Highlands 4243 succeeded. Generator suitability is outside this investigation's requested scope, so this is neither a reported defect nor a blanket claim that every smallest-map seed succeeds.

Canonical-state comparisons wait for both Ready checks and the visible water journey to finish. A snapshot taken earlier can differ because the background canonical check has not yet adopted its result; that expected change is not reported. Weather Day 99 is a stress overlap, not a speed gate. The source baseline supports 48–256 per side; this pass does not claim dev's different size/feature set was tested.

All recorded exploratory page errors: **none**. Expected baseline regression assertion failures are the three findings. Native download writes remain unverified as explained in INTEGRATION.md. No live Timberborn game was launched, no raw game files were copied, and no already-known saving/round-one/layout issue is included.
