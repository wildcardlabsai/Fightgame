/**
 * Seeded pseudo-random number generator (mulberry32).
 * The full generator state is a single 32-bit integer, so it can be stored
 * inside GameState and a reloaded game continues the exact same sequence.
 */

export function hashSeed(seed: string): number {
  // FNV-1a
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export class Rng {
  state: number

  constructor(state: number) {
    this.state = state | 0
  }

  static fromSeed(seed: string): Rng {
    return new Rng(hashSeed(seed))
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  /** Normal distribution via Box–Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12)
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** Normal sample clamped into [min, max]. */
  clampedNormal(mean: number, sd: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, this.normal(mean, sd)))
  }

  /** Pick by relative weight. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0
    for (const it of items) total += weightOf(it)
    let r = this.next() * total
    for (const it of items) {
      r -= weightOf(it)
      if (r <= 0) return it
    }
    return items[items.length - 1]
  }

  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
}
