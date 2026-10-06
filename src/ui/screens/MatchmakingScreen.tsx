import { useMemo, useState } from 'react'
import { matchmakingAdvice } from '../../engine/advisor'
import { opponentCandidates, type OpponentCandidate, type OpponentFilters } from '../../engine/matchmaking'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { AdvicePanel } from '../components/Advice'
import { Avatar, Flag, Section } from '../components/Bits'
import { RangeText } from '../components/Estimates'
import { FormDots, StarRating, VerdictChip } from '../components/FightBits'
import { ScoutDialog } from '../components/ScoutDialog'
import { money } from '../format'

const STYLES = ['Pressure Fighter', 'Boxer', 'Counter Puncher', 'Swarmer', 'Power Puncher', 'Technical Boxer', 'Defensive Specialist', 'Balanced']

export function MatchmakingScreen({ fighterId }: { fighterId?: string }) {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const approach = useGame((s) => s.approachOpponent)
  const mine = views.mine()
  const [myId, setMyId] = useState<string | null>(fighterId ?? mine.find((m) => m.availability.status === 'available')?.id ?? mine[0]?.id ?? null)
  const [filters, setFilters] = useState<OpponentFilters & { q: string }>({ q: '', contract: '', showUnavailable: false })
  const [picked, setPicked] = useState<string[]>([])
  const [scouting, setScouting] = useState<string | null>(null)
  const [sort, setSort] = useState<'fit' | 'reward' | 'risk' | 'rep'>('fit')

  const me = myId ? views.fighter(myId) : null
  const cands = useMemo(() => (myId ? opponentCandidates(game, myId, filters) : []), [game, myId, filters])
  const rows = useMemo(() => {
    const score = (c: OpponentCandidate) => (sort === 'reward' ? -c.assessment.reward : sort === 'risk' ? c.assessment.difficulty : sort === 'rep' ? -c.view.reputation : Math.abs(c.assessment.difficulty - 3) - c.assessment.reward * 0.2)
    return cands.slice().sort((a, b) => Number(b.canApproach) - Number(a.canApproach) || score(a) - score(b))
  }, [cands, sort])
  const chosen = rows.filter((c) => picked.includes(c.view.id))

  const open = me?.activeFightId ? game.fights[me.activeFightId] : null

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Matchmaking</h1>
          <p className="sub">Pick one of your fighters, then browse opponents. Difficulty, reward and win chances come from <i>your scouts’ opinions and public records</i> — the real fight uses the true abilities, which you can only estimate.</p>
        </div>
        <button className="btn ghost" onClick={() => navigate('fights')}>My fights ▸</button>
      </div>

      {mine.length === 0 ? <p className="empty">You have no fighters. Sign some in Scouting first.</p> : (
        <div className="opp-grid">
          {mine.map((m) => (
            <button key={m.id} className={`pick${myId === m.id ? ' on' : ''}${m.availability.status !== 'available' ? ' off' : ''}`} onClick={() => { setMyId(m.id); setPicked([]) }} aria-pressed={myId === m.id}>
              <div className="fighter-name">{m.name}</div>
              <div className="fighter-sub">{m.division} · {m.recordText} · {m.style}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}><FormDots form={m.form} /><span className={m.availability.status === 'available' ? 'good' : 'warn'} style={{ fontSize: 13 }}>{m.availability.label}{m.availability.weeks ? ` · ${m.availability.weeks}w` : ''}</span></div>
            </button>
          ))}
        </div>
      )}

      {me && open && (
        <div className="night-banner"><span><b>{me.name}</b> already has a fight in the works ({open.status}).</span><button className="btn small" onClick={() => navigate(open.status === 'negotiating' ? 'deal' : 'fight', open.id)}>Open it</button></div>
      )}

      {me && (
        <>
          <div className="filters">
            <input className="input" placeholder="Search opponents…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} aria-label="Search opponents" />
            <select className="select" value={filters.contract} onChange={(e) => setFilters({ ...filters, contract: e.target.value as OpponentFilters['contract'] })} aria-label="Contract status">
              <option value="">Any contract status</option><option value="free">Free agents</option><option value="rival">Under contract</option>
            </select>
            <select className="select" value={filters.style ?? ''} onChange={(e) => setFilters({ ...filters, style: e.target.value || undefined })} aria-label="Style">
              <option value="">Any style</option>{STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select compact" value={filters.minRep ?? 0} onChange={(e) => setFilters({ ...filters, minRep: Number(e.target.value) || undefined })} aria-label="Minimum reputation">
              <option value={0}>Any reputation</option><option value={25}>Rep 25+</option><option value={40}>Rep 40+</option><option value={55}>Rep 55+</option>
            </select>
            <select className="select compact" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="fit">Best fit</option><option value="reward">Biggest reward</option><option value="risk">Lowest risk</option><option value="rep">Highest profile</option>
            </select>
            <label className="age-range"><input type="checkbox" checked={!!filters.showUnavailable} onChange={(e) => setFilters({ ...filters, showUnavailable: e.target.checked })} /> Show unavailable</label>
          </div>
          <p className="dim" style={{ marginBottom: 8, fontSize: 13 }}>{rows.length} possible opponents for {me.name}. “~” marks guesses without scouting. Win chances are <b>your</b> estimate, not the truth.</p>

          <div className="table-wrap">
            <table className="table stack">
              <thead><tr><th></th><th>Opponent</th><th>Age</th><th>Record</th><th>Form</th><th>Scout grade</th><th>Difficulty</th><th>Reward</th><th>Win chance (est.)</th><th>KO risk</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, 60).map((c) => {
                  const v = c.view
                  const scouted = v.knowledge.reports > 0
                  return (
                    <tr key={v.id} className="row" onClick={() => navigate('fighter', v.id)}>
                      <td className="actions" data-label="Compare" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Compare ${v.name}`} checked={picked.includes(v.id)} disabled={!picked.includes(v.id) && picked.length >= 3}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, v.id] : picked.filter((x) => x !== v.id))} />
                      </td>
                      <td className="primary" data-label="Opponent">
                        <div className="fighter-cell"><Avatar f={v} /><div><div className="fighter-name">{v.name} <Flag code={v.nationKey} /></div>
                          <div className="fighter-sub">{v.style} · {v.stage}{c.compat === 'catchweight' ? ' · catchweight' : ''}{c.rematch ? ' · rematch' : ''}</div></div></div>
                      </td>
                      <td data-label="Age" className="num">{v.age}</td>
                      <td data-label="Record" className="num">{v.recordText}</td>
                      <td data-label="Form"><FormDots form={v.form} /></td>
                      <td data-label="Scout grade"><RangeText r={v.grade} scouted={scouted} /></td>
                      <td data-label="Difficulty"><StarRating n={c.assessment.difficulty} label="Difficulty" /></td>
                      <td data-label="Reward"><StarRating n={c.assessment.reward} label="Reward" /></td>
                      <td data-label="Win chance"><span title={`${c.assessment.winLo}–${c.assessment.winHi}%`}>{c.assessment.winLabel}</span> <small className="dim">{c.assessment.winLo}–{c.assessment.winHi}%</small><div><VerdictChip v={c.assessment.verdict} /></div></td>
                      <td data-label="KO risk" className={c.assessment.koRisk === 'High' ? 'red' : c.assessment.koRisk === 'Moderate' ? 'warn' : 'good'}>{c.assessment.koRisk}</td>
                      <td data-label="Status" className="dim" style={{ fontSize: 13 }}>{c.canApproach ? (v.contract.kind === 'none' ? 'Free agent' : v.contract.kind === 'rival' ? v.contract.promotionName : '') : c.blockedReason}</td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        <span className="action-row">
                          <button className="btn small ghost" onClick={() => setScouting(v.id)}>Scout</button>
                          <button className="btn small primary" disabled={!c.canApproach || !!open} onClick={() => { const id = approach(me.id, v.id); if (id) navigate('deal', id) }}>Approach</button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {me && (chosen.length > 0 ? chosen : rows.slice(0, 1)).length > 0 && <AdvicePanel cap={3} list={(chosen.length > 0 ? chosen : rows.slice(0, 1)).flatMap((c) => matchmakingAdvice(me, c.view, c.assessment))} title="Promoter’s notes" />}
          {rows.length === 0 && <p className="empty">No opponents match. Loosen the filters, or run a talent search in Scouting to discover more fighters.</p>}

          {chosen.length >= 1 && (
            <Section title="Compare">
              <div className="compare" style={{ ['--cols' as string]: chosen.length + 1 }}>
                <div className="compare-row compare-head"><div />
                  <div><div className="fighter-name gold">{me.name}</div><div className="fighter-sub">your fighter</div></div>
                  {chosen.map((c) => <div key={c.view.id}><div className="fighter-name">{c.view.name}</div><div className="fighter-sub">{c.view.style}</div></div>)}</div>
                <div className="compare-row"><div>Record</div><div>{me.recordText}</div>{chosen.map((c) => <div key={c.view.id}>{c.view.recordText}</div>)}</div>
                <div className="compare-row"><div>Age</div><div>{me.age}</div>{chosen.map((c) => <div key={c.view.id}>{c.view.age}</div>)}</div>
                <div className="compare-row"><div>Scout grade</div><div><RangeText r={me.grade} /></div>{chosen.map((c) => <div key={c.view.id}><RangeText r={c.view.grade} scouted={c.view.knowledge.reports > 0} /></div>)}</div>
                {me.traits.physical.map((t, i) => (
                  <div className="compare-row" key={t.key}><div>{t.name}</div><div><RangeText r={t} /></div>{chosen.map((c) => { const tt = c.view.traits.physical[i]; return <div key={c.view.id}><RangeText r={tt} scouted={tt.scouted} /> <small className="dim">{tt.scouted ? tt.label : ''}</small></div> })}</div>
                ))}
                <div className="compare-row"><div>Scout notes</div><div className="dim" style={{ fontSize: 13 }}>{me.notes.join(' · ') || '—'}</div>{chosen.map((c) => <div key={c.view.id} className="dim" style={{ fontSize: 13 }}>{c.view.notes.join(' · ') || 'Little known'}</div>)}</div>
                <div className="compare-row"><div>Difficulty</div><div>—</div>{chosen.map((c) => <div key={c.view.id}><StarRating n={c.assessment.difficulty} label="Difficulty" /></div>)}</div>
                <div className="compare-row"><div>Reward</div><div>—</div>{chosen.map((c) => <div key={c.view.id}><StarRating n={c.assessment.reward} label="Reward" /></div>)}</div>
                <div className="compare-row"><div>Win chance</div><div>—</div>{chosen.map((c) => <div key={c.view.id}>{c.assessment.winLabel} ({c.assessment.winLo}–{c.assessment.winHi}%)</div>)}</div>
                <div className="compare-row"><div>Style</div><div>{me.style}</div>{chosen.map((c) => <div key={c.view.id} className="dim" style={{ fontSize: 13 }}>{c.assessment.styleNote}</div>)}</div>
                <div className="compare-row"><div>Confidence</div><div>—</div>{chosen.map((c) => <div key={c.view.id}>{c.assessment.confidence} <small className="dim">({c.view.knowledge.level})</small></div>)}</div>
                <div className="compare-row"><div>Typical purse</div><div>—</div>{chosen.map((c) => <div key={c.view.id}>{money(c.purseLo)}–{money(c.purseHi)}</div>)}</div>
              </div>
              <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Low confidence means the estimates could be badly off — scout before risking a prospect on a stranger.</p>
            </Section>
          )}
        </>
      )}
      {scouting && <ScoutDialog id={scouting} onClose={() => setScouting(null)} />}
    </>
  )
}
