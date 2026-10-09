import { useEffect, useMemo, useRef, useState } from 'react'
import { CampaignPanel } from '../office/CampaignPanel'
import { formatDay } from '../../engine/calendar'
import { eventView, type CardSlot, type EventView } from '../../engine/eventViews'
import { eventAdvice, needsConfirmation, visibleAdvice } from '../../engine/advisor'
import type { BroadcastKind, MarketingLevel, PromoStrategy } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { usePrefs } from '../../store/prefs'
import { AdviceCard, AdvicePanel } from '../components/Advice'
import { Meter, RiskChip, Section } from '../components/Bits'
import { AreaChart } from '../components/Charts'
import { Modal, Stepper } from '../components/Overlay'
import { money } from '../format'
import { FightPage } from './FightPage'
import { eventPosterView } from '../../engine/eventPoster'
import { CountUp } from '../visual/CountUp'
import { EventPoster } from '../visual/EventPoster'
import { EventMediaPanel } from '../media/EventMediaPanel'
import { VenueFitList } from '../venues/VenueFitList'
import { FighterCard, type CardFighter } from '../visual/FighterCard'

const rng = (r: { lo: number; hi: number }, f: (n: number) => string = (n) => money(n)) => (Math.round(r.lo) === Math.round(r.hi) ? f(r.lo) : `${f(r.lo)} to ${f(r.hi)}`)
const num = (n: number) => Math.round(n).toLocaleString('en-GB')

const LEVELS: { k: MarketingLevel; n: string; d: string }[] = [
  { k: 'none', n: 'None', d: '£0 — word of mouth only' },
  { k: 'low', n: 'Local', d: '£500 — posters and radio' },
  { k: 'standard', n: 'Standard', d: '£2,000 — regional campaign' },
  { k: 'heavy', n: 'Heavy', d: '£5,000 — press, social, billboards' },
  { k: 'major', n: 'Major', d: '£10,000+ — national push' },
]
const STRATS: { k: PromoStrategy; n: string; d: string }[] = [
  { k: 'local', n: 'Local', d: 'Cheap and focused on hometown ties. Weak reach.' },
  { k: 'standard', n: 'Standard', d: 'Balanced reach for the money.' },
  { k: 'aggressive', n: 'Aggressive', d: 'Wider reach, costs more per head.' },
  { k: 'superstar', n: 'Superstar-led', d: 'Sells the headliner. Costly; pays off with a real star.' },
]

export function EventPage({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const act = useGame((s) => s.eventDo)
  const runNext = useGame((s) => s.runNextEventFight)
  const nightFight = useGame((s) => s.nightFight)
  const justRan = useGame((s) => s.justRan)
  const v = useMemo(() => eventView(game, id), [game, id])
  const [adding, setAdding] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [fits, setFits] = useState(false)
  const [confirmSale, setConfirmSale] = useState(false)
  const advisorMode = usePrefs((x) => x.advisor)
  const advice = useMemo(() => eventAdvice(game, id), [game, id])
  const poster = useMemo(() => eventPosterView(game, id), [game, id])
  const onCard = !!v && !!nightFight && v.card.some((c) => c.fightId === nightFight)
  const presenting = onCard && justRan === nightFight
  // Once a fight has been presented on this page it stays on screen (the event may already be complete underneath).
  const [latched, setLatched] = useState<string | null>(null)
  useEffect(() => { if (presenting) setLatched(nightFight) }, [presenting, nightFight])
  if (!v) return <><h1 className="display" style={{ fontSize: 44 }}>Event not found</h1><button className="btn" onClick={() => navigate('events')}>Back to events</button></>
  const editable = v.can.editCard
  const main = v.card.find((c) => c.slot === 'MAIN EVENT') ?? null

  return (
    <>
      <div className="v-ehero">
      <div className="hero">
        <div className="caps">{v.promotion} · {formatDay(v.day)} · {v.weeksAway > 0 ? `in ${v.weeksAway} weeks` : 'this week'}</div>
        <h1 className="display">{v.name}</h1>
        <div className="dim" style={{ marginTop: 6 }}>{v.venue.name}, {v.venue.city} · {v.venue.tierLabel} · {num(v.venue.capacity)} seats</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`pill${v.statusKey === 'fightWeek' || v.statusKey === 'live' ? ' hot' : ''}`}>{v.status}</span>
          {v.forecast && v.mine && <RiskChip risk={v.forecast.risk} />}
          <span className="dim">Card: {v.quality.label} ({v.quality.score})</span>
        </div>
        {main && (
          <div className="ev-main" data-testid="ev-main">
            <div className="caps gold">Main event · {main.division} · {main.rounds} rounds</div>
            <button className="ev-duel display" onClick={() => navigate('fight', main.fightId)} aria-label={`Tale of the tape: ${main.aName} versus ${main.bName}`}>
              <span>{main.aName}</span><i>VS</i><span>{main.bName}</span>
            </button>
            <div className="ev-recs"><span className="num">{main.aRecord}</span><span className="dim">{main.status}</span><span className="num">{main.bRecord}</span></div>
            <div className="ev-stats">
              <div><span className="caps">Tickets</span><b className="num">{num(v.sales.total)} / {num(v.sales.capacity)}</b></div>
              <div><span className="caps">Hype</span><b className="num">{v.quality.interest}</b></div>
              {v.forecast && v.mine && <div><span className="caps">Projected revenue</span><b className="num">{rng(v.forecast.revenue)}</b></div>}
              {v.result && <div><span className="caps">Actual revenue</span><b className="num">{money(v.finance.totalRevenue, false)}</b></div>}
            </div>
            <button className="btn small" onClick={() => navigate('fight', main.fightId)}>Tale of the tape ▸</button>
          </div>
        )}
      </div>
      {poster && <EventPoster v={poster} size="lead" />}
      </div>
      {v.mine && v.nextStep && v.statusKey !== 'cancelled' && <div className="attn info" style={{ marginTop: 14 }}><div className="t">{v.nextStep}</div></div>}
      {v.statusKey === 'cancelled' && <p className="attn critical">This show was cancelled: {v.cancelReason}.</p>}

      {v.mine && v.open && v.statusKey !== 'cancelled' && <BuildSteps v={v} />}
      {v.statusKey !== 'cancelled' && <EventMediaPanel eventId={v.id} mine={v.mine} open={v.open} />}
      <AdvicePanel list={advice} cap={3} title="Promoter’s desk" />

      {v.can.run && <NightPanel v={v} runNext={runNext} nightFight={nightFight} />}
      {v.result && !presenting && <CompletePanel v={v} />}
      {!v.can.run && nightFight && onCard && (presenting || latched === nightFight || (!v.result && v.open)) && <FightPage id={nightFight} />}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <div id="eb-card" /><Section title="Fight card" right={editable ? <button className="btn small" onClick={() => setAdding(true)}>Add a fight</button> : <span className="dim" style={{ fontSize: 13 }}>{v.card.length} fights · min {v.venue.minFights}, max {v.venue.maxFights}</span>}>
            {v.card.length === 0 ? <p className="empty">The card is empty. Agree fights in Matchmaking, then add them here (opener first, headliner last).</p> : (
              <div>
                {[...v.card].reverse().map((s) => <SlotRow key={s.fightId} s={s} n={v.card.length} editable={editable} eventId={v.id} />)}
              </div>
            )}
            {v.problems.length > 0 && v.mine && <p className="warn" style={{ marginTop: 8 }}>{v.problems[0]}</p>}
            <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Card quality {v.quality.score}/100 — main event {v.quality.main}, co-main {v.quality.coMain}, depth {v.quality.depth}. Quality is judged from public information: records, reputation, popularity and how competitive each fight looks.</p>
          </Section>

          {v.mine && v.open && (
            <>
              <div id="eb-pricing" /><Section title="Tickets" right={<span className="dim" style={{ fontSize: 13 }}>Suggested GA £{v.refPrices.ga}</span>}>
                <div className="grid-3">
                  {(['ga', 'premium', 'vip'] as const).map((k) => (
                    <Stepper key={k} label={{ ga: 'General admission', premium: 'Premium', vip: 'VIP' }[k]} value={v.prices[k]} step={k === 'ga' ? 5 : k === 'premium' ? 10 : 25} min={5} max={1000} format={(n) => `£${n}`} hint={`ref £${v.refPrices[k]}`} disabled={!v.can.editMoney}
                      onChange={(n) => act('setPrices', v.id, { ...v.prices, [k]: n })} />
                  ))}
                </div>
                <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Seats: {num(v.sales.inventory[0])} GA · {num(v.sales.inventory[1])} premium · {num(v.sales.inventory[2])} VIP. Higher prices earn more per fan but sell fewer seats; prices must rise from GA to VIP.</p>
              </Section>

              <div id="eb-marketing" /><Section title="Marketing">
                <div className="focus-grid">
                  {LEVELS.map((l) => (
                    <button key={l.k} className={`focus-opt${v.marketing.level === l.k ? ' on' : ''}`} aria-pressed={v.marketing.level === l.k} disabled={!v.can.editMoney}
                      onClick={() => act('setMarketing', v.id, { level: l.k })}><div className="n">{l.n}</div><div className="d">{l.d}</div></button>
                  ))}
                </div>
                {v.marketing.level === 'major' && (
                  <div style={{ marginTop: 10, maxWidth: 320 }}>
                    <Stepper label="Campaign budget" value={v.marketing.budget} step={5000} min={10000} max={250000} format={(n) => money(n, false)} disabled={!v.can.editMoney}
                      onChange={(n) => act('setMarketing', v.id, { level: 'major', budget: n })} />
                  </div>
                )}
                <div className="caps" style={{ margin: '14px 0 6px' }}>Promotion strategy</div>
                <div className="focus-grid">
                  {STRATS.map((l) => (
                    <button key={l.k} className={`focus-opt${v.marketing.strategy === l.k ? ' on' : ''}`} aria-pressed={v.marketing.strategy === l.k} disabled={!v.can.editMoney}
                      onClick={() => act('setMarketing', v.id, { strategy: l.k })}><div className="n">{l.n}</div><div className="d">{l.d}</div></button>
                  ))}
                </div>
                {v.mine && <CampaignPanel eventId={v.id} />}
                <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Budget {money(v.marketing.budget, false)} · spent so far {money(v.marketing.spent, false)}. Marketing is paid in weekly instalments and its effect shrinks as spend grows: a big building needs a big campaign.</p>
              </Section>

              <div id="eb-broadcast" /><Section title="Broadcast">
                <div className="focus-grid">
                  {v.broadcast.options.map((o) => (
                    <button key={o.kind} className={`focus-opt${v.broadcast.kind === o.kind ? ' on' : ''}`} aria-pressed={v.broadcast.kind === o.kind} disabled={!o.available || !v.can.editMoney} title={o.reason ?? undefined}
                      onClick={() => act('setBroadcast', v.id, o.kind as BroadcastKind)}>
                      <div className="n">{o.label}</div>
                      <div className="d">{o.available ? `${o.note}${o.guaranteed ? ` Fee ≈ ${money(o.guaranteed, false)}.` : ''}${o.production ? ` Production ${money(o.production, false)}.` : ''}` : o.reason}</div>
                    </button>
                  ))}
                </div>
                {v.broadcast.kind === 'ppv' && (
                  <div style={{ marginTop: 10, maxWidth: 320 }}>
                    <Stepper label="PPV price" value={v.broadcast.ppvPrice} step={1} min={5} max={60} format={(n) => `£${n.toFixed(2)}`} disabled={!v.can.editMoney}
                      onChange={(n) => act('setBroadcast', v.id, 'ppv', n)} />
                    {v.forecast && <p className="dim" style={{ fontSize: 13 }}>Forecast buys {rng(v.forecast.ppvBuys, num)} · you keep ≈55% of each purchase. PPV can flop on a card without a draw.</p>}
                  </div>
                )}
              </Section>

              <div id="eb-sponsors" /><Section title="Sponsors" right={v.can.sponsors ? <button className="linkbtn" onClick={() => act('refreshSponsors', v.id)}>Look for new offers</button> : undefined}>
                {v.sponsor.offers.length === 0 ? <p className="empty">No offers yet. Sponsors appear once the card has a main event.</p> : v.sponsor.offers.map((o) => {
                  const on = v.sponsor.accepted?.id === o.id
                  return (
                    <div key={o.id} className={`attn${on ? ' info' : ''}`}>
                      <div>
                        <div className="t">{o.brand} — {money(o.fixedFee, false)}</div>
                        <div className="d">Needs a headliner with popularity ≥ {o.minMainPopularity} (half fee otherwise){o.attendanceBonus ? ` · +${money(o.attendanceBonus.amount, false)} if ${num(o.attendanceBonus.threshold)}+ attend` : ''}{o.qualityBonus ? ` · +${money(o.qualityBonus.amount, false)} if event reputation ≥ ${o.qualityBonus.threshold}` : ''}</div>
                      </div>
                      {v.can.sponsors && <button className="btn small go" onClick={() => act('chooseSponsor', v.id, on ? null : o.id)}>{on ? 'Accepted ✓ (undo)' : 'Accept'}</button>}
                    </div>
                  )
                })}
              </Section>
            </>
          )}
        </div>

        <div>
          <div id="eb-review" />
          {v.forecast && v.mine && <ForecastPanel v={v} />}
          {v.sales.trend !== 'not on sale' && <SalesPanel v={v} />}
          {v.mine && v.open && v.can.editCard && (
            <Section title="Venue fit" right={<button className="linkbtn" onClick={() => setFits((x) => !x)}>{fits ? 'Hide' : 'Compare venues'}</button>}>
              {fits ? <VenueFitList eventId={v.id} currentVenueId={v.venue.id} /> : <p className="dim" style={{ fontSize: 13 }}>See how this card would fill every venue, using only public information.</p>}
            </Section>
          )}
          <FinancePanel v={v} />
          {v.mine && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {v.statusKey === 'cardBuilding' && <button className="btn primary big" disabled={!v.can.putOnSale} onClick={() => { const top = visibleAdvice(advice, advisorMode, 1)[0]; if (needsConfirmation(top)) setConfirmSale(true); else act('putOnSale', v.id) }}>Put on sale ▸</button>}
              {v.can.cancel && <button className="btn ghost" onClick={() => setConfirmCancel(true)}>Cancel the show</button>}
            </div>
          )}
        </div>
      </div>

      {adding && (
        <Modal title="Add a fight to the card" onClose={() => setAdding(false)} wide>
          {v.addable.length === 0 ? <p className="empty">You have no agreed fights waiting. Agree terms in Matchmaking first — then they appear here.</p> : v.addable.map((a) => (
            <div key={a.fightId} className="attn">
              <div><div className="t">{a.label}</div>{a.reason && <div className="d warn">{a.reason}</div>}</div>
              <button className="btn small go" disabled={!!a.reason} onClick={() => { if (act('addFight', v.id, a.fightId)) setAdding(false) }}>Add</button>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><button className="linkbtn" onClick={() => { setAdding(false); navigate('matchmaking') }}>Make a new fight in Matchmaking ▸</button></div>
        </Modal>
      )}
      {confirmSale && (
        <Modal title="Before you put this on sale" onClose={() => setConfirmSale(false)} wide>
          {visibleAdvice(advice, advisorMode, 3).filter((a) => a.level === 'highRisk' || a.level === 'critical' || a.level === 'caution').map((a) => <AdviceCard key={a.id} a={a} />)}
          <p className="dim" style={{ fontSize: 13, margin: '8px 0 14px' }}>This is your call. Ticket sales and sponsors are estimates, and the costs are real. You can still cancel later, but a late cancellation costs reputation and fees.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => setConfirmSale(false)}>Review Event</button>
            <button className="btn primary" onClick={() => { setConfirmSale(false); act('putOnSale', v.id) }}>Proceed Anyway</button>
          </div>
        </Modal>
      )}
      {confirmCancel && (
        <Modal title="Cancel this show?" onClose={() => setConfirmCancel(false)}>
          <p style={{ marginBottom: 12 }}>Ticket-holders are refunded in full. {v.weeksAway >= 8 ? 'Because there is plenty of notice, half the venue fee comes back.' : 'With so little notice the venue keeps its fee.'} Fighters stay on your roster; fights that were only waiting on this show go back to “agreed”, but anything already in camp is called off. Your reputation takes a knock.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setConfirmCancel(false)}>Keep the show</button>
            <button className="btn primary" onClick={() => { act('cancel', v.id); setConfirmCancel(false) }}>Cancel the show</button>
          </div>
        </Modal>
      )}
    </>
  )
}

const slotFighter = (id: string, name: string, record: string, division: string): CardFighter => {
  const i = name.lastIndexOf(' ')
  return { id, name, firstName: i > 0 ? name.slice(0, i) : name, lastName: i > 0 ? name.slice(i + 1) : '', division, record }
}


const STEPS: { k: string; n: string; id: string; what: string }[] = [
  { k: 'venue', n: 'Venue', id: 'eb-card', what: 'Where the night happens — it sets capacity and cost.' },
  { k: 'card', n: 'Card', id: 'eb-card', what: 'The fights people pay to see. A main event is essential.' },
  { k: 'pricing', n: 'Pricing', id: 'eb-pricing', what: 'Ticket prices: higher earns more per seat but sells slower.' },
  { k: 'marketing', n: 'Marketing', id: 'eb-marketing', what: 'Spend to build awareness before the doors open.' },
  { k: 'broadcast', n: 'Broadcast', id: 'eb-broadcast', what: 'TV, streaming or pay-per-view income against production cost.' },
  { k: 'sponsors', n: 'Sponsors', id: 'eb-sponsors', what: 'Fixed fees with conditions on the headliner.' },
  { k: 'review', n: 'Review', id: 'eb-review', what: 'Check the forecast and the advisor’s warnings.' },
  { k: 'live', n: 'Go live', id: 'eb-review', what: 'Put the show on sale. Costs become real.' },
]

function BuildSteps({ v }: { v: EventView }) {
  const preSale = v.statusKey === 'venueBooked' || v.statusKey === 'cardBuilding'
  const cardOk = v.card.length >= v.venue.minFights && v.problems.length === 0
  const done: Record<string, boolean> = {
    venue: true, card: cardOk, pricing: !preSale, marketing: !preSale, broadcast: !preSale,
    sponsors: !!v.sponsor.accepted || !preSale, review: !preSale, live: !preSale,
  }
  const cur = STEPS.findIndex((st) => !done[st.k])
  const go = (id: string) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
  const f = v.forecast
  return (
    <nav className="build-steps" aria-label="Event building steps" data-testid="build-steps">
      <ol>
        {STEPS.map((st, i) => (
          <li key={st.k} className={done[st.k] ? 'done' : i === cur ? 'cur' : ''}>
            <button onClick={() => go(st.id)} aria-current={i === cur ? 'step' : undefined}><span className="bs-n">{done[st.k] ? '✓' : i + 1}</span><span className="bs-t">{st.n}</span></button>
          </li>
        ))}
      </ol>
      <div className="bs-info">
        <div><span className="caps">Building</span> <b>{cur >= 0 ? STEPS[cur].n : 'Live'}</b> — <span className="dim">{cur >= 0 ? STEPS[cur].what : 'The show is on sale.'}</span></div>
        {f && <div className="bs-fin"><span className="caps">Risk</span> <RiskChip risk={f.risk} /> <span className="caps">Costs</span> <b className="num">{rng(f.costs)}</b> <span className="caps">Earnings</span> <b className={`num ${f.profit.hi < 0 ? 'red' : ''}`}>{rng(f.profit)}</b></div>}
      </div>
    </nav>
  )
}

function SlotRow({ s, n, editable, eventId }: { s: CardSlot; n: number; editable: boolean; eventId: string }) {
  const act = useGame((x) => x.eventDo)
  const navigate = useGame((x) => x.navigate)
  const top = s.slot === 'MAIN EVENT'
  return (
    <div className={`slot ${top ? 'main' : s.slot === 'CO-MAIN' ? 'co' : ''}`}>
      <div className="slot-tag caps">{s.slot}</div>
      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate('fight', s.fightId)}>
        <div className="slot-cards">
          <FighterCard f={slotFighter(s.aId, s.aName, s.aRecord, s.division)} size="compact" badge={s.winner === 0 ? <span className="chip gold">WINNER</span> : undefined} />
          <span className="dim">vs</span>
          <FighterCard f={slotFighter(s.bId, s.bName, s.bRecord, s.division)} size="compact" badge={s.winner === 1 ? <span className="chip gold">WINNER</span> : undefined} />
        </div>
        <div className="fighter-sub">{s.aRecord} / {s.bRecord} · {s.division} · {s.rounds} rds · {s.appealLabel}</div>
        {s.result && <div className="fighter-sub">{s.result}</div>}
      </div>
      {!s.result && <span className="dim" style={{ fontSize: 12.5 }}>{s.status}</span>}
      {editable && (
        <div className="slot-ctl">
          <button className="btn small ghost" aria-label="Move up the card" disabled={s.index === n - 1} onClick={() => act('moveFight', eventId, s.fightId, 1)}>▲</button>
          <button className="btn small ghost" aria-label="Move down the card" disabled={s.index === 0} onClick={() => act('moveFight', eventId, s.fightId, -1)}>▼</button>
          {!top && n >= 2 && <button className="btn small ghost" onClick={() => act('setSlot', eventId, s.fightId, 'main')}>Make main</button>}
          {s.slot === 'UNDERCARD' && n >= 3 && <button className="btn small ghost" onClick={() => act('setSlot', eventId, s.fightId, 'coMain')}>Make co-main</button>}
          <button className="btn small ghost" onClick={() => act('removeFight', eventId, s.fightId)}>Remove</button>
        </div>
      )}
    </div>
  )
}

function ForecastPanel({ v }: { v: EventView }) {
  const f = v.forecast!
  const att = f.attendance
  return (
    <Section title="Forecast" right={<RiskChip risk={f.risk} />}>
      <p className="dim" style={{ fontSize: 13, marginBottom: 8 }}>Ranges from public information. They narrow as you run more shows. The real result can land outside them.</p>
      <dl>
        <div className="kv"><dt>Attendance</dt><dd>{rng(att, num)} <span className="dim">({Math.round(f.fill.lo * 100)}–{Math.round(f.fill.hi * 100)}% full)</span></dd></div>
        <div className="kv"><dt>Gate</dt><dd>{rng(f.ticketRevenue)}</dd></div>
        <div className="kv"><dt>Sponsorship</dt><dd>{f.sponsorship.hi > 0 ? rng(f.sponsorship) : '—'}</dd></div>
        <div className="kv"><dt>Broadcast</dt><dd>{v.broadcast.kind === 'none' ? '—' : v.broadcast.kind === 'ppv' ? `PPV ${rng(f.ppvRevenue)}` : rng(f.broadcast)}</dd></div>
        <div className="kv"><dt>Total revenue</dt><dd><b>{rng(f.revenue)}</b></dd></div>
        <div className="kv"><dt>Total costs</dt><dd><b>{rng(f.costs)}</b></dd></div>
        <div className="kv"><dt>Profit</dt><dd className={f.profit.hi < 0 ? 'red' : f.profit.lo > 0 ? 'good' : ''}><b>{rng(f.profit)}</b></dd></div>
        <div className="kv"><dt>Atmosphere</dt><dd>{rng(f.atmosphere, (n) => `${Math.round(n)}`)} / 100</dd></div>
      </dl>
      {f.warnings.map((w) => <p key={w} className="warn" style={{ marginTop: 8, fontSize: 13.5 }}>{w}</p>)}
    </Section>
  )
}

function SalesPanel({ v }: { v: EventView }) {
  const s = v.sales
  return (
    <Section title="Ticket sales" right={<span className={`chip ${s.trend === 'slowing' ? 'red' : s.trend === 'accelerating' ? 'good' : ''}`}>{s.trend}</span>}>
      <div className="kpis" style={{ marginBottom: 10 }}>
        <div className="kpi"><div className="caps">Sold</div><div className="v num" style={{ fontSize: 28 }}>{num(s.total)}</div><div className="s">of {num(s.capacity)} ({s.fillPct}%)</div></div>
        <div className="kpi"><div className="caps">Awareness</div><div className="v num" style={{ fontSize: 28 }}>{s.awareness}</div><div className="s">/ 100</div></div>
      </div>
      <Meter value={s.fillPct} tone="gold" label="Seats sold" />
      <dl style={{ marginTop: 8 }}>
        <div className="kv"><dt>General admission</dt><dd>{num(s.sold[0])} / {num(s.inventory[0])}</dd></div>
        <div className="kv"><dt>Premium</dt><dd>{num(s.sold[1])} / {num(s.inventory[1])}</dd></div>
        <div className="kv"><dt>VIP</dt><dd>{num(s.sold[2])} / {num(s.inventory[2])}</dd></div>
      </dl>
      {s.history.length > 1 && <AreaChart points={s.history.map((y, i) => ({ x: i, y }))} height={110} color="var(--gold)" formatY={(n) => num(n)} />}
    </Section>
  )
}

function FinancePanel({ v }: { v: EventView }) {
  const f = v.finance
  const rows: [string, number][] = [
    ['Tickets', f.revenue.tickets], ['Sponsorship', f.revenue.sponsorship], ['Broadcast', f.revenue.broadcast], ['PPV', f.revenue.ppv],
  ]
  const costs: [string, number][] = [
    ['Venue', f.costs.venue], ['Marketing', f.costs.marketing], ['Production', f.costs.production + f.costs.broadcast], ['Fighter purses', f.costs.purses + f.costs.bonuses], ['Officials & medical', f.costs.officials], ['Security', f.costs.security],
  ]
  if (f.totalRevenue === 0 && f.totalCosts === 0) return null
  return (
    <Section title={v.result ? 'Final accounts' : 'Money so far'}>
      <dl>
        {rows.filter(([, n]) => n !== 0).map(([k, n]) => <div className="kv" key={k}><dt>{k}</dt><dd className="good">+{money(n, false)}</dd></div>)}
        {costs.filter(([, n]) => n !== 0).map(([k, n]) => <div className="kv" key={k}><dt>{k}</dt><dd>−{money(n, false)}</dd></div>)}
        <div className="kv"><dt><b>{v.result ? 'Profit' : 'Net so far'}</b></dt><dd className={f.profit >= 0 ? 'good' : 'red'}><b>{f.profit >= 0 ? '+' : ''}{money(f.profit, false)}</b></dd></div>
      </dl>
      {!v.result && <p className="dim" style={{ fontSize: 13 }}>Sponsor, broadcast and PPV money arrives when the show is settled after the final bell.</p>}
    </Section>
  )
}

function NightPanel({ v, runNext, nightFight }: { v: EventView; runNext: (id: string) => string | null; nightFight: string | null }) {
  const act = useGame((s) => s.eventDo)
  const pending = v.card.filter((c) => c.statusKey === 'fightNight')
  const next = pending[0]
  const done = v.card.filter((c) => c.result)
  const mainNext = next?.slot === 'MAIN EVENT'
  return (
    <div className="night-wrap">
      <div className="night-banner" style={{ marginTop: 18 }}>
        <div>
          <div className="caps">Show night · {v.venue.name} · {num(v.sales.total)} in the building ({v.sales.fillPct}%){v.broadcast.kind === 'ppv' ? ' · PPV' : v.broadcast.kind !== 'none' ? ' · Broadcast live' : ''}</div>
          <div className="display" style={{ fontSize: 28 }}>{mainNext ? 'The main event' : next ? `Up next: ${next.slot.toLowerCase()}` : 'The night is done'}</div>
          {next && <div className="dim">{next.aName} vs {next.bName} · {next.division}</div>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {next && <button className="btn primary big" onClick={() => runNext(v.id)}>{mainNext ? 'Ring the bell ▸' : `Run: ${next.aName} v ${next.bName}`}</button>}
          {pending.length > 1 && <button className="btn ghost" onClick={() => act('quickSim', v.id, true)}>Quick-sim the undercard</button>}
          {pending.length > 0 && <button className="btn ghost" onClick={() => act('runToEnd', v.id)}>Skip to the end</button>}
        </div>
      </div>
      {mainNext && next && (
        <div className="main-card">
          <div className="caps">Main event · {next.rounds} rounds · {next.division}</div>
          <div className="display" style={{ fontSize: 40, marginTop: 6 }}>{next.aName} <span className="dim">vs</span> {next.bName}</div>
          <div className="dim">{next.aRecord} · {next.bRecord} · {next.appealLabel}</div>
        </div>
      )}
      {done.length > 0 && <div className="dim" style={{ margin: '10px 0', fontSize: 13.5 }}>{done.length} fight{done.length > 1 ? 's' : ''} done tonight. Results are on the card below.</div>}
      {nightFight && <FightPage id={nightFight} />}
    </div>
  )
}

function CompletePanel({ v }: { v: EventView }) {
  const ref = useRef<HTMLDivElement>(null)
  // arriving here (from Fight Night, or by opening a finished show) puts the wrap-up on screen
  useEffect(() => { const t = setTimeout(() => ref.current?.scrollIntoView?.({ block: 'start' }), 80); return () => clearTimeout(t) }, [])
  const r = v.result!
  const navigate = useGame((s) => s.navigate)
  const main = v.card[v.card.length - 1]
  return (
    <div className="complete" ref={ref} data-testid="event-complete">
      <div className="caps" style={{ color: 'var(--gold)' }}>Event complete</div>
      <h2 className="display" style={{ fontSize: 44, margin: '4px 0 12px' }}>{v.name}</h2>
      <div className="kpis">
        <div className="kpi"><div className="caps">Attendance</div><div className="v num"><CountUp value={r.attendance} from={0} fmt={num} /></div><div className="s">{Math.round((100 * r.attendance) / v.venue.capacity)}% of {num(v.venue.capacity)}</div></div>
        <div className="kpi"><div className="caps">Profit</div><div className={`v num ${r.profit >= 0 ? 'good' : 'red'}`}><CountUp value={r.profit} from={0} fmt={(n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`} ms={1100} /></div><div className="s"><CountUp value={r.revenue} from={0} fmt={(n) => money(n)} /> in · <CountUp value={r.costs} from={0} fmt={(n) => money(n)} /> out</div></div>
        <div className="kpi"><div className="caps">Atmosphere</div><div className="v num">{r.atmosphere}</div><div className="s">/ 100</div></div>
        <div className="kpi"><div className="caps">Event rating</div><div className="v num">{r.reputation}</div><div className="s">/ 100 · card {r.cardQuality}</div></div>
        {r.ppvBuys > 0 && <div className="kpi"><div className="caps">PPV buys</div><div className="v num">{num(r.ppvBuys)}</div></div>}
      </div>
      {main && main.result && <p style={{ marginTop: 10 }}><span className="caps">Main event</span> · <b>{main.result}</b>{main.method ? ` · ${main.method}` : ''}</p>}
      <dl style={{ marginTop: 12 }}>
        <div className="kv"><dt>Promotion reputation</dt><dd className={r.promoRepDelta >= 0 ? 'good' : 'red'}><CountUp value={r.promoRepDelta} from={0} fmt={(n) => `${n >= 0 ? '+' : ''}${n}`} /></dd></div>
        <div className="kv"><dt>Fanbase</dt><dd className={r.fanDelta >= 0 ? 'good' : 'red'}><CountUp value={r.fanDelta} from={0} fmt={(n) => `${n >= 0 ? '+' : '−'}${num(Math.abs(n))}`} /></dd></div>
        {v.riserNames.length > 0 && <div className="kv"><dt>Biggest popularity moves</dt><dd>{v.riserNames.map((x) => `${x.name} ${x.delta >= 0 ? '+' : ''}${x.delta}`).join(' · ')}</dd></div>}
      </dl>
      {r.notable.length > 0 && <ul className="notable">{r.notable.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div style={{ marginTop: 14 }}><button className="btn primary big" data-testid="end-event" onClick={() => navigate('events')}>End event ▸</button></div>
    </div>
  )
}
