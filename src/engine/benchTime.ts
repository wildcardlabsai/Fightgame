/**
 * Timing helpers for the performance guards.
 *
 * Wall-clock milliseconds depend on the host: when the whole suite runs in parallel other workers steal the CPU, and a slower
 * machine fails a fixed millisecond limit even though nothing regressed. So the guards measure RELATIVE cost: each segment of
 * simulated weeks is timed against a fixed reference workload (cloning a fixed game state, the same kind of work the engine does)
 * measured immediately before and after it on the same host. The reported figure is the median over several segments of
 * (segment time ÷ reference time). A noisy segment cannot fail the test; a genuine across-the-board slowdown of the engine still does.
 */
export const now = (): number => performance.now()

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Best (smallest) wall time in ms of `n` runs: noise from other processes only ever adds time, so the minimum is the fairest sample. */
export function bestOf(fn: () => void, n: number): number {
  let best = Infinity
  for (let i = 0; i < n; i++) { const t0 = now(); fn(); best = Math.min(best, now() - t0) }
  return best
}

export interface RelativeResult { ratio: number; ratios: number[]; msPerStep: number[]; refMs: number }

/**
 * Run `step` `segments × stepsPerSegment` times (after `warmup` untimed steps).
 * `reference` is a fixed workload used to normalise for host speed.
 */
export function relativeStepCost(step: () => void, reference: () => void, opts: { warmup: number; segments: number; stepsPerSegment: number }): RelativeResult {
  for (let i = 0; i < opts.warmup; i++) step()
  for (let i = 0; i < 3; i++) reference() // warm the reference path too
  const ratios: number[] = [], ms: number[] = []
  let refAfter = bestOf(reference, 4)
  for (let k = 0; k < opts.segments; k++) {
    const refBefore = refAfter
    const t0 = now()
    for (let i = 0; i < opts.stepsPerSegment; i++) step()
    const seg = (now() - t0) / opts.stepsPerSegment
    refAfter = bestOf(reference, 4)
    ms.push(seg)
    ratios.push(seg / Math.min(refBefore, refAfter))
  }
  return { ratio: median(ratios), ratios, msPerStep: ms, refMs: refAfter }
}
