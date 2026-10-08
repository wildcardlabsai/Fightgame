import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import type { BeltCard, ContenderRow } from '../../engine/business/views'
import { useGame } from '../../store/gameStore'
import '../../styles/business54.css'

const weeks = (n: number) => `${n} week${n === 1 ? '' : 's'}`

export function TagChip({ tag }: { tag: ContenderRow['tag'] }) {
  if (!tag) return null
  return tag === 'mandatory' ? <span className="chip red">MANDATORY</span> : <span className="chip gold">ELIMINATOR</span>
}

/** The line below which a fighter is outside the challenger range. */
export function LimitMarker({ limit }: { limit: number }) {
  return <li className="bz-limit" data-testid="challenger-limit" role="separator" aria-label={`Challenger range ends after rank ${limit}`}><span>Challenger range ends here: below rank {limit}, fighters cannot challenge for this belt yet</span></li>
}

export function ContenderList({ card }: { card: BeltCard }) {
  const navigate = useGame((s) => s.navigate)
  const rows = card.contenders
  if (rows.length === 0) return <p className="dim bz-sub">No rated contenders yet.</p>
  return (
    <ol className="bz-cont" data-testid="contenders">
      {rows.map((c, i) => (
        <li key={c.id} className="bz-wrap">
          <div className={`bz-crow${c.mine ? ' mine' : ''}${c.inChallengeRange ? '' : ' outside'}`}>
            <span className="bz-rank num">#{c.rank}</span>
            <button type="button" className="bz-name" onClick={() => navigate('fighter', c.id)}>{c.name}</button>
            <span className="dim bz-rec">{c.record}</span>
            <span className="bz-tags">{c.mine && <span className="chip gold">YOURS</span>}<TagChip tag={c.tag} />{!c.inChallengeRange && <span className="chip">OUTSIDE RANGE</span>}</span>
            <span className="dim bz-why">{c.reason}</span>
          </div>
          {c.rank === card.challengerLimit && i < rows.length - 1 && <ul className="bz-lim-wrap"><LimitMarker limit={card.challengerLimit} /></ul>}
        </li>
      ))}
    </ol>
  )
}

const STATE_CHIP = { champion: ['CHAMPION', 'good'], vacant: ['VACANT', 'red'], dormant: ['DORMANT', ''] } as const

/** One belt: title, body, champion, state, orders, territory and the contenders. */
export function BeltCardView({ card }: { card: BeltCard }) {
  const navigate = useGame((s) => s.navigate)
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 700)
  const [label, tone] = STATE_CHIP[card.state]
  const listId = `bz-list-${card.body}-${card.division}`
  return (
    <div data-testid="title-row" className="bz-cell">
      <article className={`bz-card ${card.state}${card.champion?.mine ? ' mine' : ''}`} data-testid="belt-card" data-state={card.state} data-body={card.body} style={{ borderTopColor: card.colour }}>
        <header className="bz-head">
          <div><h3 className="display bz-title">{card.title}</h3><div className="dim bz-sub">{card.bodyName}</div></div>
          <span className={`chip ${tone}`}>{label}</span>
        </header>
        {card.champion ? (
          <div className="bz-champ">
            <button type="button" className="bz-champ-name display" onClick={() => navigate('fighter', card.champion!.id)}>{card.champion.name}</button>
            {card.champion.mine && <span className="chip gold">YOURS</span>}
            <div className="dim">{card.champion.record} · champion since {formatDay(card.champion.sinceDay, false)} · {weeks(card.champion.weeks)} · {card.champion.defences} defence{card.champion.defences === 1 ? '' : 's'}</div>
          </div>
        ) : <div className="bz-champ"><div className="bz-champ-name display dim">{card.state === 'vacant' ? 'VACANT' : 'NOT CONTESTED'}</div></div>}
        <p className="bz-note" data-testid="belt-note">{card.note}</p>
        {card.state === 'dormant' && <p className="dim bz-sub" data-testid="belt-pool">{card.poolEligible} eligible, rated fighter{card.poolEligible === 1 ? '' : 's'} in the division; {card.poolNeeded} needed.</p>}
        {card.mandatory && <p className="bz-order"><span className="chip red">MANDATORY</span> {card.mandatory.challenger} must be faced · {weeks(card.mandatory.dueWeeks)} left{card.mandatory.extended ? ' (extended)' : ''}</p>}
        {card.eliminator && <p className="bz-order"><span className="chip gold">ELIMINATOR</span> {card.eliminator.a} vs {card.eliminator.b} · {weeks(card.eliminator.dueWeeks)} left</p>}
        <p className="dim bz-sub" data-testid="belt-territory">Territory: {card.territory}. Challenger range: top {card.challengerLimit}.</p>
        <button type="button" className="bz-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} contenders ({card.contenders.length})</button>
        <div id={listId} hidden={!open}>{open && <ContenderList card={card} />}</div>
      </article>
    </div>
  )
}
