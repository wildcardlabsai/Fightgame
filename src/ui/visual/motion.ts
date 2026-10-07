import { useEffect, useRef, useState } from 'react'

/** True when the player asked their system for less motion. Shake, large transitions and fast counters become plain state changes. */
export function prefersReducedMotion(): boolean {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false }
}
export function useReducedMotion(): boolean {
  const [r, setR] = useState(prefersReducedMotion)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setR(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return r
}

/** Eases a displayed number towards `target`. Reduced motion (or ms = 0): the number simply changes. Never touches game state. */
export function useCountUp(target: number, ms = 700, from?: number): number {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(from ?? target)
  const prev = useRef(from ?? target)
  useEffect(() => {
    if (reduced || ms <= 0 || prev.current === target) { prev.current = target; setShown(target); return }
    const start = performance.now(), a = prev.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(a + (target - a) * e))
      if (k < 1) raf = requestAnimationFrame(tick); else prev.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); prev.current = target }
  }, [target, ms, reduced])
  return shown
}
