import type { ReactNode } from 'react'
import type { FighterView } from '../../engine/view'
import { Flag } from '../components/Bits'
import { FormDots } from '../components/FightBits'
import { FighterPortrait } from './FighterPortrait'

/** The public facts a card needs. FighterView and the poster's fighter reference both fit. */
export interface CardFighter { id: string; firstName: string; lastName: string; name: string; nickname?: string | null; division?: string; record: string; nationKey?: string; age?: number; style?: string; form?: ('W' | 'L' | 'D')[] }
export const cardFighter = (v: FighterView): CardFighter => ({ id: v.id, firstName: v.firstName, lastName: v.lastName, name: v.name, nickname: v.nickname, division: v.division, record: v.recordText, nationKey: v.nationKey, age: v.age, style: v.style, form: v.form })

/** Reusable fighter card: compact (lists), standard (cards/grids), large (profile/headline). */
export function FighterCard({ f, size = 'standard', side, badge, meta, onClick, children, eager }: { f: CardFighter; size?: 'compact' | 'standard' | 'large'; side?: 'a' | 'b'; badge?: ReactNode; meta?: ReactNode; onClick?: () => void; children?: ReactNode; eager?: boolean }) {
  const pSize = size === 'compact' ? 'thumb' : size === 'standard' ? 'card' : 'large'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`v-fcard ${size}${side ? ` side-${side}` : ''}${onClick ? ' clickable' : ''}`} {...(onClick ? { onClick, type: 'button' as const } : {})} data-fighter-id={f.id}>
      <FighterPortrait f={f} size={pSize} eager={eager} />
      <span className="v-fcard-body">
        {f.nickname && size !== 'compact' && <span className="v-fcard-nick">“{f.nickname}”</span>}
        <span className="v-fcard-name display">{size === 'compact' ? f.name : <>{f.firstName} <b>{f.lastName}</b></>}</span>
        <span className="v-fcard-sub">
          <span className="num">{f.record}</span>
          {f.nationKey && <Flag code={f.nationKey} />}
          {f.division && size !== 'compact' && <span className="dim">{f.division}</span>}
          {f.age !== undefined && size === 'large' && <span className="dim">{f.age}y</span>}
        </span>
        {meta}
        {size === 'large' && f.form && <span className="v-fcard-form"><FormDots form={f.form} /></span>}
        {children}
      </span>
      {badge && <span className="v-fcard-badge">{badge}</span>}
    </Tag>
  )
}
