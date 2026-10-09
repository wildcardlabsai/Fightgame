import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import type { BeltCard, ContenderRow, TitlePathView } from '../../engine/business/views'
import { RequestButton } from './TitlePaths'
import { useGame } from '../../store/gameStore'
import '../../styles/business54.css'

const weeks = (n: number) => `${n} week${n === 1 ? '' : 's'}`

const STATUS_LABEL = { mandatory: 'MANDATORY', eliminator: 'ELIMINATOR', contender: 'CONTENDER', building: 'BUILDING', notEligible: 'NOT ELIGIBLE', holder: 'HOLDS A WORLD BELT' } as const
/** Where a fighter stands as a title challenger, and (when not yet a contender) the next credible step. */
export function StatusChip({ row }: { row: ContenderRow }) {
  if (row.status === 'mandatory' || row.status === 'eliminator') return null // shown by the order chip
  return <span className={`chip${row.status === 'contender' ? ' good' : ''}`} title={row.step ?? ''} data-testid={`status-${row.status}`}>{STATUS_LABEL[row.status]}{row.step ? ` — ${row.step.toLowerCase()}` : ''}</span>
}

export function TagChip({ tag }: { tag: ContenderRow['tag'] }) {
  if (!tag) return null
  return tag === 'mandatory' ? <span className="chip red">MANDATORY</span> : <span className="chip gold">ELIMINATOR</span>
}

/** The line below which a fighter is outside the challenger range. */
export function LimitMarker({ limit }: { limit: number }) {
  return <li className="bz-limit" data-testid="challenger-limit" role="separator" aria-label={`Challenger range ends after rank ${limit}`}><span>Challenger range ends here: below rank {limit}, fighters cannot challenge for this belt yet</span></li>
}

const SHOWN = 5

export function ContenderList({ card, paths }: { card: BeltCard; paths?: Map<string, TitlePathView> }) {
  const navigate = useGame((s) => s.navigate)
  const [all, setAll] = useState(false)
  const rows = card.contenders
  if (rows.length === 0) return <p className="dim bz-sub">No rated contenders yet.</p>
  const shown = all ? rows : rows.slice(0, Math.max(SHOWN, 0))
  return (
    <>
      <ol className="bz-cont" data-testid="contenders">
        {shown.map((c, i) => {
          const target = c.mine ? paths?.get(c.id)?.targets.find((t) => t.body === card.body && t.state === 'ready') : undefined
          return (
            <li key={c.id} className="bz-wrap">
              <div className={`bz-crow${c.mine ? ' mine' : ''}${c.inChallengeRange ? '' : ' outside'}`}>
                <span className="bz-rank num">#{c.rank}</span>
                <span className="bz-who"><button type="button" className="bz-name" onClick={() => navigate('fighter', c.id)}>{c.name}</button> <span className="dim bz-rec">{c.record}</span>{c.mine && <span className="chip gold">YOURS</span>}<TagChip tag={c.tag} /><StatusChip row={c} /></span>
                {target ? <span className="bz-req"><RequestButton fighterId={c.id} target={target} small /></span> : null}
                <span className="dim bz-why" title={c.reason}>{c.reason}</span>
              </div>
              {c.rank === card.challengerLimit && i < shown.length - 1 && <ul className="bz-lim-wrap"><LimitMarker limit={card.challengerLimit} /></ul>}
            </li>
          )
        })}
      </ol>
      {rows.length > SHOWN && <button type="button" className="bz-toggle" onClick={() => setAll(!all)}>{all ? 'Show top 5 only' : `Show all ${rows.length}`}</button>}
    </>
  )
}

const STATE_CHIP = { champion: ['CURRENT CHAMPION', 'good'], vacant: ['VACANT', 'red'], dormant: ['NOT CONTESTED', ''] } as const

/** One belt: title, body, champion, state, orders, territory and the contenders. */
export function BeltCardView({ card, paths }: { card: BeltCard; paths?: Map<string, TitlePathView> }) {
  const navigate = useGame((s) => s.navigate)
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 700 || card.contenders.some((c) => c.mine))
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
            <div className="dim" title={`Champion since ${formatDay(card.champion.sinceDay, false)}`}>{card.champion.record} · {weeks(card.champion.weeks)} as champion · {card.champion.defences} defence{card.champion.defences === 1 ? '' : 's'}</div>
          </div>
        ) : <div className="bz-champ"><div className="bz-champ-name display dim">{card.state === 'vacant' ? 'VACANT' : 'NOT CONTESTED'}</div></div>}
        {(card.state !== 'champion') && <p className="bz-note" data-testid="belt-note">{card.note}</p>}
        {card.state === 'dormant' && <p className="dim bz-sub" data-testid="belt-pool">{card.poolEligible} eligible, rated fighter{card.poolEligible === 1 ? '' : 's'} in the division; {card.poolNeeded} needed.</p>}
        {card.mandatory && <p className="bz-order"><span className="chip red">MANDATORY</span> {card.mandatory.challenger} must be faced · {weeks(card.mandatory.dueWeeks)} left{card.mandatory.extended ? ' (extended)' : ''}</p>}
        {card.eliminator && <p className="bz-order"><span className="chip gold">ELIMINATOR</span> {card.eliminator.a} vs {card.eliminator.b} · {weeks(card.eliminator.dueWeeks)} left</p>}
        <p className="dim bz-sub bz-meta" data-testid="belt-territory">{card.territory} · top {card.challengerLimit} can challenge</p>
        {card.history.length > 0 && (
          <details className="bz-hist" data-testid="reign-history"><summary>View reign history ({card.history.length})</summary>
            <ul className="bz-hlist">{card.history.map((r, i) => <li key={`${r.id}${r.from}${i}`}><span className="chip">FORMER CHAMPION</span> <b>{r.name}</b> <span className="dim">{formatDay(r.from, false)}–{formatDay(r.to, false)} · {r.defences} def. · {r.how}</span></li>)}</ul>
          </details>
        )}
        <button type="button" className="bz-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} contenders ({card.contenders.length})</button>
        <div id={listId} hidden={!open}>{open && <ContenderList card={card} paths={paths} />}</div>
      </article>
    </div>
  )
}
