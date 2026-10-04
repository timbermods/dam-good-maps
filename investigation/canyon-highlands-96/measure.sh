#!/bin/sh
# Canyon and Highlands only, M9b's own measure (investigation/m9b/measures.ts) from a frozen copy of src/:
#   sh investigation/canyon-highlands-96/measure.sh <name> [jobs]
# 96²: seeds 1-30 (the contact sheets); 128² and 256²: seeds 1-20. Results in local/measures/<name>-<size>.jsonl
# (gitignored, D195). Read them with M9b's share.py / compare.py after linking or copying them into
# investigation/m9b/local/measures/, or with report.py beside this script.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))
NAME=${1:?a name for the run}
JOBS=${2:-3}
SNAP=$ROOT/investigation/canyon-highlands-96/local/snap-$NAME
OUT=$ROOT/investigation/canyon-highlands-96/local/measures
rm -rf "$SNAP"
mkdir -p "$SNAP/investigation/m9b" "$SNAP/investigation/probe" "$OUT"
cp -r "$ROOT/src" "$SNAP/src"
cp "$ROOT/investigation/m9b/measures.ts" "$SNAP/investigation/m9b/"
cp "$ROOT/package.json" "$SNAP/"
sed "s#path.join(__dirname, 'node_modules')#'$ROOT/investigation/probe/node_modules'#" "$ROOT/investigation/probe/run.cjs" > "$SNAP/investigation/probe/run.cjs"
cd "$SNAP"
node investigation/probe/run.cjs ../m9b/measures.ts --themes canyon,highlands --seeds 1-30 --size 96 --jobs "$JOBS" --out "$OUT/$NAME-96.jsonl" > "$OUT/$NAME-96.log" 2>&1
for s in 128 256; do
  node investigation/probe/run.cjs ../m9b/measures.ts --themes canyon,highlands --seeds 1-20 --size $s --jobs "$JOBS" --out "$OUT/$NAME-$s.jsonl" > "$OUT/$NAME-$s.log" 2>&1
done
echo "finished: $OUT/$NAME-{96,128,256}.jsonl"
