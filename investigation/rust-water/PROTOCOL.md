# Lossless batch boundary (DRW1)

All integers are little-endian u32; floats are little-endian IEEE binary64, including signed
zero. No JSON decimal conversion enters the numerical boundary. This is an internal protocol
for validated WaterModel inputs, not a parser for untrusted uploads.

Header: magic `0x31575244`, W, H, flags (game=1, edgeSpill=2, damPresent=4), emitterCount.
Then floor[N], optional dam[N], initial depth[N], contamination[N], out[4N]. Each emitter:
cellCount, cells[cellCount], strength:f64, contamination:f64, anchor:u32 (0xffffffff = no seep),
off:f64, on:f64. Initial Dold and ticks are zero, as in WaterSim's constructor.

Commands: count:u32, then each command. Opcode 0 runs ticks:u32 at scale:f64; followed by
each emitter's strength, contamination, off, on (all f64), then floorChangeCount and ordered
(index:u32, value:f64) pairs. Opcode 2 is identical but omits its output checkpoint.
Opcode 1 settles: days:f64, checkEvery:u32, tol:f64, movedShare:f64, untilSteady:u32,
sealedCount:u32, sealed[sealedCount]:u32. Defaults are six days, 128, .005, .005, false, [].
The TypeScript encoder/decoder in protocol.ts is the executable format specification.

Output: checkpointCount:u32, then (byteLength:u32, checkpointBytes) for each captured command.
A checkpoint contains ticks, settled, steadyTicks (0xffffffff = absent), N (all u32),
volume:f64, depth[N], contamination[N], Dold[N], out[4N] (all f64), saturation[N]:u8,
seepOn[emitterCount]:u8. The comparison checks **every byte**, including stop metadata,
momentum, saturation, hysteresis and volume. SHA-256 binds saved evidence to those same bytes;
it does not replace within-process byte comparisons.

`water-batch input.in output.bin` executes one job.
`water-batch --batch manifest.tsv 16` executes independent jobs on 16 OS threads. Each
manifest line is absolute-input-path, TAB, absolute-output-path. Output files belong to
their own job; neither execution order nor worker count affects a numerical reduction.
`water-batch --bench input.in output.bin 3` warms once, then measures three fresh decode,
construct, simulate, serialize executions. File I/O and process startup are outside those
per-case samples; full-batch measurements include them.
