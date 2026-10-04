#!/bin/sh
# M9b's measure through tsx (the probe runner cannot load the Rust water's binding): a frozen copy of
# src/, the rows in local/measures/<name>-<size>.jsonl.
#   DGM_CH_EXP=<switches> sh investigation/canyon-highlands-height/quick2.sh <name> [jobs] [size] [seeds] [themes]
set -e
ROOT=$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))
NAME=${1:?a name for the run}; JOBS=${2:-3}; SIZE=${3:-128}; SEEDS=${4:-1-20}; THEMES=${5:-canyon,highlands}
SNAP=$ROOT/investigation/canyon-highlands-height/local/snap-$NAME
OUT=$ROOT/investigation/canyon-highlands-height/local/measures
rm -rf "$SNAP"; mkdir -p "$SNAP/investigation/canyon-highlands-height/local" "$OUT"
cp -r "$ROOT/src" "$SNAP/src"
cp "$ROOT/investigation/canyon-highlands-height/local/measures-tsx.ts" "$SNAP/investigation/canyon-highlands-height/local/"
cp "$ROOT/package.json" "$SNAP/"
cd "$SNAP"
node --import tsx investigation/canyon-highlands-height/local/measures-tsx.ts --themes "$THEMES" --seeds "$SEEDS" --size "$SIZE" --jobs "$JOBS" --out "$OUT/$NAME-$SIZE.jsonl" > "$OUT/$NAME-$SIZE.log" 2>&1
grep "maps in" "$OUT/$NAME-$SIZE.log"
