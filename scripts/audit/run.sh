#!/usr/bin/env bash
# Run a batch of audit worlds in parallel: scripts/audit/run.sh <outdir> <years> "<strategies>" "<seeds>" [difficulty]
out=$1; years=$2; strats=$3; seeds=$4; diff=${5:-standard}
mkdir -p "$out"
for st in $strats; do for sd in $seeds; do echo "$st $sd"; done; done | xargs -P 4 -L 1 bash -c 'BENCH='"$out"'/$0_$1_'"$years"'.json SEED=$1 YEARS='"$years"' STRAT=$0 DIFF='"$diff"' npx vitest run src/engine/sim/bench.test.ts > /dev/null 2>&1 || echo "FAILED $0 $1"'
