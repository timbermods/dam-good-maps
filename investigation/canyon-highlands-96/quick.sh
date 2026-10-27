#!/bin/sh
# The quick check: Canyon and Highlands, seeds 1-20 at 96², from a frozen copy of src/ (M9b's measure).
#   DGM_CH_EXP=<switches> sh investigation/canyon-highlands-96/quick.sh <name> [jobs] [size] [seeds]
set -e
ROOT=$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))
NAME=${1:?a name for the run}
JOBS=${2:-3}
SIZE=${3:-96}
SEEDS=${4:-1-20}
THEMES=${5:-canyon,highlands}
SNAP=$ROOT/investigation/canyon-highlands-96/local/snap-$NAME
OUT=$ROOT/investigation/canyon-highlands-96/local/measures
rm -rf "$SNAP"
mkdir -p "$SNAP/investigation/m9b" "$SNAP/investigation/probe" "$OUT"
cp -r "$ROOT/src" "$SNAP/src"
cp "$ROOT/investigation/m9b/measures.ts" "$SNAP/investigation/m9b/"
cp "$ROOT/package.json" "$SNAP/"
sed "s#path.join(__dirname, 'node_modules')#'$ROOT/investigation/probe/node_modules'#" "$ROOT/investigation/probe/run.cjs" > "$SNAP/investigation/probe/run.cjs"
cd "$SNAP"
node investigation/probe/run.cjs ../m9b/measures.ts --themes "$THEMES" --seeds "$SEEDS" --size "$SIZE" --jobs "$JOBS" --out "$OUT/$NAME-$SIZE.jsonl" > "$OUT/$NAME-$SIZE.log" 2>&1
grep "maps in" "$OUT/$NAME-$SIZE.log"
