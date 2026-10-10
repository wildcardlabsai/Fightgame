import { useEffect, useMemo, useState } from 'react'
import '../../styles/world54b.css'
import '../../styles/negotiation54.css'
import { contractTalkAdvice } from '../../engine/advisor'
import { assessContractDraft, contractTalkView, openContractTalkId, type ContractTalkView } from '../../engine/business/talkViews'
import type { ContractMove } from '../../engine/business/contractTalks'
import type { NegotiationKind, Offer } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { AdvicePanel } from '../components/Advice'
import { money } from '../format'
import { ContractEditor, CounterCard, ExpectedContract } from '../negotiation/ContractParts'
import { SigningForecastBox } from '../negotiation/SigningForecastBox'
import { ChatLog, ClosedPanel, Collapsible, lastCounterIndex, TalkHeaderBar, ToldBox, Walk } from '../negotiation/parts'

/** A first draft that sits inside the expected ranges the player can see, so the default is a serious number. */
function startingOffer(v: ContractTalkView): Offer {
  const o = v.opening, e = v.expected
  if (!e) return o
  const mid = (r: { lo: number; hi: number }, q: number) => Math.round((r.lo + r.hi) / 2 / q) * q
  const years = Math.max(1, Math.min(5, Math.round((e.years.lo + e.years.hi) / 2) || o.years))
  return { ...o, years, fights: Math.max(o.fights, years), minFightsPerYear: Math.max(1, Math.round((e.fightsPerYear.lo + e.fightsPerYear.hi) / 2) || o.minFightsPerYear), basePurse: Math.max(o.basePurse, mid(e.purse, 500)), winBonus: Math.max(o.winBonus, mid(e.winBonus, 250)), weeklyRetainer: Math.max(o.weeklyRetainer, mid(e.retainer, 50)), signingBonus: Math.max(o.signingBonus, mid(e.signing, 500)) }
}

const wide = (): boolean => { try { return window.matchMedia('(min-width: 1024px)').matches } catch { return true } }

export function NegotiationScreen({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const openTalk = useGame((s) => s.openContractTalk)
  const move = useGame((s) => s.contractMove)
  const fv = views.fighter(id)
  const kind: NegotiationKind = fv?.contract.kind === 'own' ? 'renewal' : 'signing'
  const [talkId, setTalkId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [draft, setDraft] = useState<Offer | null>(null)
  const [editorOpen, setEditorOpen] = useState(wide)

  // Find (or open, once) the conversation. If none can be opened, show the latest closed one read-only.
  useEffect(() => {
    const g = useGame.getState().game
    if (!g || !fv) return
    let t = openContractTalkId(g, id, kind)
    if (!t) t = openTalk(id, kind)
    if (!t) {
      const closed = Object.values(useGame.getState().game?.business?.talks ?? {}).filter((x) => x.kind === 'contract' && x.fighterId === id).sort((a, b) => b.openedDay - a.openedDay || (a.id < b.id ? 1 : -1))[0]
      t = closed?.id ?? null
    }
    setTalkId(t); setTried(true)
  }, [id, kind, !!fv]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => (talkId ? contractTalkView(game, talkId) : null), [game, talkId])
  const seed = v ? `${v.header.talkId}|${v.header.turn}` : ''
  useEffect(() => { if (v) setDraft(v.counter ?? v.offer ?? startingOffer(v)) }, [seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const offer = draft ?? v?.opening ?? null
  const assessment = useMemo(() => (offer ? assessContractDraft(game, id, kind, offer) : null), [game, id, kind, offer])
  const advice = useMemo(() => (offer ? contractTalkAdvice(game, id, offer, kind) : []), [game, id, kind, offer])

  if (!fv) return <><h1 className="display" style={{ fontSize: 44 }}>Not found</h1><button className="btn n54-btn" onClick={() => navigate('fighters')}>Back</button></>
  if (!v || !offer) {
    return tried ? (
      <div className="n54-closed" role="status" data-testid="talk-unavailable">
        <h1 className="display">They will not talk right now</h1>
        <p>{fv.firstName} {fv.lastName}'s camp is not available for talks right now. A renewal opens closer to the end of a contract, your roster may be full, or talks were broken off (they stay locked for 12 weeks).</p>
        <button className="btn n54-btn" onClick={() => navigate('fighter', id)}>View profile</button>
      </div>
    ) : <p className="dim" role="status">Opening the talks…</p>
  }

  const t = talkId!
  const open = v.header.open
  const cash = game.promotions[game.playerPromotionId]?.cash ?? 0
  const cannotAfford = offer.signingBonus > cash
  const run = (m: ContractMove) => { const r = move(t, m); if (r === 'agreed') navigate('fighter', id); return r }
  const counterCard = v.counter ? <><CounterCard v={v} disabled={cannotAfford && v.counter.signingBonus > cash} onAccept={() => run({ kind: 'acceptCounter' })} onLoad={() => { setDraft(v.counter); setEditorOpen(true) }} /><SigningForecastBox fighterId={id} offer={v.counter} kind={kind} label="if you accept their counter" testid="signing-forecast-counter" /></> : null
  const exp = v.expected && assessment ? { ...v.expected, assessment } : v.expected
  const locked = v.header.status === 'broken' ? 'Their camp ended the conversation. Talks are locked for 12 weeks and their relationship with you has fallen.'
    : v.header.status === 'withdrawn' ? 'You stepped away from the table. The camp will remember it, and your standing with them has taken a small hit. You can try again later.'
      : 'The deal is done.'
  const summary = `${money(offer.basePurse, false)} a fight · ${offer.years} yr · ${money(offer.weeklyRetainer, false)}/wk · ${money(offer.signingBonus, false)} signing`

  return (
    <div className="n54">
      <TalkHeaderBar h={v.header} f={fv} eyebrow={kind === 'renewal' ? 'Contract renewal' : 'Signing negotiation'} onBack={() => navigate('fighter', id)} backLabel="Fighter profile" />
      {open && v.header.rival && (
        <p className="n54-rival" role="status" data-testid="talk-rival">
          <b>{v.header.rival.promotion}</b> have an offer on the table for {v.header.name}. Their camp expects an answer from them within about {v.header.rival.weeks} week{v.header.rival.weeks === 1 ? '' : 's'}, and knows it has options.
        </p>
      )}
      <div className="n54-grid">
        <div className="n54-left">
          <ChatLog lines={v.log} f={fv} label="The conversation" counterCard={open ? counterCard : null} counterAfter={lastCounterIndex(v.log)} />
          {open ? (
            <div className="n54-moves" role="group" aria-label="Your move">
              <div className="caps">Your move</div>
              <div className="n54-row">
                <button type="button" className="btn n54-btn" data-testid="ask-priorities" disabled={v.told.priorities.length >= 3} onClick={() => run({ kind: 'ask', topic: 'priorities' })}>Ask what their camp is looking for</button>
                {v.canAskAmbition && <button type="button" className="btn n54-btn" data-testid="ask-ambition" onClick={() => run({ kind: 'ask', topic: 'ambition' })}>Ask what the fighter wants from their career</button>}
                <button type="button" className="btn n54-btn" data-testid="ask-time" onClick={() => run({ kind: 'time' })}>Ask for time</button>
                <Walk onWalk={() => run({ kind: 'walk' })} />
              </div>
              <div className="n54-propose">
                <SigningForecastBox fighterId={id} offer={offer} kind={kind} label="if you make this offer and it is accepted" />
                <div className="n54-draft" data-testid="draft-summary"><span className="caps dim">Current draft</span> {summary}</div>
                <button type="button" className="btn primary big n54-btn" data-testid="talk-propose" disabled={cannotAfford} onClick={() => run({ kind: 'propose', offer })}>Make this offer ▸</button>
              </div>
              {cannotAfford && <p className="red" role="alert">You can't afford that signing bonus ({money(cash, false)} in the bank).</p>}
            </div>
          ) : (
            <ClosedPanel status={v.header.status} locked={locked}>
              <div className="n54-row">
                <button type="button" className="btn n54-btn" data-testid="closed-back" onClick={() => navigate('fighter', id)}>Back to profile</button>
                <button type="button" className="btn ghost n54-btn" onClick={() => navigate('fighters')}>Fighters</button>
              </div>
            </ClosedPanel>
          )}
        </div>
        <aside className="n54-right" aria-label="Terms and information">
          {exp && <ExpectedContract x={exp} />}
          <ToldBox told={v.told} />
          {open && (
            <Collapsible title="Edit my offer" open={editorOpen} onToggle={() => setEditorOpen((x) => !x)} testid="offer-editor">
              <ContractEditor v={v} draft={offer} setDraft={setDraft} />
            </Collapsible>
          )}
          {open && <AdvicePanel list={advice} cap={3} />}
        </aside>
      </div>
    </div>
  )
}
