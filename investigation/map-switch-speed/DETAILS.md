# Stage accounting

One valid before and one valid after reading, Chrome 154.0.8037.95, High look, 1440×900, GPU string `ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Instrumentation/startup failures yielded no valid switch readings and were corrected before recording their side. The after reading uses the identical incoming bytes and the outgoing seven-edit map plus the same extra edit. Generation is outside the interval.

| Foreground stage | Before ms | Before share | After ms | After share |
| --- | ---: | ---: | ---: | ---: |
| Save/drain and remaining main-thread overhead | 154.6 | 4.9% | 623.9 | 49.1% |
| IndexedDB project read | 2.6 | 0.1% | 6.0 | 0.5% |
| Worker call, including RPC and stored-name alignment | 2862.8 | 90.3% | 446.4 | 35.1% |
| enterEditor to renderer/editor ready | 150.6 | 4.7% | 193.9 | 15.3% |
| Other rounding/scheduling | 0.1 | <0.1% | 0.0 | <0.1% |
| **Editor ready** | **3170.7** | **100%** | **1270.2** | **100%** |

The after save/drain number is the residual `enter-start-read-worker`; its instrumentation did not separately mark the new queue drain. It includes saving and main-thread work before the read. It is not a pure IndexedDB write time. The baseline snapshot was pending-water; candidate save behavior and earlier canonical completion can also change snapshot packing cost. These are single observations on a shared PC, not statistical comparisons.

| Inside the worker open call | Before ms | After ms |
| --- | ---: | ---: |
| decodeProject (includes validation/replay) | 21.2 | 43.6 |
| MapSession.open | 2795.2 | 247.2 |
| bakeLandforms | <0.1 | <0.1 |
| opened/session view, including checks handoff | 4.8 | 9.8 |
| Remaining RPC/name alignment/scheduling | 41.6 | 145.7 |

The session view crosses as transferred typed-array buffers; transfer/RPC/name alignment is included in the call's residual, not claimed as a separately isolated transfer time. `MapSession.open` still validates/replays the log, builds terrain/resources and initializes history; its change removes the foreground canonical water settle on cacheless current-generator maps. Restore, replay and landform migration are left intact.

`setMap` took 132.7 ms before and 160.3 ms after, included in page/3D above. Its recorded mesh portion was 91.5/122.1 ms, first-frame render/GPU completion roughly 41.2/38.2 ms. The renderer already keeps its context and programs across keyed editor remounts. An initial preview has fewer water quads (13,777 vs canonical 13,832); the independent checks replica later supplies the exact map. This is not a renderer speedup claim.

The first exact-water observation was 3184.4 ms before and 5085.2 ms after. The after editor was usable for about 3.8 seconds while canonical work continued; its input barrier ended with foreground replacement. The page's existing 700 ms check scheduling and checks replica work remain. The final fully settled view is preserved, not accelerated by this patch. `equivalence.json` records equal full map, `.timber` hash and project hash for the real fixture; `browser-checks.json` records canonical resaving and edits preserved during replacement.

The two-part patch does not change the project schema, generator, canonical settle algorithm, stored decoder/encoder, D455's comparison/floor, or the renderer. It adds no visible content. Keep both parts together so the save barrier and canonical save notification are adopted as a unit.
