#!/bin/sh
# The 840-map measure: seeds 1-40 of the seven themes at 96², 128² and 256² (measures.ts), run from a
# frozen copy of src/ so edits made during the run don't mix in.
#
#   sh investigation/m9b/measure.sh <name> [jobs] [seeds]      (jobs 6, seeds 1-40)
#
# Results: investigation/m9b/local/measures/<name>-<size>.jsonl, one line per map (gitignored, D195).
# Read them with summary.py, share.py and compare.py beside this script.
# Once per machine: npm ci && npm --prefix investigation/probe ci
# About 27 minutes with 6 jobs on the machine M9b was built on (5, 7 and 15 for the three sizes).
set -e
ROOT=$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))
NAME=${1:?a name for the run}
JOBS=${2:-6}
SEEDS=${3:-1-40}
SNAP=$ROOT/investigation/m9b/local/snap-$NAME
OUT=$ROOT/investigation/m9b/local/measures
rm -rf "$SNAP"
mkdir -p "$SNAP/investigation/m9b" "$SNAP/investigation/probe" "$OUT"
cp -r "$ROOT/src" "$SNAP/src"
cp "$ROOT/investigation/m9b/measures.ts" "$SNAP/investigation/m9b/"
cp "$ROOT/package.json" "$SNAP/"
sed "s#path.join(__dirname, 'node_modules')#'$ROOT/investigation/probe/node_modules'#" "$ROOT/investigation/probe/run.cjs" > "$SNAP/investigation/probe/run.cjs"
cd "$SNAP"
for s in 96 128 256; do
  node investigation/probe/run.cjs ../m9b/measures.ts --seeds "$SEEDS" --size $s --jobs "$JOBS" --out "$OUT/$NAME-$s.jsonl" > "$OUT/$NAME-$s.log" 2>&1
done
echo "finished: $OUT/$NAME-{96,128,256}.jsonl"
