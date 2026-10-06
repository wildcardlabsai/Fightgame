import { useState } from 'react'
import { quoteReports, scoutViews } from '../../engine/quotes'
import type { ScoutDepth } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { money } from '../format'
import { Avatar } from './Bits'
import { Modal } from './Overlay'

/** Order a scouting report on one fighter: pick depth, see cost, time and expected accuracy first. */
export function ScoutDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const game = useGame((s) => s.game)!
  const order = useGame((s) => s.orderReport)
  const views = useViews()
  const v = views.fighter(id)
  const scouts = scoutViews(game)
  const [scoutId, setScoutId] = useState(scouts[0]?.id ?? '')
  const [depth, setDepth] = useState<ScoutDepth>('standard')
  if (!v) return null
  const quotes = quoteReports(game, id, scoutId)
  const q = quotes.find((x) => x.depth === depth)
  const scout = scouts.find((s) => s.id === scoutId)
  const busy = !!scout && scout.active >= scout.capacity
  const pending = game.scoutOps.some((o) => o.status === 'active' && o.fighterId === id)

  return (
    <Modal title="Commission a scouting report" onClose={onClose}>
      <div className="fighter-cell" style={{ marginBottom: 14 }}>
        <Avatar f={v} />
        <div>
          <div className="fighter-name">{v.name}</div>
          <div className="fighter-sub">{v.division} · {v.age} · {v.recordText} · intel: {v.knowledge.level}{v.knowledge.reports ? ` (${v.knowledge.reports} report${v.knowledge.reports === 1 ? '' : 's'})` : ''}</div>
        </div>
      </div>
      {scouts.length > 1 && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="sc">Scout</label>
          <select id="sc" className="select" value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
            {scouts.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.qualityLabel}</option>)}
          </select>
        </div>
      )}
      {scout && <p className="dim" style={{ fontSize: 13, marginBottom: 10 }}>{scout.name} · {scout.qualityLabel} · {scout.experienceLabel} · {scout.active}/{scout.capacity} assignments</p>}
      {quotes.map((x) => (
        <button key={x.depth} className={`depth-opt${depth === x.depth ? ' on' : ''}`} disabled={!x.affordable} onClick={() => setDepth(x.depth)} aria-pressed={depth === x.depth}>
          <span className="n">{x.label} <span className="dim" style={{ fontSize: 13 }}>· {x.weeks} week{x.weeks === 1 ? '' : 's'} · about ±{x.accuracy} on physical traits</span></span>
          <span className="p">{money(x.cost, false)}</span>
          <span className="d">{x.blurb}</span>
        </button>
      ))}
      <p className="dim" style={{ fontSize: 13, margin: '8px 0 14px' }}>
        Reports are estimates, not facts. Famous fighters are easier to read; secretive prospects are harder — and potential is the hardest thing of all to judge. Repeat reports narrow the picture; old ones fade.
      </p>
      {pending && <p className="warn" style={{ marginBottom: 10 }}>A report on this fighter is already under way.</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!q?.affordable || busy || pending} onClick={() => { if (order(id, depth, scoutId)) onClose() }}>
          {busy ? 'Scout is busy' : `Send scout · ${q ? money(q.cost, false) : ''}`}
        </button>
      </div>
    </Modal>
  )
}
