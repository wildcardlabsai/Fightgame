import { useMemo } from 'react'
import { Flag } from '../components/Bits'
import { divisionsList, defaultDivision, rankingOrgs, rankingView } from '../../engine/media/views'
import { beltsHeld, currentTitleLabel, divisionOptions, myTitlePaths, titleBoard, titleLevels, type BeltCard } from '../../engine/business/views'
import { levelOf } from '../../engine/business/titleDefs'
import type { TitleLevel } from '../../engine/business/titleDefs'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { RankMark } from '../media/RankMark'
import { BeltCardView, LimitMarker, TagChip } from '../business/Boards'
import { MyFighterPaths, RequestButton } from '../business/TitlePaths'
import '../../styles/business54.css'

/** Rankings (sanctioning bodies, media and index lists, grouped by level) and Titles (the belts of each level). */
export function RankingsScreen({ mode, param }: { mode: 'rankings' | 'titles'; param?: string }) {
  return mode === 'rankings' ? <Rankings param={param} /> : <Titles param={param} />
}

type GroupId = TitleLevel | 'media'
const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'world', label: 'World' }, { id: 'european', label: 'European' }, { id: 'domestic', label: 'Domestic' }, { id: 'area', label: 'Area' }, { id: 'media', label: 'Media & index' },
]

function Rankings({ param }: { param?: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const orgs = useMemo(() => rankingOrgs(), [])
  const divisions = useMemo(() => divisionsList(), [])
  const groupOf = (o: { id: string; sanctions: boolean }): GroupId => (o.sanctions ? levelOf(o.id) : 'media')
  const [orgParam, divParam] = (param ?? '').split('/')
  const org = orgs.find((o) => o.id === orgParam) ?? orgs.find((o) => groupOf(o) === orgParam) ?? orgs.find((o) => o.id === 'ringside') ?? orgs[0]
  const group = groupOf(org)
  const inGroup = orgs.filter((o) => groupOf(o) === group)
  const division = (divisions.find((d) => d.id === divParam)?.id ?? defaultDivision(game))
  const view = useMemo(() => rankingView(game, org.id, division), [game, org.id, division])
  const belt = useMemo<BeltCard | null>(() => (org.sanctions ? titleBoard(game, levelOf(org.id), division).find((b) => b.body === org.id) ?? null : null), [game, org, division])
  const go = (o: string, d: string) => navigate('rankings', `${o}/${d}`)
  const byId = new Map((belt?.contenders ?? []).map((c) => [c.id, c]))
  const paths = useMemo(() => new Map(myTitlePaths(game).map((p) => [p.id, p])), [game])
  const rows = view?.rows ?? []
  const hasChampRow = rows.some((r) => r.champion)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Rankings</h1><p className="sub">Sanctioning bodies decide who can challenge for their belts. Media lists and the index are opinion.</p></div></div>
      <div className="bz-seg" role="tablist" aria-label="Ranking level" data-testid="rank-groups">
        {GROUPS.map((g) => {
          const first = orgs.find((o) => groupOf(o) === g.id)
          return <button key={g.id} role="tab" aria-selected={g.id === group} className={`bz-segbtn${g.id === group ? ' on' : ''}`} data-testid={`rank-group-${g.id}`} onClick={() => first && go(first.id, division)}>{g.label}</button>
        })}
      </div>
      <div className="bz-seg sub" role="tablist" aria-label="Ranking list">
        {inGroup.map((o) => <button key={o.id} role="tab" aria-selected={o.id === org.id} className={`bz-segbtn${o.id === org.id ? ' on' : ''}`} onClick={() => go(o.id, division)} data-testid={`rank-org-${o.id}`}>{o.shortName}</button>)}
      </div>
      <div className="rk-controls">
        <label htmlFor="rk-div" className="caps">Division</label>
        <select id="rk-div" className="select" value={division} onChange={(e) => go(org.id, e.target.value)} data-testid="rank-division">
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      {view && (
        <div className="rk-wrap">
          <div className="rk-head" style={{ borderColor: view.colour }}>
            <div className="rk-top"><div className="display rk-name">{view.name}</div>{view.sanctions && <span className="chip gold">SANCTIONS TITLES</span>}</div>
            <p className="bz-sub dim" data-testid="rank-eligibility">
              {belt ? <>{belt.title} · only the top {belt.challengerLimit} can challenge the champion. {belt.state === 'dormant' ? belt.note : `${belt.poolEligible} eligible fighters.`}</> : 'An opinion list: no belt is attached to it.'}
              {' '}Updated {view.updated ? formatDay(view.updated) : '—'}.
            </p>
            <details className="rk-how"><summary>How this list works</summary><ul className="rk-method">{view.method.map((m) => <li key={m}>{m}</li>)}</ul></details>
          </div>
          {belt && !hasChampRow && (
            <div className="bz-vacant" data-testid="rank-vacant">
              <span className="rk-mark">C</span>
              <div><b className="display">{belt.state === 'dormant' ? 'Not contested' : 'Vacant'}</b><div className="dim">{belt.note}</div></div>
            </div>
          )}
          {rows.length === 0 ? <p className="empty" data-testid="rank-empty">Not enough fighters with five or more fights to rank this division yet.</p> : (
            <ol className="rk-list" data-testid="rank-list">
              {rows.map((r) => {
                const c = byId.get(r.id)
                const held = r.champion ? beltsHeld(game, r.id) : []
                const label = r.champion ? (currentTitleLabel(game, r.id) ?? 'Champion') : ''
                const target = r.mine && belt ? paths.get(r.id)?.targets.find((t) => t.body === belt.body && t.state === 'ready') : undefined
                return (
                  <li key={r.id} className="bz-li">
                    <div className={`rk-row${r.champion ? ' champ' : ''}${r.mine ? ' mine' : ''}${c && !c.inChallengeRange ? ' outside' : ''}`} data-testid="rank-row">
                      <RankMark label={r.label} champion={r.champion} />
                      <button type="button" className="rk-who" onClick={() => navigate('fighter', r.id)}>
                        <span className="rk-n">{r.name}{r.champion && <span className="chip gold" data-testid="champ-chip">CHAMPION</span>}{r.mine && <span className="chip gold">YOURS</span>}{c && <TagChip tag={c.tag} />}</span>
                        <span className="dim rk-sub"><Flag code={r.nation} /> {r.record}{r.champion && belt?.champion ? ` · ${belt.champion.weeks} wk champion · ${belt.champion.defences} def.` : ''}</span>
                      </button>
                      <span className={`rk-move ${r.movementTone}`} aria-label={`Movement ${r.movement}`}>{r.movement}</span>
                      <span className="rk-why dim" title={r.why}>{r.why}</span>
                      {r.champion && held.length > 0 && <span className="rk-holds" data-testid="champ-holds"><b className="rk-hlabel">{label}</b>{held.map((h) => <span key={h.title} className={`chip${belt && h.title === belt.title ? ' gold' : ''}`} title={h.title}>{h.short}</span>)}</span>}
                      {target && <span className="rk-req"><RequestButton fighterId={r.id} target={target} small /></span>}
                    </div>
                    {belt && r.rank === belt.challengerLimit && r.rank < (rows[rows.length - 1]?.rank ?? 0) && <ul className="bz-lim-wrap"><LimitMarker limit={belt.challengerLimit} /></ul>}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </>
  )
}

function Titles({ param }: { param?: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const levels = useMemo(() => titleLevels(), [])
  const divisions = useMemo(() => divisionOptions(), [])
  const paths = useMemo(() => myTitlePaths(game), [game])
  const pathMap = useMemo(() => new Map(paths.map((p) => [p.id, p])), [paths])
  // `#/titles` and `#/titles/mine` = your fighters; `#/titles/<level>/<division>` = the belts (the old `#/titles/<body id>` still selects that body's level).
  const [p1, p2] = (param ?? '').split('/')
  const tab: 'mine' | 'belts' = p1 === 'mine' || (!p1 && paths.length > 0) ? 'mine' : 'belts'
  const level: TitleLevel = (levels.find((l) => l.id === p1)?.id ?? (p1 && p1 !== 'mine' ? levelOf(p1) : undefined) ?? 'world') as TitleLevel
  const division = divisions.find((d) => d.id === p2)?.id ?? defaultDivision(game)
  const go = (l: string, d: string) => navigate('titles', `${l}/${d}`)
  const cards = useMemo(() => titleBoard(game, level, division), [game, level, division])
  const readyN = paths.filter((p) => p.readyCount > 0).length
  return (
    <>
      <div className="page-head"><div><h1 className="display">Titles</h1><p className="sub">Request a title fight for a fighter who has earned one, or browse every belt by level.</p></div></div>
      <div className="bz-seg" role="tablist" aria-label="Titles view">
        <button role="tab" aria-selected={tab === 'mine'} className={`bz-segbtn${tab === 'mine' ? ' on' : ''}`} data-testid="titles-tab-mine" onClick={() => navigate('titles', 'mine')}>My fighters{readyN > 0 ? ` · ${readyN} ready` : ''}</button>
        <button role="tab" aria-selected={tab === 'belts'} className={`bz-segbtn${tab === 'belts' ? ' on' : ''}`} data-testid="titles-tab-belts" onClick={() => go(level, division)}>All belts</button>
      </div>
      {tab === 'mine' ? <MyFighterPaths paths={paths} /> : (
        <>
          <div className="bz-seg sub" role="tablist" aria-label="Title level">
            {levels.map((l) => <button key={l.id} role="tab" aria-selected={l.id === level} className={`bz-segbtn${l.id === level ? ' on' : ''}`} data-testid="title-level-tab" data-level={l.id} onClick={() => go(l.id, division)}>{l.label}</button>)}
          </div>
          <div className="rk-controls">
            <label htmlFor="tt-div" className="caps">Division</label>
            <select id="tt-div" className="select" value={division} onChange={(e) => go(level, e.target.value)} data-testid="title-division">
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div className="bz-grid" data-testid="titles-grid">
            {cards.map((c) => <BeltCardView key={`${c.body}-${c.division}`} card={c} paths={pathMap} />)}
          </div>
          {cards.length === 0 && <p className="empty">No belts at this level.</p>}
        </>
      )}
    </>
  )
}
