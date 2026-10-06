import type { CSSProperties, ReactNode } from 'react'
import { nation } from '../../data/nations'
import { fighterRating } from '../../engine/fighters'
import type { Fighter, Promotion } from '../../engine/types'
import { ratingTier } from '../format'
import { EmblemGlyph } from './Icons'

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

const AVATAR_COLORS = ['#8c1b24', '#1f4f9a', '#2a7a56', '#7a4a1c', '#5b3a8c', '#3a5f6e', '#8a6a1e']

export function Avatar({ f, large }: { f: Pick<Fighter, 'firstName' | 'lastName' | 'id'>; large?: boolean }) {
  let h = 0
  for (const ch of f.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length]
  return (
    <span className={`avatar${large ? ' lg' : ''}`} style={{ background: `linear-gradient(135deg, ${bg}, #101015)` }} aria-hidden>
      {f.firstName[0]}{f.lastName[0]}
    </span>
  )
}

export function Rating({ f, value }: { f?: Pick<Fighter, 'attributes'>; value?: number }) {
  const r = value ?? (f ? fighterRating(f) : 0)
  return <span className={`rating t${ratingTier(r)}`} title="Overall rating">{r}</span>
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
