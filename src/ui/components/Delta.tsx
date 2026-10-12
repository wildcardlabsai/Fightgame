/** A small ▲/▼ with the change. Colour is never the only signal: the arrow and the signed number say it too. */
export function Delta({ d, fmt = (n: number) => String(Math.abs(Math.round(n))), good = 'up' }: { d: number | null; fmt?: (n: number) => string; good?: 'up' | 'down' }) {
  if (d === null || Math.abs(d) < 0.5) return null
  const up = d > 0, ok = good === 'up' ? up : !up
  return <span className={`delta ${ok ? 'good' : 'bad'}`} title={`${up ? 'Up' : 'Down'} ${fmt(d)} since last week`}><span aria-hidden="true">{up ? '▲' : '▼'}</span>{fmt(d)}<span className="sr-only">{up ? ' up' : ' down'} since last week</span></span>
}
