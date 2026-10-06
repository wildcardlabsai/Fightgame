#!/usr/bin/env bash
# runmatrix.sh <repo> <outdir> <years> "<scens>" "<strats>" "<seeds>" <parallel>
repo=$1; out=$2; years=$3; scens=$4; strats=$5; seeds=$6; par=${7:-3}
mkdir -p "$out"; cd "$repo"
for sc in $scens; do for st in $strats; do for sd in $seeds; do echo "$sc $st $sd"; done; done; done | xargs -P $par -L 1 bash -c 'f='"$out"'/$0_$1_$2_'"$years"'.json; [ -s $f ] || BENCH=$f SCEN=$0 STRAT=$1 SEED=$2 YEARS='"$years"' npx vitest run src/engine/sim/bench.test.ts > /dev/null 2>&1 || echo "FAILED $0 $1 $2"'
echo ALLDONE > "$out/.done"
