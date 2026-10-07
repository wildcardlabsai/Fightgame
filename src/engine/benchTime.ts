/**
 * Timing helpers for the performance guards. Wall-clock time is a poor yardstick when the whole suite runs in parallel
 * (other workers steal the CPU), so guards use this process's own CPU time and compare the MEDIAN of several segments:
 * a single noisy segment cannot fail the test, but a genuine across-the-board slowdown still does.
 */
export const cpuMs = (): number => { const u = process.cpuUsage(); return (u.user + u.system) / 1000 }

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Run `step` `segments × weeksPerSegment` times (after `warmup` untimed steps) and return the median per-step CPU ms of the segments. */
export function medianStepMs(step: () => void, opts: { warmup: number; segments: number; stepsPerSegment: number }): { median: number; segments: number[] } {
  for (let i = 0; i < opts.warmup; i++) step()
  const seg: number[] = []
  for (let k = 0; k < opts.segments; k++) {
    const t0 = cpuMs()
    for (let i = 0; i < opts.stepsPerSegment; i++) step()
    seg.push((cpuMs() - t0) / opts.stepsPerSegment)
  }
  return { median: median(seg), segments: seg }
}
