import type { CSSProperties, ReactNode } from 'react'
import { nation } from '../../data/nations'
import type { Promotion } from '../../engine/types'
import { EmblemGlyph } from './Icons'
import { FighterPortrait } from '../visual/FighterPortrait'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {right && <div className="right">{right}</div>}
      </div>
      {children}
    </section>
  )
}

export function Flag({ code }: { code: string }) {
  const n = nation(code)
  return <span className="flag" title={n?.name}>{n?.code ?? code}</span>
}

/** Small fighter picture for lists and cards: the real thumbnail when one exists, otherwise a division-coloured silhouette with initials. */
export function Avatar({ f, large }: { f: { firstName: string; lastName: string; id: string; division?: string }; large?: boolean }) {
  return <FighterPortrait f={f} size={large ? 'card' : 'thumb'} />
}

export function Meter({ value, tone, potential, label }: { value: number; tone?: 'good' | 'gold' | 'blue'; potential?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={`meter ${tone ?? ''}`} role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${v}%` }} />
      {potential !== undefined && <span className="pot" style={{ left: `${Math.min(99, potential)}%` }} title={`Potential ${potential}`} />}
    </div>
  )
}

export function PromoLogo({ p, size = 40 }: { p: Pick<Promotion, 'logo'>; size?: number }) {
  const style: CSSProperties = {
    width: size, height: size, color: '#0a0a0c', background: p.logo.color, display: 'grid', placeItems: 'center',
    clipPath: 'polygon(50% 0, 100% 18%, 100% 70%, 50% 100%, 0 70%, 0 18%)', flex: 'none', position: 'relative',
  }
  return (
    <span style={style} aria-hidden>
      <span style={{ display: 'grid', placeItems: 'center', lineHeight: 1, marginTop: -size * 0.04 }}>
        <EmblemGlyph emblem={p.logo.emblem} size={size * 0.46} />
        <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: size * 0.28, fontStyle: 'italic', marginTop: -2 }}>{p.logo.monogram}</span>
      </span>
    </span>
  )
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return <span className="gold" aria-label={`${n} of ${max}`}>{'★'.repeat(n)}<span style={{ color: 'var(--faint)' }}>{'★'.repeat(max - n)}</span></span>
}

export function RiskChip({ risk }: { risk: 'safe' | 'watch' | 'highRisk' }) {
  const t = { safe: ['SAFE', 'good'], watch: ['WATCH', 'gold'], highRisk: ['HIGH RISK', 'red'] }[risk]
  return <span className={`chip ${t[1]}`} title="Based on the forecast range for this show's profit">{t[0]}</span>
}

