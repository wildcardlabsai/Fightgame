import type { FighterView } from '../../engine/view'
import { STAGE_LABEL } from '../../engine/systems/contracts'
import { titleStanding } from '../../engine/business/titleStanding'
import { useGame } from '../../store/gameStore'
import { useMemo } from 'react'
import { FormDots } from './FightBits'
import { StandingChip } from './TitleStanding'

/**
 * One consistent line of status for a fighter, always in the same order: condition · form · contract (yours) · title standing.
 * Colour carries a single meaning each (green fine, amber needs attention, red problem, gold title), and every chip also says it in words.
 */
export function StatusStrip({ v, compact = false }: { v: FighterView; compact?: boolean }) {
  const game = useGame((s) => s.game)!
  const st = useMemo(() => titleStanding(game, v.id), [game, v.id])
  const av = v.availability
  const bad = av.status !== 'available'
  const c = v.contract.kind === 'own' ? v.contract : null
  return (
    <span className={`status-strip${compact ? ' compact' : ''}`} data-testid="status-strip">
      <span className={`ss-chip ${bad ? 'warn' : 'good'}`}><i aria-hidden="true">{bad ? '!' : '✓'}</i>{av.label}{av.weeks ? ` · ${av.weeks}w` : ''}</span>
      {v.form.length > 0 && <span className="ss-form" title="Recent form, oldest to newest"><FormDots form={v.form} /></span>}
      {c && <span className={`ss-chip ${c.stage === 'healthy' ? 'dim' : c.stage === 'expiring' || c.stage === 'expired' ? 'bad' : 'warn'}`} title="Contract">{c.stage === 'healthy' ? `${c.weeksLeft}w contract` : `${STAGE_LABEL[c.stage]} · ${c.weeksLeft}w`}</span>}
      <StandingChip s={st} />
    </span>
  )
}
