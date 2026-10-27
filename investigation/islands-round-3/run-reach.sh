#!/bin/sh
# Runs reach.ts for one size, seeds 1–30 in four ranges at once (at most 4 workers), into local/<tag>-<size>.json
# usage: sh run-reach.sh <size> <tag>
size=$1; tag=$2; cd "$(dirname "$0")/../.."
mkdir -p investigation/islands-round-3/local
for r in "1 8" "9 15" "16 23" "24 30"; do
  set -- $r
  npx tsx investigation/islands-round-3/reach.ts $size $1 $2 investigation/islands-round-3/local/$tag-$size-$1.json > investigation/islands-round-3/local/$tag-$size-$1.log 2>&1 &
done
wait
node -e "const fs=require('fs');const d='investigation/islands-round-3/local/';const rows=[1,9,16,24].flatMap(a=>JSON.parse(fs.readFileSync(d+'$tag-$size-'+a+'.json')));fs.writeFileSync(d+'$tag-$size.json',JSON.stringify(rows,null,1));console.log(rows.length,'rows')"
