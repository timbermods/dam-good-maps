#!/bin/sh
# Every setting at its extremes (and a few combinations), on a fixed seed list, through the sweep.
cd "$(dirname "$0")/../../.."
THEMES=${THEMES:-any,riverValley,lakeBasin}
SEEDS=${SEEDS:-1-3}
SIZE=${SIZE:-96}
for x in rl=0 rl=100 tr=0 tr=100 bl=t bl=g vt=0 vt=100 vy=0 vy=100 "vt=100&ht=10" ht=10 rv=0 rv=3 rs=s rs=b fl=t fl=l dr=s dr=p lk=0 lk=m wf=0 wf=m so=n bw=0 bw=h bd=8 bd=60 tb=0 tb=s uc=1 fd=50 fd=200 gs=s gs=b bn=20 bn=100 bb=50 bb=300 ru=25 ru=300 rc=0 gt=0 ms=4 sa=s sa=l sw=4 sw=40 sl=0 sl=800 sb=0 sb=200 sx=8 sx=60 sr=0 sr=60 d=e d=h "d=h&dr=p" "rv=3&lk=m&wf=m&fl=l&rl=100&vt=100" "rv=0&lk=0&wf=0&fl=t&rl=0&tr=0" "sm=AAAAZA" "sm=AAAAAA"; do
  npx tsx investigation/release-gate-generator/tools/extremes-run.ts "$SIZE" "$SEEDS" "$THEMES" "$x"
done
