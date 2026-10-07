import { useMemo } from 'react'
import { eventMediaView, offersList } from '../../engine/media/views'
import { useGame } from '../../store/gameStore'
import { compactNumber, money } from '../format'
import { OfferCard } from '../screens/MediaScreen'
import { StoryCard, Stat, useOpenStory } from './MediaBits'

/** What the press and the broadcasters make of a show: before it (interest, hype, offers) and after (reaction). */
export function EventMediaPanel({ eventId, mine, open }: { eventId: string; mine: boolean; open: boolean }) {
  const game = useGame((s) => s.game)!
  const mediaDo = useGame((s) => s.mediaDo)
  const openStory = useOpenStory()
  const m = useMemo(() => eventMediaView(game, eventId), [game, eventId])
  const offers = useMemo(() => offersList(game, eventId).filter((o) => o.status === 'open'), [game, eventId])
  if (!m) return null
  const r = m.reaction
  return (
    <section className="em" aria-label="Media" data-testid="event-media">
      <div className="fm-head"><h2 className="display">{r ? 'Media reaction' : 'Media'}</h2>{m.deal && <span className="chip gold" data-testid="deal-chip">BROADCAST: {m.deal.shortName}</span>}</div>
      <div className="m-stats">
        <Stat label="Media interest" value={m.interest} sub="of 100" />
        <Stat label="Press hype" value={m.hype} sub={m.hype ? 'from the press conference' : 'no press conference yet'} />
        <Stat label="Broadcast interest" value={m.broadcastInterest} sub={m.offers ? `${m.offers} offer${m.offers === 1 ? '' : 's'}` : 'no offers yet'} />
        {m.expectedAudience !== null && <Stat label="Expected crowd" value={compactNumber(m.expectedAudience)} />}
        {r && <Stat label="Viewers" value={compactNumber(r.viewers)} sub={r.ppvBuys ? `${compactNumber(r.ppvBuys)} PPV buys` : undefined} />}
        {r && <Stat label="Fan reaction" value={r.fanReaction} tone={r.fanReaction === 'POSITIVE' ? 'good' : r.fanReaction === 'NEGATIVE' ? 'red' : undefined} />}
      </div>
      {m.topFight && <p className="dim">Top fight: <b>{m.topFight}</b></p>}
      {m.deal && <p className="em-deal">Broadcast deal with <b>{m.deal.org}</b>: {money(m.deal.guaranteed, false)} guaranteed, {m.deal.territory}, minimum {m.deal.minAudience.toLocaleString('en-GB')} {m.deal.kind === 'ppv' ? 'buys' : 'viewers'}.{mine && open && <> <button className="linkbtn" onClick={() => mediaDo('releaseDeal', eventId)} data-testid="release-deal">Release the deal</button></>}</p>}
      {offers.length > 0 && mine && open && <div data-testid="event-offers">{offers.map((o) => <OfferCard key={o.id} o={o} compact />)}</div>}
      {!r && m.topStory && <><h3 className="m-sec display">Top story</h3><StoryCard s={m.topStory} variant="compact" onOpen={() => openStory(m.topStory!)} /></>}
      {r && (
        <>
          {r.headlines.length > 0 && <><h3 className="m-sec display">Top headlines</h3>{r.headlines.map((s) => <StoryCard key={s.id} s={s} variant="compact" onOpen={() => openStory(s)} />)}</>}
          {r.viral.length > 0 && <p><b className="caps">Viral</b> {r.viral.join(' · ')}</p>}
          {r.rankingChanges.length > 0 && <><h3 className="m-sec display">Ranking changes</h3><ul className="m-done">{r.rankingChanges.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        </>
      )}
    </section>
  )
}
