#!/bin/sh
# A round of random sequences: seeds × themes × modes, three at a time (the machine is shared).
# Usage: [SIDE=96] sh investigation/core-hunt-2/tools/batch.sh <round> <steps> <seeds...>
round=$1; steps=$2; shift 2
side=${SIDE:-64}
out=investigation/core-hunt-2/local/round-$round
mkdir -p $out
for seed in "$@"; do
  for spec in "riverValley live" "highlands frozen" "canyon live" "delta import" "lakeBasin frozen" "islands live" "any live" "highlands live"; do
    set -- $spec
    echo "npx tsx investigation/core-hunt-2/tools/hunt.ts $seed $steps $side $1 $2 > $out/$seed-$side-$1-$2.txt 2>&1"
  done
done | xargs -P 3 -I{} sh -c "{}"
grep -h "problems\|  [0-9]*×" $out/*.txt
