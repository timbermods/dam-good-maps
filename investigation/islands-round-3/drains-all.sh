#!/bin/sh
# drains.ts over seeds 1-30 at one size, four at a time, the counts summed: sh drains-all.sh <size>
size=$1; cd "$(dirname "$0")/../.."
for r in "1 8" "9 15" "16 23" "24 30"; do set -- $r; DGM_WHY=1 npx tsx investigation/islands-round-3/drains.ts $size $1 $2 2>/dev/null | grep '"lands"' & done | node -e "
const L=require('fs').readFileSync(0,'utf8').trim().split('\n').map(JSON.parse);const s={lands:0,drained:0,why:{}};
for(const o of L){s.lands+=o.lands;s.drained+=o.drained;for(const[k,v]of Object.entries(o.why))s.why[k]=(s.why[k]||0)+v}
s.kept=s.why.kept||0;console.log(JSON.stringify(s))"
