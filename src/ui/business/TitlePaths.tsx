import { useState } from 'react'
import type { TitlePathView, TitleTarget } from '../../engine/business/views'
import type { Id } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import '../../styles/business54.css'

/** Opens the fight negotiation for a title fight the rules allow, then goes straight to it. */
export function RequestButton({ fighterId, target, small }: { fighterId: Id; target: TitleTarget; small?: boolean }) {
  const request = useGame((s) => s.requestTitleFight)
  const navigate = useGame((s) => s.navigate)
  if (!target.request) return null
  if (target.state === 'declined') return <span className="bz-declined" data-testid="request-declined"><span className="chip red">TITLE REQUEST DECLINED</span> <span className="bz-blocked dim">{target.blocked}</span></span>
  if (target.state === 'blocked') return <span className="bz-blocked dim" data-testid="request-blocked">{target.blocked?.replace(/^[^:]+: /, '')}</span>
  return (
    <button type="button" className={`btn primary${small ? ' small' : ''}`} data-testid="request-title-fight" data-body={target.body}
      onClick={() => { const id = request(fighterId, target.body); if (id) navigate('deal', id) }}>
      Request title fight ▸
    </button>
  )
}

const OUTLOOK = { strong: 'Strong case', fair: 'Fair chance', weak: 'Long shot — the champion’s camp may refuse' } as const
/** How the champion's camp is likely to see the challenge. A board-ordered fight cannot be refused. */
function Outlook({ t }: { t: TitleTarget }) {
  if (t.state !== 'ready') return null
  if (t.ordered) return <span className="chip gold bz-outlook" data-testid="outlook">Ordered by the board</span>
  return t.outlook ? <span className={`chip bz-outlook ${t.outlook}`} data-testid="outlook">{OUTLOOK[t.outlook]}</span> : null
}

const STANDING = { mandatory: 'MANDATORY', eliminator: 'ELIMINATOR', contender: 'CONTENDER', building: 'BUILDING', notEligible: 'NOT ELIGIBLE' } as const
function StandingChip({ t }: { t: TitleTarget }) {
  return <span className={`chip${t.standing === 'contender' || t.standing === 'mandatory' ? ' good' : ''}`} data-testid={`standing-${t.standing}`}>{STANDING[t.standing]}</span>
}

function TargetRow({ fighterId, t }: { fighterId: Id; t: TitleTarget }) {
  return (
    <li className={`bz-tgt ${t.state}`} data-testid="path-target" data-state={t.state}>
      <div className="bz-tgt-head">
        <b>{t.shortName}</b><span className="dim">{t.levelLabel}</span>
        {t.state === 'ready' && <span className="chip good">READY</span>}
        {t.state === 'blocked' && <span className="chip">NOT NOW</span>}{t.state === 'declined' && <span className="chip red">DECLINED</span>}<StandingChip t={t} />
        {t.state === 'building' && <span className="chip">{t.rank ? `#${t.rank}` : 'UNRATED'}</span>}
      </div>
      {t.request ? <div className="bz-tgt-line">{t.request.label} against <b>{t.request.opponentName}</b></div> : <ul className="bz-needs">{t.needs.map((n) => <li key={n}>{n}</li>)}</ul>}
      {t.request && <div className="bz-tgt-act"><RequestButton fighterId={fighterId} target={t} small /><Outlook t={t} /></div>}
    </li>
  )
}

/** One fighter: the best way forward at a glance, everything else one click away. */
export function PathCard({ view }: { view: TitlePathView }) {
  const navigate = useGame((s) => s.navigate)
  const [open, setOpen] = useState(false)
  const best = view.best
  const rest = view.targets.slice(1)
  return (
    <article className={`bz-pcard ${best?.state ?? 'none'}`} data-testid="path-card" data-ready={view.readyCount > 0 ? 'yes' : 'no'}>
      <header className="bz-phead">
        <div><button type="button" className="bz-pname display" onClick={() => navigate('fighter', view.id)}>{view.name}</button><div className="dim bz-sub">{view.division} · {view.record}</div></div>
        <span className="chip gold">{view.statusLabel}</span>
      </header>
      {view.champion && (
        <div className="bz-best champ" data-testid="path-champion">
          <div className="bz-best-t"><span className="caps">Current champion</span> <b>{view.champion.label}</b></div>
          <div className="dim">{view.champion.belts.join(' · ')} — {view.champion.road}</div>
        </div>
      )}
      {best ? (
        best.request ? (
          <div className="bz-best" data-testid="path-best">
            <div className="bz-best-t"><span className="caps">{best.state === 'ready' ? 'Can challenge now' : best.state === 'declined' ? 'Request declined' : 'Cannot ask yet'}</span> <b>{best.shortName}</b> <span className="dim">{best.levelLabel}</span> <StandingChip t={best} /></div>
            <div>{best.request.label} against <b>{best.request.opponentName}</b></div>
            <div className="bz-best-act"><RequestButton fighterId={view.id} target={best} /><Outlook t={best} /></div>
          </div>
        ) : (
          <div className="bz-best" data-testid="path-best">
            <div className="bz-best-t"><span className="caps">{best.standing === 'notEligible' ? 'Long-term goal' : 'Next belt'}</span> <b>{best.shortName}</b> <span className="dim">{best.levelLabel}</span> <StandingChip t={best} /> <span className="chip">{best.rank ? `#${best.rank}` : 'UNRATED'}</span></div>
            <ul className="bz-needs">{best.needs.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )
      ) : <p className="dim bz-sub" data-testid="path-none">{view.next}</p>}
      {rest.length > 0 && <button type="button" className="bz-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Other belts'} ({rest.length})</button>}
      {open && <ul className="bz-tgts">{rest.map((t) => <TargetRow key={t.body} fighterId={view.id} t={t} />)}</ul>}
    </article>
  )
}

export function MyFighterPaths({ paths }: { paths: TitlePathView[] }) {
  if (paths.length === 0) return <p className="empty" data-testid="title-paths-empty">You have no active fighters. Sign some to start a title path.</p>
  const ready = paths.filter((p) => p.readyCount > 0)
  const building = paths.filter((p) => p.readyCount === 0)
  return (
    <section data-testid="title-paths" aria-label="Your fighters' title paths">
      <p className="bz-lead" data-testid="paths-summary">{ready.length > 0 ? <><b>{ready.length}</b> of your fighters can ask for a title fight right now.</> : 'None of your fighters can ask for a title fight yet. Each card shows the next belt and what it takes.'}</p>
      {ready.length > 0 && <><h2 className="m-sec display">Ready to ask</h2><div className="bz-pgrid">{ready.map((v) => <PathCard key={v.id} view={v} />)}</div></>}
      {building.length > 0 && <><h2 className="m-sec display">Building towards a title</h2><div className="bz-pgrid">{building.map((v) => <PathCard key={v.id} view={v} />)}</div></>}
    </section>
  )
}
