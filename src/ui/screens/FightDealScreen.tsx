import { useEffect, useMemo, useState } from 'react'
import '../../styles/negotiation54.css'
import { fightTalkAdvice } from '../../engine/advisor'
import type { FightMove } from '../../engine/business/fightTalks'
import { FIGHT_ASSESS_HINT } from '../../engine/advisor'
import { assessFightDraft, fightTalkView, openFightTalkId } from '../../engine/business/talkViews'
import { fightView } from '../../engine/fightViews'
import type { FightOffer } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { AdvicePanel } from '../components/Advice'
import { money } from '../format'
import { ExpectedFight, FightCounterCard, FightEditor, StakeBadge, VENUE } from '../negotiation/FightParts'
import { ChatLog, ClosedPanel, Collapsible, lastCounterIndex, TalkHeaderBar, ToldBox, Walk } from '../negotiation/parts'

const wide = (): boolean => { try { return window.matchMedia('(min-width: 1024px)').matches } catch { return true } }
const mid = (r: { lo: number; hi: number }, q: number): number => Math.round((r.lo + r.hi) / 2 / q) * q

export function FightDealScreen({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const openTalk = useGame((s) => s.openFightTalk)
  const move = useGame((s) => s.fightMove)
  const fx = useMemo(() => fightView(game, id), [game, id])
  const [talkId, setTalkId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [draft, setDraft] = useState<FightOffer | null>(null)
  const [editorOpen, setEditorOpen] = useState(wide)

  useEffect(() => {
    const g = useGame.getState().game
    if (!g || !g.fights[id]) return
    let t = openFightTalkId(g, id)
    if (!t && g.fights[id].status === 'negotiating') t = openTalk(id)
    if (!t) {
      const closed = Object.values(useGame.getState().game?.business?.talks ?? {}).filter((x) => x.kind === 'fight' && x.fightId === id).sort((a, b) => b.openedDay - a.openedDay || (a.id < b.id ? 1 : -1))[0]
      t = closed?.id ?? null
    }
    setTalkId(t); setTried(true)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => (talkId ? fightTalkView(game, talkId) : null), [game, talkId])
  const seedOffer = (): FightOffer | null => {
    if (!v) return null
    if (v.counter) return v.counter
    if (v.offer) return v.offer
    const e = v.expected
    const base: FightOffer = { purseB: e ? mid(e.purse, 500) : 0, winBonusB: e ? mid(e.winBonus, 250) : 0, rematch: false, venuePref: 'neutral', fights: 1 }
    return v.roundsOptions.length > 1 ? { ...base, rounds: v.roundsOptions.includes(v.rounds) ? v.rounds : v.roundsOptions[0] } : base
  }
  const seed = v ? `${v.header.talkId}|${v.header.turn}` : ''
  useEffect(() => { if (v) setDraft(seedOffer()) }, [seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const offer = draft ?? seedOffer()
  const assessment = useMemo(() => (offer && v?.expected ? assessFightDraft(game, id, offer) : null), [game, id, offer, v?.expected])
  const advice = useMemo(() => fightTalkAdvice(game, id), [game, id])

  if (!fx) return <><h1 className="display" style={{ fontSize: 44 }}>Fight not found</h1><button className="btn n54-btn" onClick={() => navigate('matchmaking')}>Back</button></>
  const opp = fx.b.fighter
  const oppRef = views.fighter(opp.id) ?? opp
  const back = () => navigate('matchmaking', fx.a.fighter.id)
  if (!v || !offer) {
    if (!tried) return <p className="dim" role="status">Opening the talks…</p>
    const off = fx.statusKey !== 'negotiating'
    return (
      <div className="n54-closed" role="status" data-testid="talk-unavailable">
        <h1 className="display">{fx.headline}</h1>
        <p>{fx.statusKey === 'cancelled' ? `This fight is off: ${fx.cancelReason}.` : off ? `Status: ${fx.status}. The terms are settled.` : 'Their camp is not available for talks right now.'}</p>
        <button className="btn primary n54-btn" onClick={() => (fx.statusKey === 'cancelled' || !off ? back() : navigate('fight', id))}>{fx.statusKey === 'cancelled' || !off ? 'Back to matchmaking' : 'Open the fight'}</button>
      </div>
    )
  }

  const t = talkId!
  const open = v.header.open
  const run = (m: FightMove) => { const r = move(t, m); if (r === 'agreed') navigate('fight', id); return r }
  const counterCard = v.counter ? <FightCounterCard v={v} onAccept={() => run({ kind: 'acceptCounter' })} onLoad={() => { setDraft(v.counter); setEditorOpen(true) }} /> : null
  const exp = v.expected && assessment ? { ...v.expected, assessment } : v.expected
  const locked = v.header.status === 'broken' ? 'Their camp ended the conversation and the fight is off. You cannot talk about this fight for 12 weeks and their relationship with you has fallen.'
    : v.header.status === 'withdrawn' ? 'You walked away and the fight is off. Your fighter is free to take another opponent.'
      : 'The terms are agreed. Set a date on the fight page.'
  const summary = `${money(offer.purseB, false)} purse · ${money(offer.winBonusB, false)} bonus · ${VENUE[offer.venuePref]}${offer.rematch ? ' · rematch' : ''}${offer.fights === 2 ? ' · two fights' : ''}${offer.rounds && v.roundsOptions.length > 1 ? ` · ${offer.rounds} rounds` : ''}`

  return (
    <div className="n54">
      <TalkHeaderBar h={v.header} f={oppRef} eyebrow={`Fight negotiation · ${fx.a.fighter.name} vs …`} onBack={back} backLabel="Matchmaking"
        sub={<div className="n54-stakes"><StakeBadge v={v} />{v.warning && <p className="n54-warn" role="alert" data-testid="fight-warning">{v.warning}</p>}</div>} />
      <div className="n54-grid">
        <div className="n54-left">
          <ChatLog lines={v.log} f={oppRef} label="The conversation" counterCard={open ? counterCard : null} counterAfter={lastCounterIndex(v.log)} />
          {open ? (
            <div className="n54-moves" role="group" aria-label="Your move">
              <div className="caps">Your move</div>
              <div className="n54-row">
                <button type="button" className="btn n54-btn" data-testid="ask-priorities" disabled={v.told.priorities.length >= 3} onClick={() => run({ kind: 'ask', topic: 'priorities' })}>Ask what their camp is looking for</button>
                <button type="button" className="btn n54-btn" data-testid="ask-location" onClick={() => run({ kind: 'ask', topic: 'location' })}>Ask about the location</button>
                <button type="button" className="btn n54-btn" data-testid="ask-timing" onClick={() => run({ kind: 'ask', topic: 'timing' })}>Ask about the timing</button>
                <button type="button" className="btn n54-btn" data-testid="ask-time" onClick={() => run({ kind: 'time' })}>Ask for time</button>
                <Walk onWalk={() => run({ kind: 'walk' })} />
              </div>
              <div className="n54-propose">
                <div className="n54-draft" data-testid="draft-summary"><span className="caps dim">Current draft</span> {summary}</div>
                {assessment && v.expected && (
                  <p className="n54-verdict" data-testid="draft-verdict" role="status">
                    <b className={`as-${assessment.split(' ')[0]}`}>{assessment}</b> · the going rate is {money(v.expected.purse.lo, false)} to {money(v.expected.purse.hi, false)} purse and {money(v.expected.winBonus.lo, false)} to {money(v.expected.winBonus.hi, false)} win bonus.
                    {' '}{FIGHT_ASSESS_HINT[assessment as keyof typeof FIGHT_ASSESS_HINT]}
                  </p>
                )}
                <button type="button" className="btn primary big n54-btn" data-testid="talk-propose" onClick={() => run({ kind: 'propose', offer })}>Make this offer ▸</button>
              </div>
            </div>
          ) : (
            <ClosedPanel status={v.header.status} locked={locked}>
              <div className="n54-row">
                {v.header.status === 'agreed' && <button type="button" className="btn primary n54-btn" onClick={() => navigate('fight', id)}>Open the fight</button>}
                <button type="button" className="btn n54-btn" data-testid="closed-back" onClick={back}>Back to matchmaking</button>
              </div>
            </ClosedPanel>
          )}
        </div>
        <aside className="n54-right" aria-label="Terms and information">
          {exp && <ExpectedFight x={exp} />}
          <ToldBox told={v.told} />
          {open && (
            <Collapsible title="Edit my offer" open={editorOpen} onToggle={() => setEditorOpen((x) => !x)} testid="offer-editor">
              <FightEditor v={v} draft={offer} setDraft={setDraft} />
            </Collapsible>
          )}
          {open && <AdvicePanel list={advice} cap={3} />}
        </aside>
      </div>
    </div>
  )
}
