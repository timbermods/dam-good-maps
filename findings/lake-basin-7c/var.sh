#!/bin/bash
# usage: var.sh <tag> [seeds...] ; seeds in parallel (default 1-6) with the current env
cd "$(dirname "$0")/.."
tag=$1; shift; seeds=${@:-1 2 3 4 5 6}
mkdir -p .scratch/out
rm -f .scratch/out/lb-$tag-*.json .scratch/out/lb-$tag.all
for s in $seeds; do
  npx tsx .scratch/gm.ts lakeBasin $s 256 ${DIFF:-normal} --timber .scratch/out/lb-$tag-$s.timber > .scratch/out/lb-$tag-$s.json 2>.scratch/out/lb-$tag-$s.err &
done
wait
cat .scratch/out/lb-$tag-*.json | grep '^{' > .scratch/out/lb-$tag.all
