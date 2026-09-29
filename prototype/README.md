# prototype

The Python reference implementation and test oracle: it reads and writes `.timber` files, generates and validates maps, and simulates water. The website's TypeScript core (`src/core/`) is checked against it.

**Rules**
- It stays as the reference implementation and oracle, an independent second implementation. `tools/oracle.ts` runs both on the same maps and compares every verdict.
- Rules, check ids and thresholds must match `src/core/validate/` and `src/core/sim/`. The water port is exact: `watersim.py` and `src/core/sim/water.ts` agree bit for bit on the golden fixtures.
- Needs Python 3.11 or later and `prototype/requirements.txt`.

**Start from**
- `tbmap.py`: read and write the native 1.1 `.timber` format (`FORMAT.md`).
- `validate.py` and `playability.py`: every check on a map; `watersim.py`: water, moisture, contamination; `analysis.py`, `storage.py`, `calibrated.py`: measures and targets.
- `generate.py`, `terrain.py`, `vegetation.py`, `ruins.py`, `preview.py`, `batch.py`: the original generator and its tools.

**Tests** (run from the repository root)
- `python prototype/generate_test.py --seed 4242 --out out` generates and validates a map.
- `python prototype/roundtrip_test.py` reads, writes and reads maps back byte for byte.
- `python prototype/determinism_test.py` checks that the same seed gives identical bytes.
- CI runs the oracle on TypeScript maps (`.github/workflows/ci.yml`); `tests/contract/calibrated.test.ts` checks `calibrated.py` against `src/core/gen/calibrated.ts`.
