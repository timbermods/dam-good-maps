#!/bin/bash
# usage: cap.sh <tag> <timber-prefix> seeds... ; one low frame per map into .scratch/cap/<tag>-<seed>-low.jpg
cd "$(dirname "$0")/.."
tag=$1; pre=$2; shift 2
for s in "$@"; do
  f=$(ls .scratch/out/${pre}*-$s.timber | head -1)
  timeout 900 npx tsx tools/showcase/capture.ts --project $f --shots .scratch/shots-low.json --out .scratch/cap --name $tag-$s --port 4397 > .scratch/cap/$tag-$s.log 2>&1
done
