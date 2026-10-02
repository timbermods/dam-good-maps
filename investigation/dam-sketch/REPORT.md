# Dam sketch investigation

Headless prototype and 12-panel demo delivered; product code unchanged. Base:
dev `4aab909e`; Rust dependency `2ebeea87`. Adoption instructions: INTEGRATION.md.

Explicit dam, levee and floodgate stacks, bent paths and varying foundations produce
piece counts, simulated volume and surface ranges, flood flags and construction
conflicts. Rust state remains resident between slices; stacked dams and roofed maps
use the existing stacked solver. No objects are saved, sites suggested or water filled
from a capacity estimate. Game files and large outputs stay out of git.

**Measured time per sketch**, Ryzen 7 9800X3D, Windows, Node 24 Wasm, shared host load
uncontrolled. Three fresh repetitions after warm-up; paired wall/control simulation
and reporting included. Map generation and Wasm startup excluded.

| Size | New sketch → first 8-tick preview, median | 8-tick slice median / worst | Full fill, median | Nine-day drought pass, median |
|---|---:|---:|---:|---:|
| 128² | 16.4 ms | 3.8 / 10.0 ms | 0.67 s | 1.17 s |
| 256² | 67.2 ms | 18.3 / 63.0 ms | 2.94 s | 5.96 s |

These support progressive worker previews, not instantaneous final answers. The live
browser smoothness gate remains open, especially at 256²; no browser timing claim.
The two timing passes have independent machine load. Raw compact samples are in
benchmarks.json and live-benchmarks.json.

Twelve checks pass: exact Rust/pinned-TS bytes, lossless binary encoding, crest
blocking/overflow, dam/gate equivalence, stacking, weather slicing, cancellation,
arena growth, input immutability, conflicts and roof-separated flood flags.
TypeScript checks pass. Chrome renders all 12 demo panels without page errors.

Example: the bent 128² River Valley wall holds 222.68 m³ on 98 basin tiles; its explicit
nine-day drought retains water. The small 256² dam dries after 1.585 observed days.
The Lake Basin 256² strokes create no reservoir; zero is reported.

Future weather and farmland are absent from these map files. Drought is an explicit
scenario, with surviving water reported as “at least nine days”; unknown inputs stay
unknown. Coverage means hydrological persistence, not invented colony demand.
Game fidelity inherits the validated binary64 ports and their seep/contamination
limits. Fresh in-game roof/construction calibration remains an adoption gate.
