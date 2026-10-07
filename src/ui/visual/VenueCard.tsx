import { VENUE_KIND_LABEL, venueKind } from '../../assets/registry'
import { nation } from '../../data/nations'
import { formatDay } from '../../engine/calendar'
import type { VenueView } from '../../engine/eventViews'
import { Stars } from '../components/Bits'
import { money } from '../format'
import { VenueImage } from './VenueImage'

const market = (m: number) => (m >= 1.3 ? 'Huge' : m >= 1.05 ? 'Strong' : m >= 0.85 ? 'Average' : 'Small')

/** Venue card: image, capacity, tier, hire cost, production level, home-market strength, availability; locked venues say why. */
export function VenueCard({ v, onClick }: { v: VenueView; onClick?: () => void }) {
  const kind = venueKind(v)
  return (
    <button type="button" className={`v-vcard${v.locked ? ' locked' : ''}`} onClick={onClick} data-venue-id={v.id} data-venue-kind={kind}>
      <span className="v-vcard-img"><VenueImage venue={v} />{v.locked && <span className="v-lock" title={v.locked}>🔒</span>}</span>
      <span className="v-vcard-body">
        <span className="v-vcard-name">{v.name}</span>
        <span className="v-vcard-sub dim">{v.city}, {v.country === 'KSA' ? 'Saudi Arabia' : (nation(v.country)?.name ?? v.country)} · {VENUE_KIND_LABEL[kind]}</span>
        <span className="v-vcard-stats">
          <span><i>Capacity</i><b className="num">{v.capacity.toLocaleString('en-GB')}</b></span>
          <span><i>Hire</i><b className="num">{money(v.hireCost, false)}</b></span>
          <span><i>Production</i><b className="num">{v.production}/5</b></span>
          <span><i>Home market</i><b>{market(v.market)}</b></span>
        </span>
        <span className="v-vcard-foot"><span className="chip">{v.tierLabel}</span><Stars n={v.prestige} />
          {v.locked ? <span className="warn v-vcard-lock">🔒 {v.locked}</span> : <span className="dim">{v.freeDates.length ? `Next free: ${formatDay(v.freeDates[0], false)}` : 'No free Saturdays soon'}</span>}
        </span>
      </span>
    </button>
  )
}
