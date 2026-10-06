import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { sponsorView, type DealView, type OfferView } from '../../engine/sponsors'
import { useGame } from '../../store/gameStore'
import { Meter, Section } from '../components/Bits'
import { money } from '../format'

const VENUE_LABEL: Record<string, string> = { local: 'local hall', regional: 'regional venue', national: 'national venue', arena: 'arena', stadium: 'stadium' }

function Offer({ o }: { o: OfferView }) {
  const accept = useGame((s) => s.sponsorAccept)
  const negotiate = useGame((s) => s.sponsorNegotiate)
  const decline = useGame((s) => s.sponsorDecline)
  const [years, setYears] = useState<1 | 2 | 3>(o.lengths.length > 1 ? 2 : 1)
  const len = o.lengths.find((l) => l.years === years)!
  return (
    <div className="deal offer" data-offer={o.sponsorId}>
      <div className="deal-head"><div><div className="fighter-name">{o.name}{o.kind === 'renewal' && <span className="chip gold" style={{ marginLeft: 8 }}>Renewal</span>}</div><div className="fighter-sub">{o.industry} · expires in {o.weeksLeft} week{o.weeksLeft === 1 ? '' : 's'}</div></div>
        <div className="r"><div className="num" style={{ fontSize: 24 }}>{money(len.annual, false)}<small className="dim"> /yr</small></div><div className="dim" style={{ fontSize: 13 }}>+ {money(o.perEvent, false)} per qualifying show</div></div></div>
      <p className="dim" style={{ fontSize: 13.5, margin: '6px 0' }}>“{o.name} is interested in becoming an official partner of your promotion” — {o.pitch}.</p>
      <ul className="reqs plain">
        <li>At least <b>{o.minEvents}</b> qualifying shows a year — in a {VENUE_LABEL[o.minVenue]} or bigger, with {o.minAudience.toLocaleString('en-GB')}+ in the building.</li>
        <li>Paid quarterly. A sell-out adds a bonus to the per-show fee.</li>
        {o.marketingBonus > 0 && <li>Marketing: +{Math.round(o.marketingBonus * 100)}% campaign effectiveness while the deal runs.</li>}
        <li>Exclusive in <b>{o.industry}</b>: no rival {o.industry} partner.</li>
      </ul>
      <div className="seg" role="radiogroup" aria-label="Contract length" style={{ margin: '8px 0' }}>
        {o.lengths.map((l) => <button key={l.years} type="button" role="radio" aria-checked={years === l.years} onClick={() => setYears(l.years)}>{l.years} year{l.years > 1 ? 's' : ''}</button>)}
      </div>
      <div className="dim" style={{ fontSize: 13 }}>{years} year{years > 1 ? 's' : ''}: {money(len.annual, false)} a year, {money(len.total, false)} in all. Longer deals pay a little more per year, but the price is fixed — if you grow, you cannot re-price.</div>
      {o.blocked && <p className="warn" style={{ fontSize: 13, marginTop: 6 }}>{o.blocked}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button className="btn primary" disabled={!!o.blocked} onClick={() => accept(o.id, years)}>Accept</button>
        <button className="btn ghost" disabled={o.negotiated} title={o.negotiated ? 'They have already given their best terms' : 'Push for better terms — they may refuse, or walk away'} onClick={() => negotiate(o.id)}>Negotiate</button>
        <button className="btn ghost" onClick={() => decline(o.id)}>Decline</button>
      </div>
    </div>
  )
}

function Deal({ d }: { d: DealView }) {
  const behind = d.needed > 0 && d.needed * 5 > d.weeksLeftInYear
  return (
    <div className="deal" data-deal={d.name}>
      <div className="deal-head"><div><div className="fighter-name">{d.name}</div><div className="fighter-sub">{d.industry} · {d.years}-year deal · {d.status === 'active' ? `${d.weeksLeft} weeks left` : d.endReason}</div></div>
        <div className="r"><div className="num" style={{ fontSize: 24 }}>{money(d.annual, false)}<small className="dim"> /yr</small></div><div className="dim" style={{ fontSize: 13 }}>+ {money(d.perEvent, false)} per qualifying show</div></div></div>
      {d.status === 'active' && (
        <div className="deal-grid">
          <div><div className="caps">Relationship</div><Meter value={d.relationship} tone={d.relationship >= 45 ? 'good' : 'gold'} label="Relationship" /><div className="dim" style={{ fontSize: 13 }}>{d.relationshipLabel} ({d.relationship}/100)</div></div>
          <div><div className="caps">Shows this contract year</div><div className={`num ${behind ? 'warn' : ''}`} style={{ fontSize: 20 }}>{d.eventsThisYear} / {d.minEvents}</div><div className="dim" style={{ fontSize: 13 }}>{d.weeksLeftInYear} weeks left in the year · {VENUE_LABEL[d.minVenue]}+, {d.minAudience.toLocaleString('en-GB')}+ crowd</div></div>
          <div><div className="caps">Next payment</div><div className="num" style={{ fontSize: 20 }}>{d.nextPayment ? money(d.nextPayment.amount, false) : '—'}</div><div className="dim" style={{ fontSize: 13 }}>{d.nextPayment ? formatDay(d.nextPayment.day, false) : ''} · paid so far {money(d.earned, false)}</div></div>
        </div>
      )}
      {d.marketingBonus > 0 && <div className="dim" style={{ fontSize: 13, marginTop: 6 }}>Marketing: +{Math.round(d.marketingBonus * 100)}% campaign effectiveness.</div>}
    </div>
  )
}

export function SponsorsScreen() {
  const game = useGame((s) => s.game)!
  const sv = sponsorView(game)
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Sponsors</h1>
          <p className="sub">Standing partners pay you every quarter and for every qualifying show — on top of the one-off sponsor you can sign for each event. They approach as your promotion grows; keep your side of the deal and they stay, and pay more.</p>
        </div>
      </div>
      <div className="kpis" style={{ marginTop: 0 }}>
        <div className="kpi"><div className="caps">Sponsors</div><div className="v num">{sv.slots.used} / {sv.slots.max}</div><div className="s">slots at your tier</div></div>
        <div className="kpi"><div className="caps">Annual run-rate</div><div className="v num">{money(sv.annualRun)}</div><div className="s">contracted, before per-show fees</div></div>
        <div className="kpi"><div className="caps">Earned to date</div><div className="v num">{money(sv.earned)}</div><div className="s">standing sponsors only</div></div>
      </div>

      {sv.offers.length > 0 && <Section title="Offers"><div className="deal-list">{sv.offers.map((o) => <Offer key={o.id} o={o} />)}</div></Section>}

      <Section title="Your sponsors">
        {sv.deals.length === 0 ? <p className="empty">No standing sponsor yet. Run shows, build a name and offers will arrive{sv.offers.length ? ' — one is waiting above.' : '.'}</p> : <div className="deal-list">{sv.deals.map((d) => <Deal key={d.id} d={d} />)}</div>}
      </Section>

      <Section title="Who is out there">
        <p className="dim" style={{ fontSize: 13, marginBottom: 8 }}>Bigger companies want a bigger promotion. This is who will talk to you now, and what it takes to attract the rest.</p>
        <div className="table-wrap"><table className="table stack">
          <thead><tr><th>Sponsor</th><th>Industry</th><th className="r">Annual</th><th className="r">Per show</th><th>Status</th></tr></thead>
          <tbody>{sv.catalog.map((c) => (
            <tr key={c.id} className={c.status === 'locked' ? 'locked-row' : ''}>
              <td className="primary" data-label="Sponsor"><b>{c.name}</b></td><td data-label="Industry" className="dim">{c.industry}</td>
              <td className="r num" data-label="Annual">{money(c.annual, false)}</td><td className="r num" data-label="Per show">{money(c.perEvent, false)}</td>
              <td data-label="Status">{c.status === 'active' ? <span className="chip good">Partner</span> : c.status === 'offered' ? <span className="chip gold">Offer waiting</span> : c.status === 'available' ? <span className="chip">Will talk</span> : <span className="dim" style={{ fontSize: 13 }}>{c.reason}</span>}</td>
            </tr>))}</tbody>
        </table></div>
      </Section>

      {sv.past.length > 0 && <Section title="Past partnerships"><div className="deal-list">{sv.past.map((d) => <Deal key={d.id} d={d} />)}</div></Section>}
    </>
  )
}
