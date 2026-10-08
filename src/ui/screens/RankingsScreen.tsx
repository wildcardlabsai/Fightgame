import { useMemo, useState } from 'react'
import { Flag } from '../components/Bits'
import { divisionsList, defaultDivision, rankingOrgs, rankingView, reignsList } from '../../engine/media/views'
import { divisionOptions, fighterBusinessView, titleBoard, titleLevels, type BeltCard } from '../../engine/business/views'
import { LEVEL_LABEL, levelOf } from '../../engine/business/titleDefs'
import type { TitleLevel } from '../../engine/business/titleDefs'
import { viewsOf } from '../../engine/view'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { RankMark } from '../media/RankMark'
import { BeltCardView, LimitMarker, TagChip } from '../business/Boards'
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
  const rows = view?.rows ?? []
  const hasChampRow = rows.some((r) => r.champion)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Rankings</h1><p className="sub">Independent lists, each a different view of the same fighters. Sanctioning bodies decide who may challenge for their belts; media lists and the index are opinion. Every movement has a reason.</p></div></div>
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
            <div className="display rk-name">{view.name}</div>
            <div className="rk-meta"><span className="chip">{view.kind.replace('_', ' ')}</span><span className="dim">Authority {view.authority}</span>{view.sanctions && <span className="chip gold">SANCTIONS TITLES</span>}</div>
            <ul className="rk-method">{view.method.map((m) => <li key={m}>{m}</li>)}</ul>
            {belt && (
              <p className="bz-sub dim" data-testid="rank-eligibility">{belt.title}: {belt.territory}. Only the top {belt.challengerLimit} may challenge the champion. {belt.state === 'dormant' ? belt.note : `${belt.poolEligible} eligible fighters in this division.`}</p>
            )}
            {!belt && <p className="bz-sub dim" data-testid="rank-eligibility">No belt is attached to this list. It is an opinion, not an order of challengers.</p>}
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
                return (
                  <li key={r.id} className="bz-li">
                    <div className={`rk-row${r.champion ? ' champ' : ''}${r.mine ? ' mine' : ''}${c && !c.inChallengeRange ? ' outside' : ''}`} data-testid="rank-row">
                      <RankMark label={r.label} champion={r.champion} />
                      <button type="button" className="rk-who" onClick={() => navigate('fighter', r.id)}>
                        <span className="rk-n">{r.name}{r.mine && <span className="chip gold">YOURS</span>}{c && <TagChip tag={c.tag} />}</span>
                        <span className="dim"><Flag code={r.nation} /> {r.record}{r.champion && belt?.champion ? ` · ${belt.champion.weeks} wk champion · ${belt.champion.defences} def.` : ''}</span>
                      </button>
                      <span className={`rk-move ${r.movementTone}`} aria-label={`Movement ${r.movement}`}>{r.movement}</span>
                      <span className="rk-why dim">{r.why}</span>
                    </div>
                    {belt && r.rank === belt.challengerLimit && r.rank < (rows[rows.length - 1]?.rank ?? 0) && <ul className="bz-lim-wrap"><LimitMarker limit={belt.challengerLimit} /></ul>}
                  </li>
                )
              })}
            </ol>
          )}
          <p className="dim rk-foot">Last updated {view.updated ? formatDay(view.updated) : '—'}. Lists use public results only: records, who beat whom, how recently, titles and (for some) popularity.</p>
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
  // `#/titles/<level>/<division>`; the old `#/titles/<body id>` still selects that body's level.
  const [p1, p2] = (param ?? '').split('/')
  const level: TitleLevel = (levels.find((l) => l.id === p1)?.id ?? (p1 ? levelOf(p1) : undefined) ?? 'world') as TitleLevel
  const division = divisions.find((d) => d.id === p2)?.id ?? defaultDivision(game)
  const go = (l: string, d: string) => navigate('titles', `${l}/${d}`)
  const cards = useMemo(() => titleBoard(game, level, division), [game, level, division])
  const bodies = useMemo(() => new Set(cards.map((c) => c.body)), [cards])
  const reigns = useMemo(() => reignsList(game).filter((r) => bodies.has(r.b)).slice(0, 12), [game, bodies])
  const paths = useMemo(() => viewsOf(game).mine().map((f) => fighterBusinessView(game, f.id)).filter((v): v is NonNullable<typeof v> => !!v), [game])
  const [pathsOpen, setPathsOpen] = useState(true)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Titles</h1><p className="sub">Belts by level. A belt changes hands only when a champion loses, retires, or is stripped for refusing an ordered defence. Some belts are not contested at all when a division is too thin.</p></div></div>
      {paths.length > 0 && (
        <section className="bz-paths" data-testid="title-paths" aria-label="Your fighters' title paths">
          <button type="button" className="bz-toggle" aria-expanded={pathsOpen} onClick={() => setPathsOpen(!pathsOpen)}><b className="display">Your fighters’ title paths</b> <span className="dim">({paths.length})</span></button>
          {pathsOpen && (
            <ul className="bz-pathlist">
              {paths.map((v) => (
                <li key={v.id}>
                  <button type="button" className="bz-path" onClick={() => navigate('fighter', v.id)}>
                    <b>{v.name}</b> <span className="chip">{v.statusLabel}</span>
                    <span className="dim bz-pathtext">{v.opportunities[0] ? `${v.opportunities[0].title}: ${v.opportunities[0].text}` : v.next.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="bz-seg" role="tablist" aria-label="Title level">
        {levels.map((l) => <button key={l.id} role="tab" aria-selected={l.id === level} className={`bz-segbtn${l.id === level ? ' on' : ''}`} data-testid="title-level-tab" data-level={l.id} onClick={() => go(l.id, division)}>{l.label}</button>)}
      </div>
      <div className="rk-controls">
        <label htmlFor="tt-div" className="caps">Division</label>
        <select id="tt-div" className="select" value={division} onChange={(e) => go(level, e.target.value)} data-testid="title-division">
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <p className="sub bz-sub" style={{ marginBottom: 12 }}>{LEVEL_LABEL[level]} titles at {divisions.find((d) => d.id === division)?.label}</p>
      <div className="bz-grid" data-testid="titles-grid">
        {cards.map((c) => <BeltCardView key={`${c.body}-${c.division}`} card={c} />)}
      </div>
      {cards.length === 0 && <p className="empty">No belts at this level.</p>}
      <h2 className="m-sec display">Reign history</h2>
      {reigns.length === 0 ? <p className="dim">No reign has ended at this level in this game yet.</p> : <ul className="m-done">{reigns.map((r, i) => <li key={i}>{r.fn} · {r.title} · {formatDay(r.from, false)}–{r.to ? formatDay(r.to, false) : 'now'} · {r.defences} defence{r.defences === 1 ? '' : 's'} — {r.how}</li>)}</ul>}
    </>
  )
}
