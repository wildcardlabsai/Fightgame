/** A big ranking numeral (or C for champion), in the same cut-corner tile used on posters. */
export function RankMark({ label, champion, size = 'md' }: { label: string; champion?: boolean; size?: 'sm' | 'md' }) {
  return <span className={`rk-mark ${size}${champion ? ' champ' : ''}`} aria-label={champion ? 'Champion' : `Ranked ${label}`}>{champion ? 'C' : label}</span>
}
