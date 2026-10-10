import { useMemo } from 'react'
import { deskAdvice } from '../../engine/advisor'
import { firstSteps } from '../../engine/onboarding'
import { objectiveStatuses, scenarioById } from '../../engine/scenarios'
import { usePrefs } from '../../store/prefs'
import { formatDay, weekOfYear } from '../../engine/calendar'
import { fightList, fightView } from '../../engine/fightViews'
import { dashboardEvent, eventView } from '../../engine/eventViews'
import { eventPosterView } from '../../engine/eventPoster'
import { opViews } from '../../engine/quotes'
import { offersWaiting } from '../../engine/office/views'
import { myTitlePaths } from '../../engine/business/views'
import { attentionItems, cashRunwayWeeks, financialHealth, player, weeklyBurn } from '../../engine/selectors'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { AdvicePanel } from '../components/Advice'
import { mediaTeaser } from '../../engine/media/views'
import { StoryCard, useOpenStory } from '../media/MediaBits'
import { TierPanel } from '../components/TierPanel'
import { sponsorView } from '../../engine/sponsors'
import { Meter, RiskChip, Section } from '../components/Bits'
import { AreaChart } from '../components/Charts'
import { RangeText } from '../components/Estimates'
import { compactNumber, money } from '../format'
import { tierLabel } from '../../engine/tiers'
import { cardFighter, FighterCard } from '../visual/FighterCard'
import { FighterPortrait } from '../visual/FighterPortrait'
import { NewsCard } from '../visual/NewsCard'
import { VenueImage } from '../visual/VenueImage'
import { CountUp } from '../visual/CountUp'
import { KIND_CLASS, msgKind } from '../inboxKinds'

const PRIO: Record<string, number> = { urgent: 0, important: 1, normal: 2 }

export function Dashboard() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const openLink = useGame((s) => s.openLink)
  const advance = useGame((s) => s.advance)
  const p = player(game)
  const views = useViews()
  const roster = useMemo(() => views.mine().sort((a, b) => b.grade.mid - a.grade.mid), [views])
  const hot = views.freeAgents().filter((v) => v.status === 'active').sort((a, b) => b.reputation + b.popularity - (a.reputation + a.popularity)).slice(0, 4)
  const ops = opViews(game).filter((o) => o.status === 'active')
  const myFights = fightList(game, 'mine-open')
  const night = myFights.find((f) => f.statusKey === 'fightNight')
  const nextFightItem = myFights.find((f) => ['scheduled', 'training', 'fightNight'].includes(f.statusKey)) ?? myFights.find((f) => f.statusKey === 'agreed') ?? null
  const nextFight = nextFightItem ? fightView(game, nextFightItem.id) : null
  const lastResult = fightList(game, 'mine-results').slice(0, 1)[0] ?? null
  const attention = attentionItems(game)
  const runway = cashRunwayWeeks(game)
  const burn = weeklyBurn(game)
  const de = dashboardEvent(game)
  const ev = de.next ? eventView(game, de.next.id) : null
  const poster = de.next ? eventPosterView(game, de.next.id) : null
  const main = ev && ev.card.length ? ev.card[ev.card.length - 1] : null
  const health = financialHealth(game)
  const allDesk = deskAdvice(game, 'full', 12)
  const sc = scenarioById(game.scenario?.id)
  const objectives = objectiveStatuses(game)
  const steps = firstSteps(game)
  const spons = sponsorView(game)
  const stepsHidden = usePrefs((s) => s.firstStepsHidden)
  const hideSteps = usePrefs((s) => s.hideFirstSteps)
  const showSteps = !stepsHidden && steps.some((s) => !s.done)
  const mail = useMemo(() => [...game.inbox].filter((m) => !m.read).sort((a, b) => (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2) || b.day - a.day).slice(0, 4), [game.inbox])
  const unread = game.inbox.filter((m) => !m.read).length
  const teaser = useMemo(() => mediaTeaser(game), [game])
  const openStory = useOpenStory()

  const urgent = attention.filter((a) => a.severity === 'critical' || a.severity === 'warning')
  const topUrgent = urgent.slice(0, 3)
  const restAttention = attention.filter((a) => !topUrgent.includes(a))
  const openTalks = Object.values(game.business?.talks ?? {}).filter((t) => t.status === 'open').length
  const offersIn = offersWaiting(game)
  const paths = useMemo(() => myTitlePaths(game), [game])
  const titleReady = paths.filter((x) => x.readyCount > 0).length
  const titleOrders = paths.filter((x) => x.targets.some((t) => t.standing === 'mandatory' || t.ordered)).length
  const titleHolders = paths.filter((x) => x.champion).length
  const expiring = attention.filter((a) => a.id.startsWith('contract-')).length

  const nContenders = roster.filter((v) => v.stage === 'Contender').length
  const nProspects = roster.filter((v) => v.stage === 'Prospect' || v.stage === 'Debutant' || v.stage === 'Rising').length
  const nInjured = roster.filter((v) => v.availability.status === 'injured').length

  return (
    <>
      <header className="desk-head">
        <div>
          <div className="caps">Week {weekOfYear(game.today)} · {formatDay(game.today)}</div>
          <h1 className="display">Promoter’s <em>Desk</em></h1>
          <div className="dim" style={{ marginTop: 4 }}>{p.name} · promoter {p.promoterName}</div>
        </div>
        <div className="desk-actions">
          <button className="btn primary big" data-testid="desk-advance" onClick={() => advance(1)}>Advance Week ▸</button>
          <button className="btn ghost" onClick={() => advance(4)}>+4 Weeks</button>
        </div>
      </header>

      {night && (
        <div className="night-banner" data-testid="desk-night">
          <div><div className="caps">Fight night</div><div className="display" style={{ fontSize: 30 }}>{night.aName} vs {night.bName}</div></div>
          <button className="btn primary big" style={{ marginLeft: 'auto' }} onClick={() => navigate('fight', night.id)}>Go to the fight ▸</button>
        </div>
      )}


      {/* ---------------------------------------------------------------- COMMAND STRIP */}
      <section className="cmd" aria-label="Promotion status" data-testid="desk-strip">
        <button type="button" className={`cmd-tile ${runway !== null && runway < 8 || p.cash < 0 ? 'bad' : runway !== null && runway < 26 ? 'warn' : ''}`} onClick={() => navigate('finances')}>
          <span className="caps">Cash</span>
          <b className="num">{money(p.cash)}</b>
          <small>{p.cash < 0 ? 'Overdrawn' : runway === null ? 'No running costs' : `${runway} weeks of runway`} · {health.label}</small>
        </button>
        <button type="button" className={`cmd-tile ${nInjured || expiring ? 'warn' : ''}`} onClick={() => navigate('fighters')}>
          <span className="caps">Roster</span>
          <b className="num">{roster.length - nInjured} <em>of {roster.length} fit</em></b>
          <small>{nInjured ? `${nInjured} injured` : 'None injured'} · {expiring ? `${expiring} contract${expiring === 1 ? '' : 's'} ending` : 'contracts secure'}</small>
        </button>
        <button type="button" className="cmd-tile" onClick={() => (de.next ? navigate('event', de.next.id) : navigate('events'))}>
          <span className="caps">Next show</span>
          <b className="num">{de.next ? (de.next.weeksAway > 0 ? `${de.next.weeksAway} wk` : 'This week') : 'None booked'}</b>
          <small>{de.next ? `${de.next.name} · ${de.next.status}` : 'Plan a show to earn'}</small>
        </button>
        <button type="button" className={`cmd-tile ${offersIn || openTalks ? 'live' : ''}`} onClick={() => navigate(offersIn ? 'office' : 'matchmaking')} data-testid="cmd-talks">
          <span className="caps">Offers & talks</span>
          <b className="num">{offersIn + openTalks}</b>
          <small>{offersIn} fight offer{offersIn === 1 ? '' : 's'} in · {openTalks} open conversation{openTalks === 1 ? '' : 's'}</small>
        </button>
        <button type="button" className={`cmd-tile ${titleReady || titleOrders ? 'gold' : ''}`} onClick={() => navigate('titles')} data-testid="cmd-titles">
          <span className="caps">Titles</span>
          <b className="num">{titleHolders ? `${titleHolders} champion${titleHolders === 1 ? '' : 's'}` : titleReady ? `${titleReady} ready` : '—'}</b>
          <small>{titleReady ? `${titleReady} can ask for a title fight` : titleOrders ? `${titleOrders} ordered by a board` : 'No title opportunity yet'}</small>
        </button>
      </section>

      {topUrgent.length > 0 && (
        <section className="needs" aria-label="Needs your attention" data-testid="desk-needs">
          <div className="sec-head"><h2 className="display">Needs you</h2><span className="dim" style={{ fontSize: 13 }}>{urgent.length} item{urgent.length === 1 ? '' : 's'}</span></div>
          {topUrgent.map((a) => (
            <div key={a.id} className={`attn ${a.severity}`}>
              <div><div className="t">{a.title}</div><div className="d">{a.detail}</div></div>
              {a.link && <button className="btn small go" onClick={() => openLink(a.link!)}>{a.actionLabel ?? 'Open'}</button>}
            </div>
          ))}
        </section>
      )}

      {/* ---------------------------------------------------------------- NEXT EVENT */}
      <section className={`desk-hero${de.next ? '' : ' empty'}`} data-testid="desk-event" aria-label="Next event">
        {de.next && poster && <div className="dh-bg" aria-hidden><VenueImage venue={poster.venue} /></div>}
        {de.next && ev && main ? (
          <>
            <div className="dh-top">
              <div>
                <div className="caps gold">Next event · {de.next.weeksAway > 0 ? `in ${de.next.weeksAway} week${de.next.weeksAway === 1 ? '' : 's'}` : 'this week'} · {de.next.status}</div>
                <h2 className="display dh-title">{de.next.name}</h2>
                <div className="dh-meta">{formatDay(de.next.day)} · {de.next.venueName}, {de.next.city}</div>
              </div>
              {de.risk && <RiskChip risk={de.risk} />}
            </div>
            <div className="dh-main">
              <div className="dh-label caps">Main event</div>
              <div className="dh-duel">
                <button type="button" className="dh-fighter a" onClick={() => navigate('fighter', main.aId)}>
                  {poster?.main && <FighterPortrait f={poster.main.a} size="large" eager />}
                  <span className="display dh-name">{main.aName}</span><span className="num dh-rec">{main.aRecord}</span>
                </button>
                <div className="dh-vs display">VS</div>
                <button type="button" className="dh-fighter b" onClick={() => navigate('fighter', main.bId)}>
                  {poster?.main && <FighterPortrait f={poster.main.b} size="large" eager />}
                  <span className="display dh-name">{main.bName}</span><span className="num dh-rec">{main.bRecord}</span>
                </button>
              </div>
              <div className="dh-sub dim">{main.division} · {main.rounds} rounds · {ev.card.length} fight{ev.card.length === 1 ? '' : 's'} on the card</div>
            </div>
            <dl className="dh-stats">
              <div><dt>Tickets sold</dt><dd className="num"><CountUp value={de.next.sold} from={0} />{' '}<small>/ {de.next.capacity.toLocaleString('en-GB')}</small></dd><div className="dh-bar"><Meter value={de.next.fillPct} tone="gold" label="Tickets sold" /></div></div>
              <div><dt>Fight hype</dt><dd className="num">{main.appealLabel}</dd><small className="dim">card: {ev.quality.label}</small></div>
              <div><dt>Projected revenue</dt><dd className="num">{ev.forecast ? money(ev.forecast.revenue.lo + (ev.forecast.revenue.hi - ev.forecast.revenue.lo) / 2) : '—'}</dd><small className="dim">{ev.forecast ? `${money(ev.forecast.revenue.lo)} – ${money(ev.forecast.revenue.hi)}` : 'forecast appears with a card'}</small></div>
              <div><dt>Projected profit</dt><dd className={`num ${ev.forecast && ev.forecast.profit.hi < 0 ? 'red' : ''}`}>{ev.forecast ? `${money(ev.forecast.profit.lo)} to ${money(ev.forecast.profit.hi)}` : '—'}</dd></div>
            </dl>
            <div className="dh-foot">
              {de.actions.length > 0 && <div className="warn dh-todo">To do: {de.actions.join(' · ')}</div>}
              <button className="btn primary big" data-testid="desk-manage" onClick={() => navigate('event', de.next!.id)}>Manage event ▸</button>
            </div>
          </>
        ) : de.next && ev ? (
          <div className="dh-empty">
            <div className="caps gold">Next event · {de.next.status}</div>
            <h2 className="display dh-title">{de.next.name}</h2>
            <div className="dh-meta">{formatDay(de.next.day)} · {de.next.venueName}</div>
            <p className="dim">No main event yet. Agree a fight and add it to the card.</p>
            <button className="btn primary big" onClick={() => navigate('event', de.next!.id)}>Build the card ▸</button>
          </div>
        ) : (
          <div className="dh-empty">
            <div className="caps gold">No event booked</div>
            <h2 className="display dh-title">Put on a show</h2>
            <p className="dim">{de.actions[0]}</p>
            <button className="btn primary big" onClick={() => navigate('events')}>Plan a show ▸</button>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- PROMOTION / ROSTER / NEXT FIGHT */}
      <div className="desk-trio">
        <section className="dt-col" aria-label="Your promotion" data-testid="desk-promotion">
          <h3 className="dt-title caps">Your promotion</h3>
          <div className="dt-tier display">{tierLabel(p.tier)}</div>
          <div className="dt-name">{p.name}</div>
          <div className="dt-cash num" data-testid="desk-cash">{money(p.cash)}</div>
          <div className="dt-sub">{runway === null ? 'No running costs' : <><b className={runway < 8 ? 'red' : runway < 26 ? 'warn' : ''}>{runway} weeks</b> of runway</>} · <span className={`hp ${health.state}`}>{health.label}</span></div>
          <dl className="dt-mini">
            <div><dt>Reputation</dt><dd className="num">{Math.round(p.reputation)}<small>/100</small></dd></div>
            <div><dt>Fanbase</dt><dd className="num">{compactNumber(p.fanbase)}</dd></div>
            <div><dt>Weekly burn</dt><dd className="num">{money(burn.total, false)}</dd></div>
          </dl>
        </section>
        <section className="dt-col" aria-label="Roster" data-testid="desk-roster">
          <h3 className="dt-title caps">Roster <button className="linkbtn" onClick={() => navigate('fighters')}>Open</button></h3>
          <div className="dt-big"><span className="display">{roster.length}</span><span className="dim"> fighters</span></div>
          <dl className="dt-grid">
            <div><dd className="num">{nContenders}</dd><dt>Contenders</dt></div>
            <div><dd className="num">{nProspects}</dd><dt>Prospects</dt></div>
            <div><dd className={`num ${nInjured ? 'red' : ''}`}>{nInjured}</dd><dt>Injured</dt></div>
          </dl>
          {roster[0] && <FighterCard f={cardFighter(roster[0])} size="compact" onClick={() => navigate('fighter', roster[0].id)} meta={<span className="dim" style={{ fontSize: 12.5 }}>Top of your roster · grade <RangeText r={roster[0].grade} scouted /></span>} />}
        </section>
        <section className="dt-col" aria-label="Next fight" data-testid="desk-fight">
          <h3 className="dt-title caps">Next fight <button className="linkbtn" onClick={() => navigate('fights')}>All</button></h3>
          {nextFight ? (
            <button type="button" className="dt-fight" onClick={() => navigate(nextFight.statusKey === 'agreed' ? 'fight' : 'fight', nextFight.id)}>
              <div className="dt-duel">
                <FighterCard f={{ ...cardFighter(nextFight.a.fighter), record: nextFight.a.preRecord }} size="compact" />
                <span className="display dt-vs">VS</span>
                <FighterCard f={{ ...cardFighter(nextFight.b.fighter), record: nextFight.b.preRecord }} size="compact" />
              </div>
              <div className="dt-sub">{nextFight.division} · {nextFight.rounds} rounds · {nextFight.weeksAway ? `${nextFight.weeksAway} weeks away` : nextFight.status}</div>
              <div className="dt-sub dim">{nextFight.eventName ?? 'Not yet on a card'}{nextFight.stakes[0] ? ` · ${nextFight.stakes[0]}` : ''}</div>
            </button>
          ) : lastResult ? (
            <button type="button" className="dt-fight" onClick={() => navigate('fight', lastResult.id)}><div className="caps">Latest result</div><div className="dt-res">{lastResult.resultText}</div><div className="dt-sub dim">{lastResult.method} · {formatDay(lastResult.day, true)}</div></button>
          ) : <p className="empty">Nothing booked. Open matchmaking and put a fighter in the ring.</p>}
          {!nextFight && <button className="btn small" onClick={() => navigate('matchmaking')}>Make a fight ▸</button>}
        </section>
      </div>

      {/* ---------------------------------------------------------------- RINGSIDE REPORT */}
      <section className="desk-media" aria-label="Ringside report" data-testid="desk-media">
        <div className="sec-head"><h2 className="display">Ringside report</h2><button className="linkbtn" onClick={() => navigate('media')}>{teaser.waiting > 0 ? `${teaser.waiting} waiting on you` : 'Newsroom'}</button></div>
        {teaser.headline ? <StoryCard s={teaser.headline} variant="compact" onOpen={() => openStory(teaser.headline!)} /> : <p className="empty">The press are waiting for something to write about.</p>}
      </section>

      {/* ---------------------------------------------------------------- INBOX / DESK */}
      <div className="desk-pair">
        <section aria-label="Inbox" data-testid="desk-inbox">
          <div className="sec-head"><h2 className="display">Inbox</h2><button className="linkbtn" onClick={() => navigate('inbox')}>{unread > 0 ? `${unread} unread` : 'Open'}</button></div>
          {mail.length === 0 ? <p className="empty">You are all caught up.</p> : mail.map((m) => (
            <button key={m.id} className={`mailrow ${m.priority}`} onClick={() => (m.link ? openLink(m.link) : navigate('inbox'))}>
              <span className={`catpill ${KIND_CLASS[msgKind(m)]}`}>{msgKind(m)}</span>
              <span className="mr-s">{m.subject}</span>
              <span className="mr-d dim">{formatDay(m.day, false)}</span>
            </button>
          ))}
        </section>
        <section aria-label="What to do next" data-testid="desk-advice">
          <div className="sec-head"><h2 className="display">What next?</h2><span className="dim" style={{ fontSize: 13 }}>{restAttention.length ? `${restAttention.length} more item${restAttention.length === 1 ? '' : 's'}` : 'Nothing else'}</span></div>
          <AdvicePanel list={allDesk} cap={3} compact />
          {restAttention.slice(0, 5).map((a) => (
            <div key={a.id} className={`attn ${a.severity}`}>
              <div><div className="t">{a.title}</div><div className="d">{a.detail}</div></div>
              {a.link && <button className="btn small go" onClick={() => openLink(a.link!)}>{a.actionLabel ?? 'Open'}</button>}
            </div>
          ))}
          {restAttention.length === 0 && allDesk.length === 0 && <p className="empty">The gym is quiet — advance the week.</p>}
        </section>
      </div>

      {(sc || showSteps) && (
        <div className="grid-2" style={{ marginTop: 28 }}>
          {sc && (
            <Section title={`Your career: ${sc.name}`} right={<span className="chip">{sc.difficultyLabel}</span>}>
              {objectives.map((o) => (
                <div key={o.id} className="attn" style={{ borderLeftColor: o.done ? 'var(--good)' : undefined }}>
                  <div style={{ flex: 1 }}>
                    <div className="t">{o.done ? '✓ ' : ''}{o.label}</div>
                    <div className="d">{o.done ? 'Objective complete.' : o.progressText}</div>
                    {!o.done && <div style={{ marginTop: 6 }}><Meter value={Math.min(100, Math.round((o.value / o.target) * 100))} tone="good" label="Progress" /></div>}
                  </div>
                </div>
              ))}
            </Section>
          )}
          {showSteps && (
            <Section title="First steps" right={<button className="linkbtn" onClick={() => hideSteps(true)}>Hide</button>}>
              {steps.map((st) => (
                <div key={st.id} className={`attn${st.done ? '' : ' info'}`} style={st.done ? { opacity: 0.6 } : undefined}>
                  <div><div className="t">{st.done ? '✓ ' : ''}{st.label}</div>{!st.done && <div className="d">{st.hint}</div>}</div>
                  {!st.done && <button className="btn small go" onClick={() => navigate(st.screen as never)}>Go</button>}
                </div>
              ))}
            </Section>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- THE WORLD */}
      <Section title="Boxing news" right={<button className="linkbtn" onClick={() => navigate('news')}>All news</button>}>
        {game.news.length === 0 ? <p className="empty">The world is quiet. Advance time and the headlines will follow.</p> : (
          <div className="v-news-grid">
            {game.news.slice(0, 4).map((n) => (
              <NewsCard key={n.id} n={n} onClick={n.fightId || n.eventId || n.fighterId ? () => (n.eventId ? navigate('event', n.eventId) : n.fightId ? navigate('fight', n.fightId) : navigate('fighter', n.fighterId!)) : undefined} />
            ))}
          </div>
        )}
      </Section>

      <div className="grid-2">
        <Section title="Market watch" right={<button className="linkbtn" onClick={() => navigate('scouting')}>Scouting</button>}>
          {hot.length === 0 ? <p className="empty">Nobody notable is on the market. Send your scout looking.</p> : hot.map((v) => (
            <button key={v.id} type="button" className="mailrow" onClick={() => navigate('fighter', v.id)}>
              <span className="mr-s"><b>{v.name}</b> · {v.division} · {v.age} · {v.recordText}</span>
              <span className="mr-d"><RangeText r={v.grade} scouted={v.knowledge.reports > 0} /></span>
            </button>
          ))}
          {ops.map((o) => <div key={o.id} className="op"><div><div className="fighter-name">{o.title}</div><div className="dim" style={{ fontSize: 13 }}>{o.scoutName}</div></div><div className="caps" style={{ alignSelf: 'center' }}>{o.weeksLeft} wk left</div></div>)}
        </Section>
        <Section title="Cash trajectory" right={<button className="linkbtn" onClick={() => navigate('finances')}>Finances</button>}>
          <AreaChart points={game.financeHistory.map((h) => ({ x: h.day, y: h.cash }))} />
        </Section>
      </div>

      <div className="grid-2">
        <Section title="Promotion growth"><TierPanel /></Section>
        <Section title="Sponsors" right={<button className="linkbtn" onClick={() => navigate('sponsors')}>Open</button>}>
          {spons.deals.length === 0 && spons.offers.length === 0 ? <p className="empty">No standing sponsor yet. They approach as your promotion grows.</p> : (
            <>
              {spons.offers.length > 0 && <div className="attn info" style={{ cursor: 'pointer' }} onClick={() => navigate('sponsors')}><div><div className="t">{spons.offers[0].name} is interested</div><div className="d">{spons.offers.length > 1 ? `${spons.offers.length} offers waiting` : 'Offer waiting'} · {money(spons.offers[0].annual, false)} a year</div></div><button className="btn small go">Review</button></div>}
              {spons.deals.map((d) => <div key={d.id} className="attn"><div><div className="t">{d.name}</div><div className="d">{money(d.annual, false)} a year · {d.eventsThisYear}/{d.minEvents} shows this year · {d.weeksLeft} weeks left</div></div></div>)}
            </>
          )}
          <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>{spons.slots.used} of {spons.slots.max} sponsor slots in use.</p>
        </Section>
      </div>
    </>
  )
}
