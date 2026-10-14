#!/bin/sh
# Pictures of seeds 1-30 at one size, four at a time: sh run-look.sh <size> <outdir>
size=$1; out=$2; cd "$(dirname "$0")/../.."
for r in "1 8" "9 15" "16 23" "24 30"; do set -- $r; npx tsx investigation/islands-round-3/look.ts $size $1 $2 $out > $out-$1.log 2>&1 & done
wait; cat $out-*.log
